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
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Taostats ${path} → ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
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
  const fmt = (d) => d.toISOString().slice(0, 10);
  const j = await taoGet('/api/accounting/tax/v1', {
    token: 'TAO',
    date_start: fmt(start),
    date_end: fmt(end),
    coldkey,
  });
  return j?.data || [];
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
    const j = await taoGet('/api/account/history/v1', {
      address: coldkey,
      limit,
      page,
    });
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
