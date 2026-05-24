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
    apy1h: r.apy_1_hour != null ? Number(r.apy_1_hour) : null,
    apy1d: r.apy_1_day != null ? Number(r.apy_1_day) : null,
    apy7d: r.apy_7_day != null ? Number(r.apy_7_day) : null,
    apy30d: r.apy_30_day != null ? Number(r.apy_30_day) : null,
  }));
}

// Yield lookup helper: returns APY for a (netuid, hotkey) pair or null.
export async function getApyFor(netuid, hotkey) {
  try {
    const rows = await getValidatorYield(netuid);
    const m = rows.find((r) => r.hotkey === hotkey);
    if (!m) return null;
    return m.apy30d ?? m.apy7d ?? m.apy1d ?? m.apy1h;
  } catch {
    return null;
  }
}
