// Report sections — pure(ish) functions that turn Taostats data into the 6
// sections the user sees. All async because each section pulls fresh data;
// no LLM here, only deterministic math and rules.

import {
  getTaoPrice,
  getHoldings,
  getDelegationHistory,
  getApyFor,
  getSubnetScreener,
  getTaxReport,
  getLatestBalance,
  getValidatorYield,
} from './taostats.js';

const USD_TO_AUD_FALLBACK = 1.51;

async function getUsdToAud() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!r.ok) return USD_TO_AUD_FALLBACK;
    const j = await r.json();
    return Number(j?.rates?.AUD) || USD_TO_AUD_FALLBACK;
  } catch {
    return USD_TO_AUD_FALLBACK;
  }
}

function aggregateHoldings(holdings) {
  // Holdings come in as one row per (netuid, hotkey). Sum across hotkeys per
  // subnet to get "your position in subnet N".
  const bySubnet = new Map();
  for (const h of holdings) {
    const k = h.netuid;
    const prev = bySubnet.get(k) || { netuid: k, alphaTokens: 0, hotkeys: [] };
    prev.alphaTokens += h.alphaTokens;
    prev.hotkeys.push({ hotkey: h.hotkey, alphaTokens: h.alphaTokens });
    bySubnet.set(k, prev);
  }
  return [...bySubnet.values()];
}

// §1 PORTFOLIO
export async function portfolio({ holdings, screener, taoPrice, usdAud }) {
  const positions = aggregateHoldings(holdings).map((pos) => {
    const sn = screener.byNetuid[pos.netuid] || {};
    const alphaPriceTao = Number(sn.price || 0);
    const taoValue = pos.alphaTokens * alphaPriceTao;
    return {
      netuid: pos.netuid,
      name: sn.subnet_name || `Subnet ${pos.netuid}`,
      alphaHeld: pos.alphaTokens,
      alphaPriceTao,
      taoValue,
      usdValue: taoValue * taoPrice,
      pct1d: sn.price_1d_pct_change != null ? Number(sn.price_1d_pct_change) : null,
      pct7d: sn.price_7d_pct_change != null ? Number(sn.price_7d_pct_change) : null,
      pct1m: sn.price_1m_pct_change != null ? Number(sn.price_1m_pct_change) : null,
      hotkeys: pos.hotkeys,
    };
  });

  const totalTao = positions.reduce((a, p) => a + p.taoValue, 0);
  const totalUsd = totalTao * taoPrice;
  const totalAud = totalUsd * usdAud;

  positions.sort((a, b) => b.taoValue - a.taoValue);
  const top10 = positions.slice(0, 10).map((p) => ({
    ...p,
    pctOfPortfolio: totalTao > 0 ? (p.taoValue / totalTao) * 100 : 0,
  }));

  return {
    totalTao,
    totalUsd,
    totalAud,
    taoPrice,
    usdAud,
    positionCount: positions.length,
    top10,
    allPositions: positions, // used by other sections
  };
}

// §2a PNL — GROUND TRUTH (matches Jai's weekly Bittensor FINAL doc)
// Same formula the Bittensor Transactions sheet uses on each coldkey tab:
//   profit_tao   = current_portfolio + transfer_out - transfer_in - starting_balance
//   return_pct   = profit_tao / (starting_balance + transfer_in)
// Sourced from /api/accounting/tax/v1 (same data as the Pro UI tax-report CSV)
// + /api/account/history/v1 for current balance.
//
// Why this beats the delegation-events PnL:
//   - Counts external transfers in/out (delegation events miss those)
//   - Uses the wallet's actual end-of-period balance, not the sum of token
//     prices × shares (which drifts ~5-10% from on-chain balance)
//   - Subtracts the pre-window starting balance so wallets that pre-date
//     the window don't look like they earned 20%+ that they didn't
export async function pnlGroundTruth({ coldkey, days, taoPrice, usdAud }) {
  const [rows, balance] = await Promise.all([
    getTaxReport(coldkey, days).catch(() => []),
    getLatestBalance(coldkey).catch(() => null),
  ]);

  if (!rows.length || !balance) {
    return {
      available: false,
      reason: !rows.length ? 'no_tax_data' : 'no_balance',
    };
  }

  let transferInTao = 0;
  let transferOutTao = 0;
  let dailyIncomeTao = 0;
  let startingBalanceTao = null;
  let lastSnapshotBalance = null;
  let firstSnapshotDate = null;
  let lastSnapshotDate = null;
  let snapshotCount = 0;
  let transferCount = 0;

  // Rows come ascending by date — verified empirically against the live API.
  for (const r of rows) {
    const t = r.transaction_type;
    if (t === 'transfer_in') {
      transferInTao += Number(r.credit_amount || 0);
      transferCount += 1;
    } else if (t === 'transfer_out') {
      transferOutTao += Number(r.debit_amount || 0);
      transferCount += 1;
    } else if (!t && r.total_balance != null) {
      const tb = Number(r.total_balance);
      if (startingBalanceTao == null) {
        startingBalanceTao = tb;
        firstSnapshotDate = r.date;
      }
      lastSnapshotBalance = tb;
      lastSnapshotDate = r.date;
      snapshotCount += 1;
      if (r.daily_income != null) dailyIncomeTao += Number(r.daily_income);
    }
  }

  if (startingBalanceTao == null) {
    return { available: false, reason: 'no_balance_snapshots' };
  }

  const currentPortfolioTao = balance.totalTao;
  const profitTao = currentPortfolioTao + transferOutTao - transferInTao - startingBalanceTao;
  const denom = startingBalanceTao + transferInTao;
  const returnPct = denom > 0 ? profitTao / denom : 0;
  const profitUsd = profitTao * taoPrice;
  const profitAud = profitUsd * usdAud;

  return {
    available: true,
    windowDays: days,
    coldkey,
    startingBalanceTao,
    currentPortfolioTao,
    transferInTao,
    transferOutTao,
    profitTao,
    returnPct,
    profitUsd,
    profitAud,
    dailyIncomeTao,
    dailyIncomeUsd: dailyIncomeTao * taoPrice,
    dailyIncomeAud: dailyIncomeTao * taoPrice * usdAud,
    firstSnapshotDate,
    lastSnapshotDate,
    snapshotCount,
    transferCount,
    formula: 'current + transfer_out - transfer_in - starting',
    source: 'taostats /api/accounting/tax/v1',
  };
}

// §2 PNL
// Realised: sum(sold) - sum(spent) from /api/delegation/v1 (excluding netuid=0)
// Unrealised: per-position (current_value - estimated_cost_basis)
// Period changes (24h/7d/30d): for each open position, compute
//   change_tao = alpha * price_now - alpha * (price_now / (1 + pct_change))
// Aggregate across positions.
export async function pnl({ holdings, history, screener, taoPrice, allPositions }) {
  let spentTao = 0;
  let soldTao = 0;
  const bySubnet = new Map(); // netuid -> { spent, sold }
  for (const ev of history) {
    if (ev.netuid === 0) continue; // root staking, not a trade
    const amt = ev.tao || 0;
    const rec = bySubnet.get(ev.netuid) || { spent: 0, sold: 0 };
    if (ev.action === 'DELEGATE') {
      spentTao += amt;
      rec.spent += amt;
    } else if (ev.action === 'UNDELEGATE') {
      soldTao += amt;
      rec.sold += amt;
    }
    bySubnet.set(ev.netuid, rec);
  }

  const currentTao = allPositions.reduce((a, p) => a + p.taoValue, 0);
  const realisedTao = soldTao - spentTao; // negative if more spent than realised
  const totalPnlTao = currentTao + soldTao - spentTao;

  // Period changes — tao.app pct fields are in PERCENT units (e.g. -5.76 means
  // -5.76%, not -576%). Divide by 100 for math.
  // Also clamp to >-99% so pricing math doesn't blow up on dead/tiny subnets.
  const periodChange = (pctKey) => {
    let delta = 0;
    for (const p of allPositions) {
      const pctRaw = p[pctKey];
      if (pctRaw == null || pctRaw === 0) continue;
      const pctDec = Math.max(pctRaw / 100, -0.99);
      const before = p.taoValue / (1 + pctDec);
      delta += p.taoValue - before;
    }
    return delta;
  };
  const change24hTao = periodChange('pct1d');
  const change7dTao = periodChange('pct7d');
  const change30dTao = periodChange('pct1m');

  // Per-subnet breakdown
  const perSubnet = [];
  const subnetMap = new Map(allPositions.map((p) => [p.netuid, p]));
  const allNetuids = new Set([...subnetMap.keys(), ...bySubnet.keys()]);
  for (const nid of allNetuids) {
    const pos = subnetMap.get(nid);
    const tx = bySubnet.get(nid) || { spent: 0, sold: 0 };
    const current = pos?.taoValue || 0;
    perSubnet.push({
      netuid: nid,
      name: pos?.name || `Subnet ${nid}`,
      currentTao: current,
      spentTao: tx.spent,
      soldTao: tx.sold,
      pnlTao: current + tx.sold - tx.spent,
    });
  }
  perSubnet.sort((a, b) => b.pnlTao - a.pnlTao);

  return {
    spentTao,
    soldTao,
    realisedTao,
    currentTao,
    totalPnlTao,
    totalPnlUsd: totalPnlTao * taoPrice,
    change24hTao,
    change24hUsd: change24hTao * taoPrice,
    change7dTao,
    change7dUsd: change7dTao * taoPrice,
    change30dTao,
    change30dUsd: change30dTao * taoPrice,
    perSubnet,
    eventsCount: history.length,
  };
}

// §3 YIELD
export async function yieldSection({ holdings, screener }) {
  // Per-validator yield breakdown: fetch the full validator row set per netuid
  // ONCE, then look up each (netuid, hotkey) holding against that set so the
  // user sees the APY for their actual validator — plus subnet best / median
  // / delta-to-best so they know whether to re-delegate.
  const netuids = [...new Set(holdings.map((h) => h.netuid))];
  const rowsByNetuid = new Map();
  await Promise.all(
    netuids.map(async (nid) => {
      try {
        rowsByNetuid.set(nid, await getValidatorYield(nid));
      } catch {
        rowsByNetuid.set(nid, []);
      }
    }),
  );

  // pick = best available APY window per validator row (prefer 30d for stability)
  const pickApy = (r) => (r ? (r.apy30d ?? r.apy7d ?? r.apy1d ?? r.apy1h) : null);

  // Per-subnet summary (best / median APY) computed once from the full row set.
  const subnetSummary = new Map();
  for (const [nid, rows] of rowsByNetuid) {
    const apys = rows.map(pickApy).filter((v) => v != null).sort((a, b) => a - b);
    if (apys.length === 0) {
      subnetSummary.set(nid, { bestApy: null, medianApy: null, validatorCount: 0 });
      continue;
    }
    subnetSummary.set(nid, {
      bestApy: apys[apys.length - 1],
      medianApy: apys[Math.floor(apys.length / 2)],
      validatorCount: apys.length,
    });
  }

  const subnetName = (nid) => screener?.byNetuid?.[nid]?.subnet_name || `Subnet ${nid}`;

  const perPosition = holdings.map((h) => {
    const rows = rowsByNetuid.get(h.netuid) || [];
    const match = rows.find((r) => r.hotkey === h.hotkey);
    const apy = pickApy(match);
    // Fall back to subnet median when the specific validator isn't in the response.
    const summary = subnetSummary.get(h.netuid) || {};
    const fallback = apy == null ? summary.medianApy ?? null : null;
    const effectiveApy = apy != null ? apy : fallback;
    const deltaToBest =
      effectiveApy != null && summary.bestApy != null ? effectiveApy - summary.bestApy : null;
    return {
      netuid: h.netuid,
      subnetName: subnetName(h.netuid),
      hotkey: h.hotkey,
      validatorName: match?.name || null,
      alphaTokens: h.alphaTokens,
      apy: effectiveApy,
      apyIsFallback: apy == null && fallback != null,
      subnetBestApy: summary.bestApy ?? null,
      subnetMedianApy: summary.medianApy ?? null,
      subnetValidatorCount: summary.validatorCount ?? 0,
      deltaToBest,
    };
  });

  // Portfolio-weighted average (by alphaTokens)
  const totalAlpha = perPosition.reduce((a, p) => a + p.alphaTokens, 0);
  let weighted = 0;
  let weightedTotal = 0;
  for (const p of perPosition) {
    if (p.apy != null) {
      weighted += p.apy * p.alphaTokens;
      weightedTotal += p.alphaTokens;
    }
  }
  const weightedApy = weightedTotal > 0 ? weighted / weightedTotal : null;

  // Best / worst position (among populated)
  const withApy = perPosition.filter((p) => p.apy != null);
  withApy.sort((a, b) => b.apy - a.apy);
  const best = withApy[0] || null;
  const worst = withApy[withApy.length - 1] || null;

  // Delegation opportunities — holdings whose current validator is meaningfully
  // behind the best validator on the same subnet. Threshold: ≥5pp behind AND
  // ≥0.05τ alpha (so we don't flag dust positions). Sorted by potential lift
  // (deltaToBest × alphaTokens) so the highest-impact ones come first.
  const delegationOpportunities = perPosition
    .filter(
      (p) =>
        p.deltaToBest != null &&
        p.deltaToBest <= -0.05 &&
        p.alphaTokens >= 0.05 &&
        !p.apyIsFallback,
    )
    .map((p) => ({
      ...p,
      potentialLiftTaoPerYear: Math.abs(p.deltaToBest) * p.alphaTokens,
    }))
    .sort((a, b) => b.potentialLiftTaoPerYear - a.potentialLiftTaoPerYear);

  // Hypothetical weighted APY if every position re-delegated to its subnet's
  // best validator — gives the user a single "what could you earn" number.
  let bestCaseWeighted = 0;
  let bestCaseTotal = 0;
  for (const p of perPosition) {
    if (p.subnetBestApy != null) {
      bestCaseWeighted += p.subnetBestApy * p.alphaTokens;
      bestCaseTotal += p.alphaTokens;
    }
  }
  const bestCaseWeightedApy = bestCaseTotal > 0 ? bestCaseWeighted / bestCaseTotal : null;
  const liftIfOptimised =
    weightedApy != null && bestCaseWeightedApy != null
      ? bestCaseWeightedApy - weightedApy
      : null;

  return {
    weightedApy,
    bestCaseWeightedApy,
    liftIfOptimised,
    coverage: totalAlpha > 0 ? weightedTotal / totalAlpha : 0,
    perPosition,
    best,
    worst,
    delegationOpportunities,
  };
}

// §4 FLAGS — purely rule-based
export function flags({ portfolio: port, pnl: p }) {
  const out = [];

  // Concentration > 50%
  for (const pos of port.top10) {
    if (pos.pctOfPortfolio > 50) {
      out.push({
        severity: 'high',
        kind: 'concentration',
        netuid: pos.netuid,
        name: pos.name,
        message: `${pos.pctOfPortfolio.toFixed(1)}% of portfolio is in ${pos.name} (subnet ${pos.netuid}). Single-subnet risk is high.`,
      });
    }
  }

  // Position 7d down >30% (pct values are in percent units)
  for (const pos of port.top10) {
    if (pos.pct7d != null && pos.pct7d < -30) {
      out.push({
        severity: 'medium',
        kind: 'price_drop_7d',
        netuid: pos.netuid,
        name: pos.name,
        message: `${pos.name} is down ${pos.pct7d.toFixed(1)}% over 7 days.`,
      });
    }
  }

  // Position 30d down >50%
  for (const pos of port.top10) {
    if (pos.pct1m != null && pos.pct1m < -50) {
      out.push({
        severity: 'high',
        kind: 'price_drop_30d',
        netuid: pos.netuid,
        name: pos.name,
        message: `${pos.name} is down ${pos.pct1m.toFixed(1)}% over 30 days.`,
      });
    }
  }

  // Underwater positions
  for (const ps of p.perSubnet) {
    if (ps.spentTao > 0 && ps.pnlTao < -ps.spentTao * 0.5) {
      out.push({
        severity: 'medium',
        kind: 'underwater',
        netuid: ps.netuid,
        name: ps.name,
        message: `${ps.name}: spent ${ps.spentTao.toFixed(2)} τ, current value ${ps.currentTao.toFixed(2)} τ — ${(((ps.currentTao - ps.spentTao) / ps.spentTao) * 100).toFixed(0)}%.`,
      });
    }
  }

  return out;
}

// §5 RECS — derived from flags
export function recs({ flags: f, portfolio: port, yieldData }) {
  const out = [];
  const seenSubnets = new Set();

  for (const flag of f) {
    if (out.length >= 5) break;
    const key = `${flag.netuid}:${flag.kind}`;
    if (seenSubnets.has(flag.netuid)) continue;

    let action;
    switch (flag.kind) {
      case 'concentration':
        action = `Consider trimming ${flag.name} to under 40% of portfolio to spread risk.`;
        break;
      case 'price_drop_30d':
        action = `Review ${flag.name} thesis. Cut losses or hold for recovery — don't average down without conviction.`;
        break;
      case 'price_drop_7d':
        action = `Watch ${flag.name} closely — short-term weakness may be entry or exit signal.`;
        break;
      case 'underwater':
        action = `Decide on ${flag.name}: re-add at lower cost basis or exit fully and redeploy.`;
        break;
      default:
        action = `Review ${flag.name}.`;
    }

    out.push({
      netuid: flag.netuid,
      observation: flag.message,
      action,
    });
    seenSubnets.add(flag.netuid);
  }

  // Yield-based recommendation if best/worst spread is wide
  if (out.length < 5 && yieldData.best && yieldData.worst && yieldData.best.apy != null && yieldData.worst.apy != null) {
    const spread = yieldData.best.apy - yieldData.worst.apy;
    if (spread > 0.1) {
      out.push({
        netuid: yieldData.worst.netuid,
        observation: `Subnet ${yieldData.worst.netuid} APY ${(yieldData.worst.apy * 100).toFixed(1)}% vs best subnet ${yieldData.best.netuid} at ${(yieldData.best.apy * 100).toFixed(1)}%.`,
        action: `Consider moving stake from subnet ${yieldData.worst.netuid} to higher-yield subnets.`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      netuid: null,
      observation: 'No major rule-based flags detected.',
      action: 'Continue monitoring portfolio weekly.',
    });
  }

  return {
    items: out,
    disclaimer: 'Not financial advice — data-driven flags only.',
  };
}

// §6 BROADER market
export function broader({ screener, taoPrice }) {
  const rows = screener.rows.slice();

  // Top movers by 24h price change (in percent units). Filter out dead subnets
  // with effectively zero volume or zero price (avoids meaningless outliers).
  const isTradeable = (r) => Number(r.total_volume_tao_1d || 0) > 1 && Number(r.price) > 0;
  const sortedBy24h = rows
    .filter((r) => r.price_1d_pct_change != null && isTradeable(r))
    .sort((a, b) => Math.abs(Number(b.price_1d_pct_change)) - Math.abs(Number(a.price_1d_pct_change)))
    .slice(0, 5)
    .map((r) => ({
      netuid: r.netuid,
      name: r.subnet_name || `Subnet ${r.netuid}`,
      priceTao: Number(r.price),
      pct1d: Number(r.price_1d_pct_change), // percent units
      volumeTao24h: Number(r.total_volume_tao_1d || 0),
    }));

  // Top by volume too
  const sortedByVolume = rows
    .filter((r) => r.total_volume_tao_1d != null)
    .sort((a, b) => Number(b.total_volume_tao_1d) - Number(a.total_volume_tao_1d))
    .slice(0, 5)
    .map((r) => ({
      netuid: r.netuid,
      name: r.subnet_name || `Subnet ${r.netuid}`,
      priceTao: Number(r.price),
      pct1d: Number(r.price_1d_pct_change || 0),
      volumeTao24h: Number(r.total_volume_tao_1d),
    }));

  return {
    taoPrice,
    subnetCount: rows.length,
    topMovers24h: sortedBy24h,
    topByVolume24h: sortedByVolume,
  };
}

// Shared in-memory cache. Lives on globalThis so it's per-Vercel-instance
// (cold starts wipe it — fine). Both the /api/report POST handler and the
// /report/<coldkey> SSR page + opengraph-image handler import this so a hit
// in one warms the others — single buildReport call serves the page, the OG
// image, and the API.
const REPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const reportCache = globalThis.__reportCache || (globalThis.__reportCache = new Map());

export function peekCachedReport(coldkey) {
  const entry = reportCache.get(coldkey);
  if (!entry) return null;
  if (Date.now() - entry.at > REPORT_CACHE_TTL_MS) {
    reportCache.delete(coldkey);
    return null;
  }
  return entry.data;
}

export async function getOrBuildReport(coldkey) {
  const cached = peekCachedReport(coldkey);
  if (cached) return cached;
  const data = await buildReport(coldkey);
  reportCache.set(coldkey, { at: Date.now(), data });
  // cheap LRU cap
  if (reportCache.size > 100) {
    const firstKey = reportCache.keys().next().value;
    reportCache.delete(firstKey);
  }
  return data;
}

// Top-level: build all 6 sections for a coldkey.
export async function buildReport(coldkey) {
  // Fetch in parallel where possible.
  const [taoPrice, holdings, history, screener, usdAud] = await Promise.all([
    getTaoPrice(),
    getHoldings(coldkey),
    getDelegationHistory(coldkey),
    getSubnetScreener(),
    getUsdToAud(),
  ]);

  const port = await portfolio({ holdings, screener, taoPrice, usdAud });
  const [p, gt] = await Promise.all([
    pnl({
      holdings,
      history,
      screener,
      taoPrice,
      allPositions: port.allPositions,
    }),
    pnlGroundTruth({ coldkey, days: 365, taoPrice, usdAud }),
  ]);
  const y = await yieldSection({ holdings, screener });
  const f = flags({ portfolio: port, pnl: p });
  const r = recs({ flags: f, portfolio: port, yieldData: y });
  const b = broader({ screener, taoPrice });

  // Drop the heavy internal allPositions from the response
  const { allPositions, ...portClean } = port;

  return {
    coldkey,
    generatedAt: new Date().toISOString(),
    taoPriceUsd: taoPrice,
    usdAud,
    portfolio: portClean,
    pnl: p,
    pnlGroundTruth: gt,
    yield: y,
    flags: f,
    recommendations: r,
    broader: b,
  };
}
