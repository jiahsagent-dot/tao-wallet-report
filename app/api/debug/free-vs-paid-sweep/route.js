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
  } else {
    row.verdict = 'incomplete';
  }
  return row;
}

// Worst-case verdict: incomplete > divergent > parity (any incomplete bubbles
// up to incomplete; any divergent without incomplete bubbles up to divergent;
// only all-parity is parity).
function rollup(verdicts) {
  if (verdicts.includes('incomplete')) return 'incomplete';
  if (verdicts.includes('divergent')) return 'divergent';
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
    iter: 133,
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
