// Live preview of the weekly subscriber email, embedded as an iframe on /about.
// Renders the *actual* renderEmail(report, insights) output that sends to
// paid subscribers — same brand colours, same AI-Insights card, same PnL
// block — using a public demo coldkey so privacy-conscious visitors don't
// see anyone else's data.
//
// AI insights soft-fail: if Pollinations is throttling, renderEmail omits
// the §0 narrative card cleanly. The email still renders end-to-end.

import { getOrBuildReport } from '../../../lib/report.js';
import { buildInsights } from '../../../lib/ai-insights.js';
import { renderEmail } from '../../../lib/report-email.js';

const DEMO_COLDKEY = '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await getOrBuildReport(DEMO_COLDKEY);
    let insights = null;
    try {
      insights = await buildInsights(report);
    } catch {
      // Soft-fail — renderEmail copes when insights is null.
    }
    const { html } = renderEmail(report, insights);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
        // X-Frame-Options omitted; same-origin embed only by default in
        // modern browsers. /about lives on the same domain.
      },
    });
  } catch (err) {
    return new Response(
      `<!doctype html><html><body style="font:14px ui-sans-serif,sans-serif;color:#8a93a3;padding:24px;background:#0b0e14;margin:0;">Preview temporarily unavailable. ${String(err?.message || '').replace(/[<>&]/g, '')}</body></html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
