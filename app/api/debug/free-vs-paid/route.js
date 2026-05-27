import { NextResponse } from 'next/server';
import {
  getTaxReportRangePaid,
  getTaxReportRangeFree,
  getLatestBalance,
} from '../../../../lib/taostats.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// iter 132: live numeric parity probe — paid /api/accounting/tax/v1 vs
// free-tier rootOnly reconstruction (history/v1 + transfer/v1), same coldkey
// and window, same request. Returns per-field {paid, free, diff,
// within_tolerance} so the FREE_PNL=1 prod flip decision has a one-URL ground
// truth instead of relying on iter 106's deleted one-shot script. Last live
// numeric parity check was iter 106 (mantat 30d, Δ=0.000000τ across all 5
// fields). Iters 109-131 added retention/cache/warmer plumbing but never
// re-validated numeric parity end-to-end after the iter 109 fallback path
// changed the starting-balance reconstruction.
//
// Auth: gated behind FREE_PNL=1 same as /api/debug/free-pnl — preview-only.
// (Preview URLs are not indexed and the response carries no PII.)

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;
const TOLERANCE_TAO = 0.001;

// Inlined version of pnlGroundTruth's row-aggregation loop (lib/report.js
// lines 115-150) — same field semantics, but bound to a specific row set and
// balance instead of fetching them. Both paid + free rows go through this so
// any aggregation skew shows up in the diff, not in the helper.
function aggregate(rows, currentBalanceTao) {
  let transfers_in = 0;
  let transfers_out = 0;
  let starting_balance = null;
  let snapshot_count = 0;
  let transfer_count = 0;
  let first_snapshot_date = null;
  let last_snapshot_date = null;
  let last_snapshot_balance = null;
  for (const r of rows) {
    const t = r.transaction_type;
    if (t === 'transfer_in') {
      transfers_in += Number(r.credit_amount || 0);
      transfer_count += 1;
    } else if (t === 'transfer_out') {
      transfers_out += Number(r.debit_amount || 0);
      transfer_count += 1;
    } else if (!t && r.total_balance != null) {
      const tb = Number(r.total_balance);
      if (starting_balance == null) {
        starting_balance = tb;
        first_snapshot_date = r.date;
      }
      last_snapshot_balance = tb;
      last_snapshot_date = r.date;
      snapshot_count += 1;
    }
  }
  const current_balance = currentBalanceTao;
  const net_profit =
    starting_balance == null
      ? null
      : current_balance + transfers_out - transfers_in - starting_balance;
  return {
    current_balance,
    starting_balance,
    transfers_in,
    transfers_out,
    net_profit,
    snapshot_count,
    transfer_count,
    first_snapshot_date,
    last_snapshot_date,
    last_snapshot_balance,
  };
}

function diffField(paid, free) {
  if (paid == null || free == null) {
    return { paid, free, diff: null, within_tolerance: null };
  }
  const diff = free - paid;
  return {
    paid,
    free,
    diff,
    within_tolerance: Math.abs(diff) <= TOLERANCE_TAO,
  };
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
  const days = Math.max(1, Math.min(730, Number(url.searchParams.get('days') || 30)));
  const endD = new Date();
  const startD = new Date(endD.getTime() - days * 24 * 3600 * 1000);

  const out = {
    iter: 132,
    input: {
      coldkey,
      days,
      startIso: startD.toISOString(),
      endIso: endD.toISOString(),
      tolerance_tao: TOLERANCE_TAO,
    },
  };

  // Shared current balance — paid + free both pull it from the same
  // getLatestBalance() call in production, so any diff in current_balance
  // would be aggregation skew (which row set carries last_snapshot_balance),
  // not a balance fetch race.
  let balance = null;
  try {
    const t0 = Date.now();
    balance = await getLatestBalance(coldkey);
    out.latest_balance = { ok: true, ms: Date.now() - t0, tao: balance?.totalTao ?? null };
  } catch (e) {
    out.latest_balance = { ok: false, error: String(e?.message || e) };
    return NextResponse.json(out);
  }
  const currentBalanceTao = balance?.totalTao;
  if (currentBalanceTao == null) {
    out.error = 'getLatestBalance returned null totalTao';
    return NextResponse.json(out);
  }

  // Sequential — paid and free both hit Taostats, parallel would risk a
  // burst-429 on the shared outbound IP (the same vector iters 121-128 chased).
  try {
    const t0 = Date.now();
    const paidRows = await getTaxReportRangePaid(coldkey, startD, endD);
    out.paid = {
      ok: true,
      ms: Date.now() - t0,
      row_count: paidRows.length,
      ...aggregate(paidRows, currentBalanceTao),
    };
  } catch (e) {
    out.paid = { ok: false, error: String(e?.message || e) };
  }

  try {
    const t0 = Date.now();
    const freeRows = await getTaxReportRangeFree(coldkey, startD, endD);
    const agg = aggregate(freeRows, currentBalanceTao);
    out.free = {
      ok: true,
      ms: Date.now() - t0,
      row_count: freeRows.length,
      ...agg,
      first_snapshot_source: freeRows.find((r) => !r.transaction_type)?._source || null,
    };
  } catch (e) {
    out.free = { ok: false, error: String(e?.message || e) };
  }

  if (out.paid?.ok && out.free?.ok) {
    out.diff = {
      current_balance: diffField(out.paid.current_balance, out.free.current_balance),
      starting_balance: diffField(out.paid.starting_balance, out.free.starting_balance),
      transfers_in: diffField(out.paid.transfers_in, out.free.transfers_in),
      transfers_out: diffField(out.paid.transfers_out, out.free.transfers_out),
      net_profit: diffField(out.paid.net_profit, out.free.net_profit),
    };
    out.verdict = Object.values(out.diff).every((d) => d.within_tolerance === true)
      ? 'parity'
      : 'divergent';
  } else {
    out.verdict = 'incomplete';
  }

  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
