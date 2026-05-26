// Taostats + Bittensor data fetchers.
// Endpoints chosen to mirror Jai's production weekly pipeline
// (/home/Jai/bittensor-weekly/lib/api_refresh.py) — these are the ones
// proven to work and contain the data we need.

const TAOSTATS_BASE = 'https://api.taostats.io';

function authHeaders() {
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) throw new Error('TAOSTATS_API_KEY missing');
  return { Authorization: key, Accept: 'application/json' };
}

async function taoGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TAOSTATS_BASE}${path}${qs ? `?${qs}` : ''}`;
  // Free-tier key throttles Vercel's shared outbound IP harder than direct VPS
  // calls — even sequential bursts of 2-3 sub-second calls trip 429. Retry up
  // to 3 times on 429/5xx (or transport error) with 1.5s, 3.5s waits.
  const waits = [1500, 3500];
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { headers: authHeaders() });
    } catch (e) {
      if (attempt < waits.length) {
        console.warn(`[taostats] ${path} → transport error '${e.message}' (retry ${attempt + 1}/${waits.length} in ${waits[attempt]}ms)`);
        await new Promise((res) => setTimeout(res, waits[attempt]));
        continue;
      }
      throw e;
    }
    if (r.ok) return r.json();
    const body = await r.text();
    const retryable = r.status === 429 || r.status >= 500;
    if (retryable && attempt < waits.length) {
      console.warn(`[taostats] ${path} → ${r.status} (retry ${attempt + 1}/${waits.length} in ${waits[attempt]}ms)`);
      await new Promise((res) => setTimeout(res, waits[attempt]));
      continue;
    }
    console.warn(`[taostats] ${path} → ${r.status}: ${body.slice(0, 200)}`);
    throw new Error(`Taostats ${path} → ${r.status}: ${body.slice(0, 200)}`);
  }
}

// Live TAO/USD price.
export async function getTaoPrice() {
  const j = await taoGet('/api/price/latest/v1', { asset: 'tao' });
  // Response shape: { data: [{ price: "278.19", ... }] }
  const row = j?.data?.[0];
  if (!row) throw new Error('Empty price response');
  return Number(row.price);
}

// All alpha-token holdings for a coldkey, grouped by (netuid, hotkey).
// Returns: [{ netuid, hotkey, shares, alpha, alphaTokens }]
// alphaTokens = alpha / 1e9 (Taostats stores rao = 1e-9 alpha).
export async function getHoldings(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    const j = await taoGet('/api/dtao/coldkey_alpha_shares/latest/v1', {
      coldkey,
      page,
      limit: 200,
    });
    const rows = j?.data || [];
    for (const r of rows) {
      const alpha = Number(r.alpha || 0);
      out.push({
        netuid: r.netuid,
        hotkey: r.hotkey?.ss58,
        shares: r.shares,
        alpha,
        alphaTokens: alpha / 1e9,
        blockNumber: r.block_number,
        timestamp: r.timestamp,
      });
    }
    if (rows.length < 200) break;
    page += 1;
    if (page > 20) break; // safety
  }
  return out;
}

// All delegation events (stake/unstake/move) for a coldkey, used for PnL.
// Returns flattened: [{ timestamp, netuid, action, alpha, tao, taoUsd }]
export async function getDelegationHistory(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    const j = await taoGet('/api/delegation/v1', {
      nominator: coldkey,
      page,
      limit: 200,
    });
    const rows = j?.data || [];
    for (const r of rows) {
      out.push({
        timestamp: r.timestamp,
        blockNumber: r.block_number,
        netuid: r.netuid,
        action: r.action, // 'DELEGATE' | 'UNDELEGATE' | etc
        alpha: Number(r.alpha || 0) / 1e9,
        tao: Number(r.tao || 0) / 1e9,
        taoUsd: r.tao_usd != null ? Number(r.tao_usd) : null,
        hotkey: r.hotkey?.ss58 || r.delegate?.ss58,
        extrinsicId: r.extrinsic_id,
      });
    }
    if (rows.length < 200) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

// Per-validator yield (APY) for one subnet.
// Returns: [{ hotkey, apy1d, apy7d, apy30d }]
export async function getValidatorYield(netuid) {
  const j = await taoGet('/api/dtao/validator/yield/latest/v1', { netuid });
  const rows = j?.data || [];
  return rows.map((r) => ({
    hotkey: r.hotkey?.ss58,
    name: r.name,
    apy1h: r.one_hour_apy != null ? Number(r.one_hour_apy) : null,
    apy1d: r.one_day_apy != null ? Number(r.one_day_apy) : null,
    apy7d: r.seven_day_apy != null ? Number(r.seven_day_apy) : null,
    apy30d: r.thirty_day_apy != null ? Number(r.thirty_day_apy) : null,
  }));
}

// Yield lookup helper: returns APY for a (netuid, hotkey) pair, or subnet
// median if that specific hotkey isn't in the response.
export async function getApyFor(netuid, hotkey) {
  try {
    const rows = await getValidatorYield(netuid);
    const pick = (r) => r.apy30d ?? r.apy7d ?? r.apy1d ?? r.apy1h;
    const m = rows.find((r) => r.hotkey === hotkey);
    if (m) {
      const v = pick(m);
      if (v != null) return v;
    }
    const all = rows.map(pick).filter((v) => v != null).sort((a, b) => a - b);
    if (all.length === 0) return null;
    return all[Math.floor(all.length / 2)]; // median
  } catch {
    return null;
  }
}

// Tax-report rows for a coldkey over the last `days` days.
// Same data source the weekly Bittensor FINAL doc uses (the "Wallet Balances"
// tab is populated from this endpoint via import_transactions.py).
// Standard-plan API key required.
// NB: endpoint ignores `limit` and `page` and always returns the full set
// for the given window — do NOT loop, or transfers will double-count.
export async function getTaxReport(coldkey, days = 365) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return getTaxReportRange(coldkey, start, end);
}

// Tax-report rows for an explicit [start, end] window. The /api/accounting/tax/v1
// endpoint caps each request at 12 calendar months, so callers wanting a wider
// view (e.g. tax-year split across two FYs) must issue one call per FY.
// start/end accept Date objects or YYYY-MM-DD strings.
//
// FREE_PNL=1 reroutes to getTaxReportRangeFree(), which rebuilds the same row
// shape from /api/account/history/v1 + /api/transfer/v1 (both available on the
// FREE Taostats tier). Iter 105 probe confirmed the mixed-semantics
// reconstruction matches paid net_profit to the rao on 30d windows.
//
// NB iter 109: free path now falls back to the OLDEST available history
// snapshot when no row exists ≤ start (the iter-107 regression on young
// coldkeys like subnets 5EKFph…). Transfers in that mode are clipped to the
// effective start (== oldest snapshot ts) so the PnL formula stays internally
// consistent. Still opt-in (FREE_PNL=1) until validated end-to-end on all
// three coldkeys at the prod 365d window.
export async function getTaxReportRange(coldkey, start, end) {
  if (process.env.FREE_PNL === '1') {
    return getTaxReportRangeFree(coldkey, start, end);
  }
  const fmt = (d) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
  const j = await taoGet('/api/accounting/tax/v1', {
    token: 'TAO',
    date_start: fmt(start),
    date_end: fmt(end),
    coldkey,
  });
  return j?.data || [];
}

// Free-tier equivalent of getTaxReportRange. Reconstructs the same row set
// (snapshot rows + transfer_in/transfer_out rows) from /api/account/history/v1
// + /api/transfer/v1 — both available on the FREE Taostats key.
//
// Output shape MUST match paid /api/accounting/tax/v1 so existing consumers
// (lib/report.js → pnlGroundTruth, taxYearSection) don't need to change:
//   - Snapshot row:  { transaction_type: null,  total_balance, date, ... }
//   - Transfer in:   { transaction_type: 'transfer_in',  credit_amount, date }
//   - Transfer out:  { transaction_type: 'transfer_out', debit_amount,  date }
// All amounts in TAO (not rao). Snapshot rows use rootOnly reconstruction
// (balance_free + balance_reserved + balance_staked_root) to mirror paid
// tax/v1's starting_balance semantics — iter 105 probe proved this matches to
// the rao. (Paid tax/v1 is internally inconsistent — excludes alpha-as-tao on
// starting, includes it on current. We mirror that exactly: snapshot rows
// use rootOnly, but current_balance still comes from getLatestBalance() which
// pulls balance_total = full = root + alpha-as-tao.)
//
// daily_income is intentionally NOT populated — free history/v1 doesn't expose
// it. pnlGroundTruth handles `r.daily_income == null` gracefully (dailyIncome
// series is just empty under free mode). A future iter could compute it from
// inter-day balance deltas if needed.
export async function getTaxReportRangeFree(coldkey, start, end) {
  const RAO = 1e9;
  const toDate = (d) => (typeof d === 'string' ? new Date(d) : d);
  const startD = toDate(start);
  const endD = toDate(end);
  const dateStr = (ts) => new Date(ts).toISOString().slice(0, 10);

  // 1. Starting-balance snapshot — latest history row whose timestamp <= start.
  //    Same algorithm as the iter-105 probe. history/v1 returns rows
  //    timestamp-DESC by default, so we walk pages and break the first time we
  //    see a row at or before `start`. Track the OLDEST row seen as a fallback
  //    for young coldkeys whose history doesn't reach back to `start` — iter
  //    107 regressed §2 PnL on the subnets coldkey because that path emitted
  //    no snapshot at all and downstream tagged the report no_balance_snapshots.
  let startingRow = null;
  let oldestSeenRow = null;
  let page = 1;
  outer: while (page <= 20) {
    const j = await taoGet('/api/account/history/v1', {
      address: coldkey,
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      oldestSeenRow = r; // rows are DESC — last one we touch is the oldest.
      const ts = new Date(r.timestamp).getTime();
      if (ts <= startD.getTime()) {
        startingRow = r;
        break outer;
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }

  // Fallback: no row at-or-before `start` → coldkey is younger than the
  // window. Use the oldest available snapshot as the effective baseline.
  // Transfers below are clipped to >= effectiveStart so the PnL formula
  // (current + transfers_out - transfers_in - starting) stays internally
  // consistent — no transfers counted from before the snapshot we're using.
  const usedFallback = !startingRow && !!oldestSeenRow;
  if (usedFallback) startingRow = oldestSeenRow;
  const effectiveStartMs = startingRow
    ? new Date(startingRow.timestamp).getTime()
    : startD.getTime();

  const out = [];
  if (startingRow) {
    const rootOnlyTao =
      (Number(startingRow.balance_free || 0) +
        Number(startingRow.balance_reserved || 0) +
        Number(startingRow.balance_staked_root || 0)) /
      RAO;
    out.push({
      transaction_type: null,
      total_balance: rootOnlyTao,
      date: dateStr(startingRow.timestamp),
      timestamp: startingRow.timestamp,
      // daily_income intentionally omitted — see fn comment.
      _source: usedFallback ? 'free:history/v1@rootOnly:fallback-oldest' : 'free:history/v1@rootOnly',
    });
  }

  // 2. Transfer rows in [effectiveStart, end]. Clipping to effectiveStart
  // (not the requested start) keeps PnL consistent when the snapshot fell
  // back to oldest-available — see usedFallback above.
  page = 1;
  const transferRows = [];
  while (page <= 20) {
    const j = await taoGet('/api/transfer/v1', {
      address: coldkey,
      timestamp_start: Math.floor(effectiveStartMs / 1000),
      timestamp_end: Math.floor(endD.getTime() / 1000),
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const t of rows) {
      const amountTao = Number(t.amount || 0) / RAO;
      const to = t.to?.ss58 || t.to;
      const from = t.from?.ss58 || t.from;
      const ts = t.timestamp;
      if (to === coldkey) {
        transferRows.push({
          transaction_type: 'transfer_in',
          credit_amount: amountTao,
          date: ts ? dateStr(ts) : null,
          timestamp: ts,
          _source: 'free:transfer/v1',
        });
      } else if (from === coldkey) {
        transferRows.push({
          transaction_type: 'transfer_out',
          debit_amount: amountTao,
          date: ts ? dateStr(ts) : null,
          timestamp: ts,
          _source: 'free:transfer/v1',
        });
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }

  // Ascending by date — consumer (pnlGroundTruth) expects ascending.
  transferRows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return [...out, ...transferRows];
}

// Daily balance series for a coldkey (ascending by date). Same endpoint as
// getLatestBalance but paginated — used for drawdown / peak / volatility math
// on §2. Caps at `days` days of history; one row per snapshot (typically daily).
export async function getBalanceHistory(coldkey, days = 365) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const RAO = 1e9;
  const out = [];
  let page = 1;
  const limit = 200;
  while (true) {
    let j;
    try {
      j = await taoGet('/api/account/history/v1', {
        address: coldkey,
        limit,
        page,
      });
    } catch (e) {
      // Mid-pagination failure: if page 1 already succeeded we have enough
      // data for §2 drawdown/vol math — return partial instead of throwing
      // away the whole series. Only re-throw if even page 1 failed.
      if (page === 1) throw e;
      console.warn(`[taostats] balance-history page ${page} failed (${e.message}); returning partial ${out.length} rows`);
      break;
    }
    const rows = j?.data || [];
    if (rows.length === 0) break;
    let hitCutoff = false;
    for (const r of rows) {
      const ts = r.timestamp;
      if (!ts) continue;
      const ms = new Date(ts).getTime();
      if (ms < cutoffMs) {
        hitCutoff = true;
        continue;
      }
      out.push({
        timestamp: ts,
        totalTao: Number(r.balance_total || 0) / RAO,
        stakedTao: Number(r.balance_staked || 0) / RAO,
      });
    }
    if (hitCutoff || rows.length < limit) break;
    page += 1;
    if (page > 10) break; // safety — 10 pages * 200 = 2000 snapshots max
  }
  out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return out;
}

// Latest staked + total balance for a coldkey, used as "Current portfolio (TAO)"
// in the FINAL doc's profit formula. Mirrors latest_staked() in wallet_balances.py.
export async function getLatestBalance(coldkey) {
  const j = await taoGet('/api/account/history/v1', {
    address: coldkey,
    limit: 1,
    page: 1,
  });
  const rec = j?.data?.[0];
  if (!rec) return null;
  const RAO = 1e9;
  return {
    stakedTao: Number(rec.balance_staked || 0) / RAO,
    totalTao: Number(rec.balance_total || 0) / RAO,
    snapshotAt: rec.timestamp,
  };
}

// tao.app subnet screener — per-subnet alpha price + 1h/1d/7d/1m %, volume,
// market cap. This is the source of truth for "what is my alpha worth in TAO"
// and for §6 broader market movers.
const TAOAPP_BASE = 'https://api.tao.app';

export async function getSubnetScreener() {
  const key = process.env.TAOAPP_API_KEY;
  const headers = { Accept: 'application/json' };
  if (key) headers['x-api-key'] = key;
  const r = await fetch(`${TAOAPP_BASE}/api/beta/subnet_screener`, { headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`tao.app screener → ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || []);
  // Index by netuid for quick lookup, but also return the raw list.
  const byNetuid = {};
  for (const r of rows) {
    if (r.netuid != null) byNetuid[r.netuid] = r;
  }
  return { rows, byNetuid };
}
