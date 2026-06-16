import { NextResponse } from 'next/server';
import { getOrBuildReport, peekCachedReport, buildAndCacheReport } from '../../../lib/report.js';
import { rpc } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Bittensor SS58 addresses are 48 chars, prefix '5', base58 alphabet.
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

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

  // Accept skipCache from BOTH the JSON body and the URL query string.
  // Iter 166: every verify wake since iter 162 was sending `?skipCache=1` as a
  // URL param and the route only read `body.skipCache`, so the cache was never
  // bypassed and a single poisoned entry (e.g. a 504-timeout result cached
  // under tax_fetch_failed) would silently fail every subsequent smoke until
  // the cache TTL expired. The iter 165 verify "regression" (Subnets
  // tax_fetch_failed across two probes) was this exact failure mode — the
  // underlying app was healthy (39s body-skipCache probe returned
  // verdict=matched immediately). Accept ?skipCache=1 as well so future verify
  // smokes can't be fooled by stale cache.
  const querySkip = (() => {
    try { return new URL(req.url).searchParams.get('skipCache') === '1'; } catch { return false; }
  })();
  // Iter 170 — ?shadow=1 forces the FREE_PNL_SHADOW path for THIS request only,
  // surfacing pnlGroundTruth.shadowFreeApi without touching the Vercel env. We
  // imply skipCache so a cached non-shadow payload doesn't short-circuit the
  // shadow build, and buildAndCacheReport refuses to cache the shadow result
  // (see lib/report.js iter-170 comment) so plain calls afterwards don't read
  // leaked shadow data.
  const queryShadow = (() => {
    try { return new URL(req.url).searchParams.get('shadow') === '1'; } catch { return false; }
  })();
  const skipCache = body?.skipCache === true || querySkip || queryShadow;
  if (!skipCache) {
    const cached = peekCachedReport(coldkey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
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
    const report = skipCache
      ? await buildAndCacheReport(coldkey, { shadow: queryShadow })
      : await getOrBuildReport(coldkey);
    // Fire-and-forget usage bump — don't block the response on it.
    rpc('bump_tao_usage').catch((e) => console.error('bump_tao_usage:', e));
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
