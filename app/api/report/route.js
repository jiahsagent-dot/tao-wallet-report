import { NextResponse } from 'next/server';
import { buildReport } from '../../../lib/report.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Bittensor SS58 addresses are 48 chars, prefix '5', base58 alphabet.
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

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

  try {
    const report = await buildReport(coldkey);
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
