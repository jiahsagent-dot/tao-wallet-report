import { NextResponse } from 'next/server';
import { buildReport } from '../../../lib/report.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Bittensor SS58 addresses are 48 chars, prefix '5', base58 alphabet.
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

// In-memory cache keyed by coldkey. Survives warm invocations on a single
// Vercel function instance — cold starts wipe it, which is fine. Bursts on
// the same coldkey (e.g. someone hitting refresh, or a thread sharing one
// address) skip the ~5s of Taostats fetches.
const CACHE_TTL_MS = 5 * 60 * 1000;
const reportCache = globalThis.__reportCache || (globalThis.__reportCache = new Map());

function cacheGet(coldkey) {
  const entry = reportCache.get(coldkey);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    reportCache.delete(coldkey);
    return null;
  }
  return entry.data;
}

function cacheSet(coldkey, data) {
  reportCache.set(coldkey, { at: Date.now(), data });
  // Cap cache at 100 entries (cheap LRU — drop oldest if over)
  if (reportCache.size > 100) {
    const firstKey = reportCache.keys().next().value;
    reportCache.delete(firstKey);
  }
}

// Per-IP rate limit: 5 requests / 60s window. In-memory + per-instance, so
// not a hard guarantee under multi-instance bursts — but cheap insurance
// against trivial abuse (a single script hammering one URL). Bypassed for
// cached responses (those don't hit Taostats anyway).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateBuckets = globalThis.__rateBuckets || (globalThis.__rateBuckets = new Map());

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, recent);
    return { limited: true, retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  // Trim cache to prevent unbounded growth
  if (rateBuckets.size > 500) {
    const firstKey = rateBuckets.keys().next().value;
    rateBuckets.delete(firstKey);
  }
  return { limited: false };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const coldkey = (body?.coldkey || '').trim();
  if (!coldkey) {
    return NextResponse.json({ error: 'Missing coldkey' }, { status: 400 });
  }
  if (!SS58_RE.test(coldkey)) {
    return NextResponse.json(
      { error: 'Invalid SS58 address — Bittensor coldkeys start with 5 and are 48 chars.' },
      { status: 400 }
    );
  }

  const cached = cacheGet(coldkey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // Only rate-limit on cache miss — cached responses are free.
  const ip = clientIp(req);
  const rl = isRateLimited(ip);
  if (rl.limited) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT_MAX} requests / minute. Retry in ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const report = await buildReport(coldkey);
    cacheSet(coldkey, report);
    return NextResponse.json(report);
  } catch (e) {
    console.error('buildReport failed:', e);
    return NextResponse.json(
      { error: 'Report build failed', detail: String(e?.message || e).slice(0, 300) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'POST { "coldkey": "5..." } to get a wallet report.',
  });
}
