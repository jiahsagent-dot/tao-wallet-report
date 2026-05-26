// Research probe for iter-47 priority 1: prove we can rebuild the PnL number
// Taostats /api/accounting/tax/v1 returns (paid Standard plan) from primitive
// endpoints that are available on the FREE tier.
//
// PnL formula (from the weekly Bittensor FINAL doc + production-scheduler):
//   net_profit_tao = current_balance + transfers_out - transfers_in - starting_balance
//
// Plan:
//   1. Call /api/accounting/tax/v1 for the coldkey over [start, end] → record
//      the synthesised baseline (net_profit, current_balance, starting_balance,
//      transfers_in, transfers_out) per row.
//   2. Rebuild each field from primitives:
//        - current_balance  ← /api/account/history/v1?address=…&limit=1
//        - starting_balance ← /api/account/history/v1 page until timestamp <= start
//        - transfers_in/out ← /api/transfer/v1?address=…&timestamp_start=…
//   3. Print side-by-side + delta. Anything > 0.001τ is a real divergence.
//
// Usage:
//   TAOSTATS_API_KEY=tao-… COLDKEY=5G… DAYS=30 node scripts/research-free-pnl.mjs
//
// NB: not wired into the app. This is a CLI probe to validate the free-tier
// reconstruction methodology before any swap in lib/taostats.js. If/when the
// derived numbers match the paid baseline within tolerance, the next iter can
// migrate getTaxReport() to call these primitives and drop the paid dep.

const BASE = 'https://api.taostats.io';
const RAO = 1e9;

function authHeaders() {
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) {
    console.error('TAOSTATS_API_KEY missing.');
    process.exit(1);
  }
  return { Authorization: key, Accept: 'application/json' };
}

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const waits = [1500, 3500];
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: authHeaders() });
    if (r.ok) return r.json();
    const body = await r.text();
    const retryable = r.status === 429 || r.status >= 500;
    if (retryable && attempt < waits.length) {
      console.warn(`[probe] ${path} → ${r.status} (retry in ${waits[attempt]}ms)`);
      await new Promise((res) => setTimeout(res, waits[attempt]));
      continue;
    }
    throw new Error(`${path} → ${r.status}: ${body.slice(0, 200)}`);
  }
}

// Paid baseline. The /api/accounting/tax/v1 endpoint does NOT return an
// aggregate row — it returns daily balance snapshots interleaved with
// transaction rows (transfer_in / transfer_out / token_swap / …). The app
// (lib/report.js → pnlGroundTruth) aggregates them the same way we do here:
//   starting_balance = first row in window with total_balance != null
//   current_balance  = LATEST history snapshot (getLatestBalance)
//   transfers_in     = sum of credit_amount where transaction_type=='transfer_in'
//   transfers_out    = sum of debit_amount where transaction_type=='transfer_out'
//   net_profit       = current + transfer_out - transfer_in - starting
async function paidBaseline(coldkey, start, end, freeCurrentBalance) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const j = await get('/api/accounting/tax/v1', {
    token: 'TAO',
    date_start: fmt(start),
    date_end: fmt(end),
    coldkey,
  });
  const rows = j?.data || [];
  let startingBalance = null;
  let transfersIn = 0;
  let transfersOut = 0;
  for (const r of rows) {
    const t = r.transaction_type;
    if (t === 'transfer_in') {
      transfersIn += Number(r.credit_amount || 0);
    } else if (t === 'transfer_out') {
      transfersOut += Number(r.debit_amount || 0);
    } else if (!t && r.total_balance != null) {
      if (startingBalance == null) startingBalance = Number(r.total_balance);
    }
  }
  // current_balance from paid path = also history/v1 (paid app does the same).
  // We reuse the free reconstruction's current so the comparison is honest.
  const currentBalance = freeCurrentBalance;
  return {
    current_balance: currentBalance,
    starting_balance: startingBalance ?? 0,
    transfers_in: transfersIn,
    transfers_out: transfersOut,
    net_profit: currentBalance + transfersOut - transfersIn - (startingBalance ?? 0),
    _rowCount: rows.length,
  };
}

// Free-tier reconstruction. Returns BOTH balance variants so we can test the
// iter 104 hypothesis: that paid tax/v1's "starting balance" excludes
// alpha-staked-as-tao. variant=full uses balance_total (free+reserved+staked,
// where staked = root + alpha-as-tao). variant=rootOnly uses
// free + reserved + balance_staked_root (excludes alpha-as-tao).
function balancesFromRow(row) {
  if (!row) return { full: 0, rootOnly: 0 };
  return {
    full: Number(row.balance_total || 0) / RAO,
    rootOnly:
      (Number(row.balance_free || 0) +
        Number(row.balance_reserved || 0) +
        Number(row.balance_staked_root || 0)) /
      RAO,
  };
}

async function freeReconstruct(coldkey, start, end) {
  // Current balance — most recent history row.
  const latestJ = await get('/api/account/history/v1', {
    address: coldkey,
    limit: 1,
    page: 1,
  });
  const latest = latestJ?.data?.[0];
  const currentBalances = balancesFromRow(latest);

  // Starting balance — page history until we cross `start`, take first row at or before it.
  let startingRow = null;
  let page = 1;
  outer: while (page <= 20) {
    const j = await get('/api/account/history/v1', {
      address: coldkey,
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const ts = new Date(r.timestamp).getTime();
      if (ts <= start.getTime()) {
        startingRow = r;
        break outer;
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }
  const startingBalances = balancesFromRow(startingRow);

  // Transfers in/out within [start, end]. /api/transfer/v1 is on free tier.
  let transfersIn = 0;
  let transfersOut = 0;
  page = 1;
  while (page <= 20) {
    const j = await get('/api/transfer/v1', {
      address: coldkey,
      timestamp_start: Math.floor(start.getTime() / 1000),
      timestamp_end: Math.floor(end.getTime() / 1000),
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const t of rows) {
      const amount = Number(t.amount || 0) / RAO;
      const to = t.to?.ss58 || t.to;
      const from = t.from?.ss58 || t.from;
      if (to === coldkey) transfersIn += amount;
      if (from === coldkey) transfersOut += amount;
    }
    if (rows.length < 200) break;
    page += 1;
  }

  // Two reconstructions: balance_total (full) vs free+reserved+staked_root only.
  // iter 105: hypothesis is that paid tax/v1 matches rootOnly variant.
  const full = {
    current_balance: currentBalances.full,
    starting_balance: startingBalances.full,
    transfers_in: transfersIn,
    transfers_out: transfersOut,
    net_profit:
      currentBalances.full + transfersOut - transfersIn - startingBalances.full,
  };
  const rootOnly = {
    current_balance: currentBalances.rootOnly,
    starting_balance: startingBalances.rootOnly,
    transfers_in: transfersIn,
    transfers_out: transfersOut,
    net_profit:
      currentBalances.rootOnly +
      transfersOut -
      transfersIn -
      startingBalances.rootOnly,
  };
  return { full, rootOnly };
}

function fmt(n) {
  return Number(n).toFixed(4).padStart(11);
}

function row3(label, paid, free, rootOnly) {
  const dFull = (free - paid).toFixed(4);
  const dRoot = (rootOnly - paid).toFixed(4);
  const tag = Math.abs(rootOnly - paid) > 0.001 ? '⚠️ ' : '✅ ';
  console.log(
    `${tag}${label.padEnd(18)} paid=${fmt(paid)}τ  full=${fmt(free)}τ (Δ${dFull})  rootOnly=${fmt(rootOnly)}τ (Δ${dRoot})`,
  );
}

async function main() {
  const coldkey = process.env.COLDKEY;
  if (!coldkey) {
    console.error('COLDKEY env var required (e.g. COLDKEY=5G…).');
    process.exit(1);
  }
  const days = Number(process.env.DAYS || 30);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  console.log(`\nProbe: ${coldkey}`);
  console.log(`Window: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)} (${days}d)\n`);

  const { full, rootOnly } = await freeReconstruct(coldkey, start, end);
  // Honest comparison: reuse the full current_balance for paid's current.
  const paid = await paidBaseline(coldkey, start, end, full.current_balance);
  if (paid._rowCount === 0) {
    console.error('Paid tax/v1 returned no rows — aborting.');
    process.exit(1);
  }
  console.log(`Paid tax/v1 rows: ${paid._rowCount}`);
  console.log('3-way comparison (τ) — ✅ = rootOnly variant matches paid within 0.001τ:');
  row3('current_balance', Number(paid.current_balance || 0), full.current_balance, rootOnly.current_balance);
  row3('starting_balance', Number(paid.starting_balance || 0), full.starting_balance, rootOnly.starting_balance);
  row3('transfers_in', Number(paid.transfers_in || 0), full.transfers_in, rootOnly.transfers_in);
  row3('transfers_out', Number(paid.transfers_out || 0), full.transfers_out, rootOnly.transfers_out);
  row3('net_profit', Number(paid.net_profit || 0), full.net_profit, rootOnly.net_profit);

  // iter 105 finding: paid uses ALPHA-as-tao on current but ROOT-only on
  // starting. The "mixed" reconstruction below replicates paid's semantics
  // from free primitives.
  const mixedNet =
    full.current_balance + full.transfers_out - full.transfers_in - rootOnly.starting_balance;
  const mixedDelta = Math.abs(mixedNet - Number(paid.net_profit || 0));
  const mixedTag = mixedDelta < 0.001 ? '✅' : '⚠️';
  console.log('');
  console.log(`Mixed reconstruction (current=full, starting=rootOnly):`);
  console.log(`  net_profit = ${fmt(mixedNet)}τ   paid=${fmt(paid.net_profit)}τ   Δ=${(mixedNet - paid.net_profit).toFixed(6)}  ${mixedTag}`);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
