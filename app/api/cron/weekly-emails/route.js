import { NextResponse } from 'next/server';
import { select, update } from '../../../../lib/supabase.js';
import { buildReport } from '../../../../lib/report.js';
import { buildInsights } from '../../../../lib/ai-insights.js';
import { renderEmail } from '../../../../lib/report-email.js';
import { sendEmail } from '../../../../lib/email.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

// Vercel cron hits this Monday 09:00 UTC. Auth via CRON_SECRET in the
// Authorization header (Vercel sends it automatically for cron triggers).
// Manual triggers must pass ?secret=... matching CRON_SECRET.
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const nowIso = new Date().toISOString();
  const sixDaysAgoIso = new Date(Date.now() - SIX_DAYS_MS).toISOString();

  // Pick active subscribers (not expired) who haven't been emailed in the
  // last 6 days. Batch capped at 3 — ~5s report build + ~20s AI insights
  // per subscriber stays under the 60s function budget. The cron fires
  // every Monday 09:00 UTC so a single small batch suffices for now; if
  // the subscriber count grows past ~20 we'll need to parallelize or
  // shard across multiple cron schedules.
  const subscribers = await select('tao_subscribers', {
    filters: [
      `expires_at=gt.${nowIso}`,
      `or=(last_email_sent_at.is.null,last_email_sent_at.lt.${sixDaysAgoIso})`,
    ],
    limit: 3,
    order: 'paid_at.asc',
  });

  const results = [];
  for (const sub of subscribers) {
    if (!sub.coldkey) {
      results.push({ email: sub.email, skipped: 'no coldkey' });
      continue;
    }
    try {
      const report = await buildReport(sub.coldkey);
      report.subscriberExpiresAt = sub.expires_at;
      // Best-effort AI narrative — soft-fail keeps the email going if the
      // provider is down. ~20s on Pollinations cache miss, instant on hit.
      let insights = null;
      try {
        insights = await buildInsights(report);
      } catch (e) {
        console.error('weekly-emails insights:', sub.email, e);
      }
      const { html, text } = renderEmail(report, insights);
      const profit = report.pnlGroundTruth?.available
        ? `${report.pnlGroundTruth.profitTao >= 0 ? '+' : ''}${report.pnlGroundTruth.profitTao.toFixed(3)} τ`
        : 'PnL';
      const subject = `Your weekly Tao Wallet Report — ${profit}`;
      const info = await sendEmail({ to: sub.email, subject, html, text });
      await update('tao_subscribers', [`email=eq.${encodeURIComponent(sub.email)}`], {
        last_email_sent_at: new Date().toISOString(),
      });
      results.push({
        email: sub.email,
        sent: true,
        messageId: info.messageId,
        aiInsights: insights?.available ? insights.provider : 'unavailable',
      });
    } catch (e) {
      console.error('weekly-emails:', sub.email, e);
      results.push({ email: sub.email, error: String(e?.message || e).slice(0, 200) });
    }
  }

  return NextResponse.json({
    processed: subscribers.length,
    results,
    nextEligibleBatchAt: new Date(Date.now() + SIX_DAYS_MS).toISOString(),
  });
}
