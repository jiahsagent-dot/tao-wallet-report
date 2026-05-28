import { NextResponse } from 'next/server';
import {
  getTaxReportRangePaid,
  getTaxReportRangeFree,
  getLatestBalance,
} from '../../../../lib/taostats.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// iter 133: multi-window × multi-coldkey parity sweep. iter 132 verified parity
// at one (coldkey, days=30) point — but free-tier history/v1 only retains ~170
// days (iter 109 finding), so the iter-109 fallback-oldest path only fires
// when the requested window exceeds retention. A single 30d sample tells us
// nothing about how parity behaves at the 365d window the app actually ships
// to users by default. This endpoint runs the iter-132 probe across the
// production-relevant window grid {30, 90, 180, 365} and (optionally) across
// every coldkey in FREE_PNL_WARM_COLDKEYS, returning the full matrix plus a
// top-level worst_verdict so the FREE_PNL=1 prod flip decision has full-matrix
// derisk, not point-estimate derisk.
//
// iter 134: divergent-by-retention reclassification. iter 133 surfaced a 2.556τ
// divergence at 180d on the subnets coldkey, but on inspection it's a
// window-mismatch artifact, not a math bug: free's effective window is ~168d
// (capped by history/v1 retention), so free is computing PnL-since-snapshot
// while paid is computing PnL-over-180d. Comparing those numbers directly is
// apples-to-oranges. iter 134 detects when fallback-oldest fired and runs a
// SECOND paid call at free's effective window (windowStart = first_snapshot_date)
// — if THAT comparison shows parity, free's reconstruction is honest for the
// window it can see and the divergence is just relabeling. New verdict tier
// `divergent-by-retention` separates "free is buggy" from "free is honestly
// answering a different question because the API can't see further back".
//
// Sequential by design — the iter-121/124/127 burst-429 vector means even
// paid/free in parallel within one request can rate-limit on Vercel's shared
// outbound IP. 4 windows × N coldkeys × 2 paths is run strictly serially.
//
// Auth: FREE_PNL=1-gated same as the iter-132 probe and iter-123 diagnostic —
// preview-only, 404s in prod.

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;
const TOLERANCE_TAO = 0.001;
const DEFAULT_WINDOWS_DAYS = [30, 90, 180, 365];

function aggregate(rows, currentBalanceTao) {
  let transfers_in = 0;
  let transfers_out = 0;
  let starting_balance = null;
  let snapshot_count = 0;
  let transfer_count = 0;
  let first_snapshot_date = null;
  let last_snapshot_date = null;
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

async function probeOne(coldkey, days, currentBalanceTao) {
  const endD = new Date();
  const startD = new Date(endD.getTime() - days * 24 * 3600 * 1000);
  const row = {
    days,
    startIso: startD.toISOString(),
    endIso: endD.toISOString(),
  };
  try {
    const t0 = Date.now();
    const paidRows = await getTaxReportRangePaid(coldkey, startD, endD);
    row.paid = {
      ok: true,
      ms: Date.now() - t0,
      row_count: paidRows.length,
      ...aggregate(paidRows, currentBalanceTao),
    };
  } catch (e) {
    row.paid = { ok: false, error: String(e?.message || e) };
  }
  try {
    const t0 = Date.now();
    const freeRows = await getTaxReportRangeFree(coldkey, startD, endD);
    row.free = {
      ok: true,
      ms: Date.now() - t0,
      row_count: freeRows.length,
      ...aggregate(freeRows, currentBalanceTao),
      first_snapshot_source: freeRows.find((r) => !r.transaction_type)?._source || null,
    };
  } catch (e) {
    row.free = { ok: false, error: String(e?.message || e) };
  }
  if (row.paid?.ok && row.free?.ok) {
    row.diff = {
      current_balance: diffField(row.paid.current_balance, row.free.current_balance),
      starting_balance: diffField(row.paid.starting_balance, row.free.starting_balance),
      transfers_in: diffField(row.paid.transfers_in, row.free.transfers_in),
      transfers_out: diffField(row.paid.transfers_out, row.free.transfers_out),
      net_profit: diffField(row.paid.net_profit, row.free.net_profit),
    };
    row.verdict = Object.values(row.diff).every((d) => d.within_tolerance === true)
      ? 'parity'
      : 'divergent';

    // iter 134: when fallback-oldest fired on the free path AND the verdict is
    // divergent, the divergence may just be a window-mismatch (free is computing
    // PnL-since-snapshot, paid is computing PnL-over-requested-window). Re-run
    // paid at free's effective window (windowStart = first_snapshot_date) to
    // test like-for-like. If THAT comparison shows parity, free's reconstruction
    // is honest for the window it can actually see — reclassify as
    // divergent-by-retention so the FREE_PNL=1 flip decision isn't blocked by
    // what is effectively a labeling artifact.
    const fallbackFired = (row.free.first_snapshot_source || '').includes('fallback-oldest');
    if (row.verdict === 'divergent' && fallbackFired && row.free.first_snapshot_date) {
      try {
        const narrowStartD = new Date(row.free.first_snapshot_date);
        if (!Number.isNaN(narrowStartD.getTime())) {
          const t0 = Date.now();
          const narrowPaidRows = await getTaxReportRangePaid(coldkey, narrowStartD, endD);
          const narrowAgg = aggregate(narrowPaidRows, currentBalanceTao);
          const narrowDiff = {
            current_balance: diffField(narrowAgg.current_balance, row.free.current_balance),
            starting_balance: diffField(narrowAgg.starting_balance, row.free.starting_balance),
            transfers_in: diffField(narrowAgg.transfers_in, row.free.transfers_in),
            transfers_out: diffField(narrowAgg.transfers_out, row.free.transfers_out),
            net_profit: diffField(narrowAgg.net_profit, row.free.net_profit),
          };
          const narrowParity = Object.values(narrowDiff).every((d) => d.within_tolerance === true);
          row.paid_at_free_window = {
            ok: true,
            ms: Date.now() - t0,
            days: Math.round((endD.getTime() - narrowStartD.getTime()) / (24 * 3600 * 1000)),
            startIso: narrowStartD.toISOString(),
            row_count: narrowPaidRows.length,
            ...narrowAgg,
            diff: narrowDiff,
            parity: narrowParity,
          };
          if (narrowParity) {
            row.verdict = 'divergent-by-retention';
          }
        }
      } catch (e) {
        row.paid_at_free_window = { ok: false, error: String(e?.message || e) };
      }
    }
  } else {
    row.verdict = 'incomplete';
  }
  return row;
}

// Worst-case verdict: incomplete > divergent > divergent-by-retention > parity.
// iter 134 adds divergent-by-retention — free's reconstruction is internally
// consistent for the window it can see (paid agrees when re-run at the same
// effective window), the divergence is purely free-tier API retention truncating
// the requested window. Treat it as "honest, just answering a shorter question"
// — load-bearing for the FREE_PNL=1 flip decision.
function rollup(verdicts) {
  if (verdicts.includes('incomplete')) return 'incomplete';
  if (verdicts.includes('divergent')) return 'divergent';
  if (verdicts.includes('divergent-by-retention')) return 'divergent-by-retention';
  return 'parity';
}

function parseConfiguredColdkeys() {
  const raw = process.env.FREE_PNL_WARM_COLDKEYS || '';
  return raw.split(',').map((s) => s.trim()).filter((s) => SS58_RE.test(s));
}

function parseWindows(url) {
  const raw = url.searchParams.get('days');
  if (!raw) return DEFAULT_WINDOWS_DAYS;
  const parts = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 730);
  return parts.length ? parts : DEFAULT_WINDOWS_DAYS;
}

export async function GET(req) {
  if (process.env.FREE_PNL !== '1') {
    return new NextResponse('not found', { status: 404 });
  }

  const url = new URL(req.url);
  const explicitColdkey = url.searchParams.get('coldkey');
  let coldkeys;
  if (explicitColdkey) {
    if (!SS58_RE.test(explicitColdkey)) {
      return NextResponse.json(
        { error: 'invalid ?coldkey (must be SS58)' },
        { status: 400 },
      );
    }
    coldkeys = [explicitColdkey];
  } else {
    coldkeys = parseConfiguredColdkeys();
    if (!coldkeys.length) {
      return NextResponse.json(
        { error: 'no ?coldkey passed and FREE_PNL_WARM_COLDKEYS is unset/invalid' },
        { status: 400 },
      );
    }
  }
  const windowsDays = parseWindows(url);

  const out = {
    iter: 134,
    input: {
      coldkeys,
      windows_days: windowsDays,
      tolerance_tao: TOLERANCE_TAO,
    },
    coldkey_count: coldkeys.length,
    window_count: windowsDays.length,
  };

  const t0 = Date.now();
  const results = [];
  for (const coldkey of coldkeys) {
    const ck = { coldkey };
    let balance = null;
    try {
      const tb = Date.now();
      balance = await getLatestBalance(coldkey);
      ck.latest_balance = { ok: true, ms: Date.now() - tb, tao: balance?.totalTao ?? null };
    } catch (e) {
      ck.latest_balance = { ok: false, error: String(e?.message || e) };
      ck.windows = [];
      ck.worst_verdict = 'incomplete';
      results.push(ck);
      continue;
    }
    const currentBalanceTao = balance?.totalTao;
    if (currentBalanceTao == null) {
      ck.error = 'getLatestBalance returned null totalTao';
      ck.windows = [];
      ck.worst_verdict = 'incomplete';
      results.push(ck);
      continue;
    }
    const windows = [];
    for (const days of windowsDays) {
      windows.push(await probeOne(coldkey, days, currentBalanceTao));
    }
    ck.windows = windows;
    ck.worst_verdict = rollup(windows.map((w) => w.verdict));
    results.push(ck);
  }

  out.results = results;
  out.worst_verdict = rollup(results.map((r) => r.worst_verdict));
  out.ms_total = Date.now() - t0;

  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
