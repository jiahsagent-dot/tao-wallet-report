import { NextResponse } from 'next/server';
import {
  getTaxReportRangeFree,
  getLatestBalance,
  getBalanceHistory,
  _getHistoryRowsLastSource,
} from '../../../../lib/taostats.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// iter 123: diagnostic endpoint for the free-PnL silent-failure hunt. Vercel's
// runtime log viewer truncates the JSON warning lines iter 119 added, so
// pinpointing whether mantat's `no_tax_data` is a 429-driven empty walk or a
// logic miss inside getTaxReportRangeFree has been guesswork across iters
// 119-122. This endpoint runs the same code path /api/report would and returns
// the internal state as JSON — no log scraping required.
//
// Gated behind FREE_PNL=1 (preview-only env). On production where FREE_PNL is
// unset, this endpoint returns 404. The data it exposes (history row counts,
// snapshot timestamps, transfer counts, ground-truth PnL fields) is no more
// sensitive than what the public /api/report already returns — preview URLs
// are not indexed, and there's no PII in the response.

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

function sample(arr, n) {
  if (!Array.isArray(arr)) return null;
  return arr.slice(0, n);
}

export async function GET(req) {
  if (process.env.FREE_PNL !== '1') {
    return new NextResponse('not found', { status: 404 });
  }

  const url = new URL(req.url);
  const coldkey = url.searchParams.get('coldkey');
  if (!coldkey || !SS58_RE.test(coldkey)) {
    return NextResponse.json(
      { error: 'missing or invalid ?coldkey (must be SS58)' },
      { status: 400 },
    );
  }
  const days = Math.max(1, Math.min(730, Number(url.searchParams.get('days') || 365)));
  const endD = new Date();
  const startD = new Date(endD.getTime() - days * 24 * 3600 * 1000);

  const out = {
    iter: 125,
    input: {
      coldkey,
      days,
      startIso: startD.toISOString(),
      endIso: endD.toISOString(),
    },
    env: {
      free_pnl: process.env.FREE_PNL === '1',
      has_paid_key: !!process.env.TAOSTATS_API_KEY,
      has_free_key: !!process.env.TAOSTATS_API_KEY_FREE,
    },
  };

  // 1. Latest balance — same call getLatestBalance(coldkey) makes inside
  //    pnlGroundTruth. If this returns null we'd ship `no_balance`.
  try {
    const t0 = Date.now();
    const bal = await getLatestBalance(coldkey);
    out.latest_balance = { ok: true, ms: Date.now() - t0, tao: bal };
  } catch (e) {
    out.latest_balance = { ok: false, error: String(e?.message || e) };
  }

  // 2. Tax-report-free — the main suspect. Returns merged snapshot + transfer
  //    rows. Empty merged ⇒ pnlGroundTruth ships `no_tax_data`.
  try {
    const t0 = Date.now();
    const merged = await getTaxReportRangeFree(coldkey, startD, endD);
    const ms = Date.now() - t0;
    const snapshots = merged.filter((r) => r.transaction_type == null);
    const transfersIn = merged.filter((r) => r.transaction_type === 'transfer_in');
    const transfersOut = merged.filter((r) => r.transaction_type === 'transfer_out');
    out.tax_report_free = {
      ok: true,
      ms,
      total_rows: merged.length,
      snapshot_count: snapshots.length,
      transfer_in_count: transfersIn.length,
      transfer_out_count: transfersOut.length,
      first_snapshot: snapshots[0] || null,
      last_snapshot: snapshots[snapshots.length - 1] || null,
      first_snapshot_source: snapshots[0]?._source || null,
      sample_rows_first_3: sample(merged, 3),
      sample_rows_last_3: merged.length > 3 ? merged.slice(-3) : [],
    };
  } catch (e) {
    out.tax_report_free = {
      ok: false,
      error: String(e?.message || e),
      stack: String(e?.stack || '').split('\n').slice(0, 6),
    };
  }

  // 3. Balance history — proxy for getHistoryRowsCached cache health. iter 115
  //    shares the same _historyRowsMemo, so if this returns 0 rows we know the
  //    cache is poisoned/empty for this coldkey.
  try {
    const t0 = Date.now();
    const series = await getBalanceHistory(coldkey, 30);
    out.balance_history_30d = {
      ok: true,
      ms: Date.now() - t0,
      row_count: Array.isArray(series) ? series.length : 0,
      first: Array.isArray(series) && series[0] ? series[0] : null,
      last: Array.isArray(series) && series.length
        ? series[series.length - 1]
        : null,
    };
  } catch (e) {
    out.balance_history_30d = { ok: false, error: String(e?.message || e) };
  }

  // iter 125: expose which layer served the history rows for this request —
  // 'memo' = in-process (warm lambda), 'db' = Supabase tao_taostats_history_cache,
  // 'fetch' = fresh /api/account/history/v1 walk. Lets me verify cross-request
  // cache is actually hitting on the 2nd probe instead of always re-walking.
  out.history_cache = {
    last_source: _getHistoryRowsLastSource(coldkey),
  };

  return NextResponse.json(out);
}
