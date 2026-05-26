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

// Paid baseline (the row we're trying to reproduce without paying).
async function paidTaxRow(coldkey, start, end) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const j = await get('/api/accounting/tax/v1', {
    token: 'TAO',
    date_start: fmt(start),
    date_end: fmt(end),
    coldkey,
  });
  const rows = j?.data || [];
  return rows[0] || null;
}

// Free-tier reconstruction.
async function freeReconstruct(coldkey, start, end) {
  // Current balance — most recent history row.
  const latestJ = await get('/api/account/history/v1', {
    address: coldkey,
    limit: 1,
    page: 1,
  });
  const latest = latestJ?.data?.[0];
  const currentBalanceTao =
    latest ? (Number(latest.balance_total || 0) + Number(latest.balance_staked || 0)) / RAO : 0;

  // Starting balance — page history until we cross `start`, take last row before it.
  let startBalanceTao = 0;
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
        startBalanceTao =
          (Number(r.balance_total || 0) + Number(r.balance_staked || 0)) / RAO;
        break outer;
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }

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

  const netProfitTao =
    currentBalanceTao + transfersOut - transfersIn - startBalanceTao;

  return {
    current_balance: currentBalanceTao,
    starting_balance: startBalanceTao,
    transfers_in: transfersIn,
    transfers_out: transfersOut,
    net_profit: netProfitTao,
  };
}

function diff(label, paid, free) {
  const d = (free - paid).toFixed(6);
  const tag = Math.abs(free - paid) > 0.001 ? '⚠️ ' : '   ';
  console.log(`${tag}${label.padEnd(20)} paid=${String(paid).padStart(14)}  free=${String(free).padStart(14)}  Δ=${d}`);
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

  const paid = await paidTaxRow(coldkey, start, end);
  if (!paid) {
    console.error('Paid tax/v1 returned no rows — aborting.');
    process.exit(1);
  }
  const free = await freeReconstruct(coldkey, start, end);

  console.log('Field comparison (τ):');
  diff('current_balance', Number(paid.current_balance || 0), free.current_balance);
  diff('starting_balance', Number(paid.starting_balance || 0), free.starting_balance);
  diff('transfers_in', Number(paid.transfers_in || 0), free.transfers_in);
  diff('transfers_out', Number(paid.transfers_out || 0), free.transfers_out);
  diff('net_profit', Number(paid.net_profit || 0), free.net_profit);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
