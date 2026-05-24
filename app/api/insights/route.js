import { NextResponse } from 'next/server';
import { getOrBuildReport } from '../../../lib/report.js';
import { buildInsights, peekCachedInsights } from '../../../lib/ai-insights.js';

export const runtime = 'nodejs';
// Pollinations reasoning model can take 30-45s on long prompts; bump to 60s.
export const maxDuration = 60;

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

// Feature flag: set NEXT_PUBLIC_DISABLE_AI=true on Vercel to kill-switch
// AI insights without a redeploy if any provider goes haywire.
const AI_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AI === 'true';

export async function POST(req) {
  if (AI_DISABLED) {
    return NextResponse.json(
      { available: false, error: 'ai_disabled' },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const coldkey = String(body?.coldkey || '').trim();
  if (!SS58_RE.test(coldkey)) {
    return NextResponse.json(
      { error: 'Invalid SS58 coldkey' },
      { status: 400 },
    );
  }
  const force = body?.force === true;

  // Fast-path: serve cached insights immediately unless the caller forced a
  // refresh. force=true still respects the Pollinations 429 cooldown — we
  // don't want a regenerate button to defeat the rate-limit protection.
  if (!force) {
    const cached = peekCachedInsights(coldkey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  let report;
  try {
    report = await getOrBuildReport(coldkey);
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't fetch report data: ${String(e.message || e).slice(0, 200)}` },
      { status: 502 },
    );
  }

  const insights = await buildInsights(report, { force });
  return NextResponse.json({ ...insights, cached: false });
}
