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
  getTaxReportRange,
  getLatestBalance,
  getValidatorYield,
  getBalanceHistory,
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
      emissionPct:
        sn.emission_pct != null && Number.isFinite(Number(sn.emission_pct))
          ? Number(sn.emission_pct)
          : null,
      pct1h: sn.price_1h_pct_change != null ? Number(sn.price_1h_pct_change) : null,
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

  // iter 125 — per-subnet emission alignment depth signal.
  // tao.app screener emission_pct sums to 100 across all subnets (network
  // emission share). A subnet with emission_pct ≥ 1.0% is materially
  // above its 1/128 ≈ 0.78% fair share — call that "high-emission". Held
  // subnets with emission_pct == 0 are receiving no network emission this
  // epoch (validator weights have routed elsewhere). The portfolio-weighted
  // metric tells §0 whether the user's TAO is flowing into the subnets
  // that capture network emission, or sitting in starved ones.
  const HIGH_EMISSION_PCT = 1.0;
  const emissionAlignment = (() => {
    const positionsWithEmission = positions.filter((p) => p.emissionPct != null);
    if (!positionsWithEmission.length || totalTao <= 0) {
      return { available: false, reason: 'no_emission_data' };
    }
    let highEmissionTao = 0;
    let zeroEmissionTao = 0;
    let weightedEmissionNum = 0;
    let coveredEmissionPct = 0;
    const seenNetuids = new Set();
    for (const p of positionsWithEmission) {
      weightedEmissionNum += p.taoValue * p.emissionPct;
      if (p.emissionPct >= HIGH_EMISSION_PCT) highEmissionTao += p.taoValue;
      if (p.emissionPct === 0) zeroEmissionTao += p.taoValue;
      if (!seenNetuids.has(p.netuid)) {
        coveredEmissionPct += p.emissionPct;
        seenNetuids.add(p.netuid);
      }
    }
    const weightedEmissionPct = weightedEmissionNum / totalTao;
    const highEmissionShare = (highEmissionTao / totalTao) * 100;
    const zeroEmissionShare = (zeroEmissionTao / totalTao) * 100;
    // Verdict order matters: aligned wins outright; otherwise starved-heavy
    // outranks partially-aligned because the starved share is the bigger
    // structural-risk signal even when some emission alignment exists.
    let verdict;
    if (highEmissionShare >= 60) verdict = 'aligned_with_emission';
    else if (zeroEmissionShare >= 50) verdict = 'starved_subnet_heavy';
    else if (highEmissionShare >= 30) verdict = 'partially_aligned';
    else verdict = 'mixed';
    const mostOverweightLowEmission = top10
      .filter((p) => p.emissionPct != null && p.emissionPct < HIGH_EMISSION_PCT)
      .sort((a, b) => b.pctOfPortfolio - a.pctOfPortfolio)[0] || null;
    return {
      available: true,
      verdict,
      highEmissionThresholdPct: HIGH_EMISSION_PCT,
      weightedEmissionPct,
      highEmissionShare,
      zeroEmissionShare,
      coveredEmissionPct,
      mostOverweightLowEmission: mostOverweightLowEmission
        ? {
            netuid: mostOverweightLowEmission.netuid,
            name: mostOverweightLowEmission.name,
            pctOfPortfolio: mostOverweightLowEmission.pctOfPortfolio,
            emissionPct: mostOverweightLowEmission.emissionPct,
          }
        : null,
    };
  })();

  return {
    totalTao,
    totalUsd,
    totalAud,
    taoPrice,
    usdAud,
    positionCount: positions.length,
    top10,
    allPositions: positions, // used by other sections
    emissionAlignment,
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
export async function pnlGroundTruth({ coldkey, days, taoPrice, usdAud, rows: preFetchedRows, balance: preFetchedBalance }) {
  const [rows, balance] = preFetchedRows !== undefined && preFetchedBalance !== undefined
    ? [preFetchedRows, preFetchedBalance]
    : await Promise.all([
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
  const dailyIncomeSeries = []; // per-day { date, income } for §2 sparkline

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
      if (r.daily_income != null) {
        const inc = Number(r.daily_income);
        dailyIncomeTao += inc;
        dailyIncomeSeries.push({ date: r.date, income: inc });
      }
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

  // Iter 110: under FREE_PNL=1 the underlying /api/account/history/v1 endpoint
  // only retains ~6 months of snapshots, so a "365d" request collapses to the
  // oldest available row via the iter-109 fallback — the actual reconstruction
  // covers fewer days than asked. effectiveWindowDays is the real coverage
  // (firstSnapshotDate → lastSnapshotDate) and every label/annualisation in
  // the app should prefer it over the requested `days` so the headline number
  // isn't lying about its time horizon. In paid mode, firstSnapshotDate ≈ start,
  // so the two values converge naturally.
  const firstMs = firstSnapshotDate ? new Date(firstSnapshotDate).getTime() : null;
  const lastMs = lastSnapshotDate ? new Date(lastSnapshotDate).getTime() : null;
  const effectiveWindowDays =
    firstMs && lastMs && lastMs > firstMs
      ? Math.max(1, Math.round((lastMs - firstMs) / (24 * 60 * 60 * 1000)))
      : days;
  const windowIsShortened = effectiveWindowDays < days - 5;

  return {
    available: true,
    windowDays: days,
    effectiveWindowDays,
    windowIsShortened,
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
    dailyIncomeSeries,
    firstSnapshotDate,
    lastSnapshotDate,
    snapshotCount,
    transferCount,
    formula: 'current + transfer_out - transfer_in - starting',
    source: 'taostats /api/accounting/tax/v1',
  };
}

// Decompose headline PnL into staking-income contribution (compounding,
// structural) and price contribution (mark-to-market, mean-reverting), and
// classify the window into a verdict the AI prompt can quote verbatim. The
// PNL_DECOMPOSITION KB section (iter 117) tells the model HOW to read these
// two components; this helper computes them explicitly so the model isn't
// deriving ratios from raw values mid-narrative (which it does inconsistently).
//
// Returns null when the underlying data is too sparse to decompose (no PnL,
// no staking income, etc.) — caller soft-omits the block in that case.
export function pnlDecomposition({ gt, weightedApy }) {
  if (!gt?.available) return null;

  const profitTao = Number(gt.profitTao);
  const stakingIncomeTao = Number(gt.dailyIncomeTao || 0);
  if (!Number.isFinite(profitTao)) return null;

  const effectiveDays = Number(gt.effectiveWindowDays) || Number(gt.windowDays) || null;
  const priceContribTao = profitTao - stakingIncomeTao;

  // |profitTao| < 0.05τ → window's PnL is so close to zero that ratios are
  // numerically unstable. Use "stalled" verdict; skip the share math.
  const stalledThresholdTao = 0.05;
  const isStalled = Math.abs(profitTao) < stalledThresholdTao;

  let stakingShare = null;
  let priceShare = null;
  if (!isStalled && Math.abs(profitTao) >= stalledThresholdTao) {
    stakingShare = stakingIncomeTao / profitTao;
    priceShare = priceContribTao / profitTao;
  }

  // Annualise the realised return and compare to the structural yield rate
  // (weighted APY). Large positive gap = front-loaded windfall; negative gap
  // = price drag depressing the headline below what yield should deliver.
  let impliedAnnualReturn = null;
  let annualVsApyGapPp = null;
  if (effectiveDays && Number.isFinite(Number(gt.returnPct))) {
    impliedAnnualReturn = Number(gt.returnPct) * (365 / effectiveDays);
    if (Number.isFinite(Number(weightedApy))) {
      annualVsApyGapPp = (impliedAnnualReturn - Number(weightedApy)) * 100;
    }
  }

  // Verdict — single-word classification matching the KB's PNL_DECOMPOSITION
  // categories so the model can reuse the framing verbatim.
  let verdict;
  let verdictReason;
  if (isStalled) {
    verdict = 'stalled';
    verdictReason = 'PnL within ±0.05τ of zero — momentum has flattened over this window';
  } else if (profitTao < 0 && stakingIncomeTao > 0) {
    verdict = 'price_headwind';
    verdictReason = 'yield delivered positively but price absorbed more — strategy structurally working';
  } else if (profitTao < 0 && stakingIncomeTao <= 0) {
    verdict = 'underperforming';
    verdictReason = 'both yield and price negative — structural weakness, not just price drag';
  } else if (stakingShare != null && stakingShare >= 0.85) {
    verdict = 'yield_driven';
    verdictReason = 'staking ≥ 85% of PnL — price contribution roughly flat, anchor expectations on the staking rate';
  } else if (stakingShare != null && stakingShare < 0.30) {
    // Heavy price-tailwind dominance — call it windfall if 3× or more, else
    // plain price_tailwind. Both signal "don't extrapolate the headline".
    verdict = stakingIncomeTao > 0 && profitTao >= 3 * stakingIncomeTao
      ? 'windfall'
      : 'price_tailwind';
    verdictReason = 'price contribution dominates — repeatable component is the staking line, not the headline';
  } else {
    verdict = 'balanced';
    verdictReason = 'staking and price each materially contributed — both components healthy';
  }

  // Implied-vs-structural gap label (only when we have both numbers).
  let annualVsApyVerdict = null;
  if (annualVsApyGapPp != null) {
    if (annualVsApyGapPp > 20) annualVsApyVerdict = 'far_above_structural';
    else if (annualVsApyGapPp < -10) annualVsApyVerdict = 'below_structural';
    else annualVsApyVerdict = 'roughly_structural';
  }

  return {
    available: true,
    profitTao,
    stakingIncomeTao,
    priceContribTao,
    stakingShare,
    priceShare,
    effectiveWindowDays: effectiveDays,
    impliedAnnualReturn,
    weightedApy: Number.isFinite(Number(weightedApy)) ? Number(weightedApy) : null,
    annualVsApyGapPp,
    annualVsApyVerdict,
    verdict,
    verdictReason,
  };
}

// APY trend verdict — single-word classification of weighted-APY motion across
// the 30d / 7d / 1d windows yieldSection already emits, with a τ/year impact
// number anchored on current portfolio size. Operationalises iter 115's KB
// TIME_WINDOW_DIVERGENCE_PATTERNS section: tells the model how the triple
// (24h × 7d × 30d) should be READ, this hands it the read pre-computed so
// gpt-oss-20b doesn't pick the most alarming window and ignore the rest.
//
// Returns { available: false } when fewer than two windows are populated
// (single-point trend isn't a trend) — caller soft-omits the block.
export function apyTrendVerdict({ y }) {
  if (!y) return { available: false };

  // weightedApySeries is ordered [30d, 7d, 1d] but only includes windows that
  // cleared the coverage floor in yieldSection. Re-index by label so we can
  // ask for each window without assuming length.
  const byLabel = new Map();
  for (const row of y.weightedApySeries || []) {
    if (row.value != null) byLabel.set(row.label, row.value);
  }
  const d30 = byLabel.get('30d') ?? null;
  const d7 = byLabel.get('7d') ?? null;
  const d1 = byLabel.get('1d') ?? null;

  const haveCount = [d30, d7, d1].filter((v) => v != null).length;
  if (haveCount < 2) return { available: false };

  // pp = percentage points. APY values are fractions (0.20 = 20%), so the
  // gap × 100 is the pp delta. Threshold 0.5pp — small enough to catch real
  // drift, big enough to ignore single-epoch noise.
  const gap_7_30_pp = d30 != null && d7 != null ? (d7 - d30) * 100 : null;
  const gap_1_7_pp = d7 != null && d1 != null ? (d1 - d7) * 100 : null;
  const gap_1_30_pp = d30 != null && d1 != null ? (d1 - d30) * 100 : null;
  const THRESH_PP = 0.5;

  let verdict;
  let verdictReason;
  if (d30 != null && d7 != null && d1 != null) {
    const up7 = gap_7_30_pp > THRESH_PP;
    const dn7 = gap_7_30_pp < -THRESH_PP;
    const up1 = gap_1_7_pp > THRESH_PP;
    const dn1 = gap_1_7_pp < -THRESH_PP;
    if (up7 && up1) {
      verdict = 'accelerating_climb';
      verdictReason = 'both 7d-vs-30d and 1d-vs-7d positive — yield momentum still building';
    } else if (dn7 && dn1) {
      verdict = 'accelerating_fade';
      verdictReason = 'both 7d-vs-30d and 1d-vs-7d negative — yield deteriorating across both horizons';
    } else if (up7 && dn1) {
      verdict = 'peaking';
      verdictReason = '7d above 30d but 1d already pulling back — climb may be topping out';
    } else if (dn7 && up1) {
      verdict = 'recovering';
      verdictReason = '7d below 30d but 1d above 7d — fade reversing recently';
    } else if (up7) {
      verdict = 'climbing';
      verdictReason = '7d above 30d with 1d holding the new level — sustained step-up';
    } else if (dn7) {
      verdict = 'fading';
      verdictReason = '7d below 30d with 1d holding the new level — sustained step-down';
    } else if (up1) {
      verdict = 'recent_lift';
      verdictReason = '30d and 7d roughly equal but 1d above both — fresh uptick, may or may not hold';
    } else if (dn1) {
      verdict = 'recent_dip';
      verdictReason = '30d and 7d roughly equal but 1d below both — fresh dip, may or may not hold';
    } else {
      verdict = 'stable';
      verdictReason = 'all three windows within ±0.5pp — yield is flat';
    }
  } else if (gap_7_30_pp != null) {
    if (gap_7_30_pp > THRESH_PP) {
      verdict = 'climbing';
      verdictReason = '7d above 30d (1d data unavailable) — uptrend visible at week scale';
    } else if (gap_7_30_pp < -THRESH_PP) {
      verdict = 'fading';
      verdictReason = '7d below 30d (1d data unavailable) — downtrend visible at week scale';
    } else {
      verdict = 'stable';
      verdictReason = '7d within ±0.5pp of 30d (1d data unavailable) — yield is flat';
    }
  } else if (gap_1_30_pp != null) {
    // 1d vs 30d only — use a wider threshold (1pp) since we're skipping the
    // middle reading.
    if (gap_1_30_pp > 1.0) {
      verdict = 'climbing';
      verdictReason = '1d above 30d by >1pp (7d data unavailable) — recent uptick relative to monthly baseline';
    } else if (gap_1_30_pp < -1.0) {
      verdict = 'fading';
      verdictReason = '1d below 30d by >1pp (7d data unavailable) — recent dip relative to monthly baseline';
    } else {
      verdict = 'stable';
      verdictReason = '1d within 1pp of 30d (7d data unavailable) — yield roughly tracking baseline';
    }
  } else {
    return { available: false };
  }

  // τ/year impact if the most recent window's APY were sustained, vs the 30d
  // baseline. Per-position alpha × alpha price = TAO value of that position;
  // (apy_short - apy_30d) × tao_value = annual TAO delta. Sum across positions
  // where we have both windows AND alpha price data.
  let annualLiftTaoIfSustained = null;
  let liftBaseWindow = null;
  const positions = Array.isArray(y.perPosition) ? y.perPosition : [];
  // Prefer 1d when available, fall back to 7d as the "current" window.
  const shortKey = positions.some((p) => p.apy1d != null) ? 'apy1d' : 'apy7d';
  liftBaseWindow = shortKey === 'apy1d' ? '1d' : '7d';
  let liftSum = 0;
  let liftCount = 0;
  let taoBaseValue = 0;
  for (const p of positions) {
    const short = p[shortKey];
    const baseline = p.apy30d ?? null;
    const tao = (p.alphaTokens || 0) * (p.alphaPriceTao || 0);
    if (tao > 0) taoBaseValue += tao;
    if (short != null && baseline != null && tao > 0) {
      liftSum += (short - baseline) * tao;
      liftCount += 1;
    }
  }
  if (liftCount > 0) annualLiftTaoIfSustained = liftSum;

  return {
    available: true,
    windows: { d30, d7, d1 },
    gap_7_30_pp,
    gap_1_7_pp,
    gap_1_30_pp,
    verdict,
    verdictReason,
    annualLiftTaoIfSustained,
    liftBaseWindow,
    taoBaseValue,
  };
}

// Validator concentration verdict — single-word classification of how the
// portfolio's staked TAO value is distributed across distinct validator
// hotkeys, with a top-3 share table. Operationalises iter 116's KB
// VALIDATOR_HEURISTICS section: the KB tells the model "single-validator
// concentration > 60% = SPOF regardless of APY", this hands it the share
// pre-computed so the model can't read a 5-position book as "diversified"
// when all 5 sit on the same hotkey.
//
// Weighting is by TAO base value (alphaTokens × alphaPriceTao), not by
// alpha count — a 100α position on a 0.01τ subnet is structurally smaller
// than a 10α position on a 0.5τ subnet, and the KB's SPOF threshold is
// "% of staked TAO value", not "% of alpha tokens".
//
// Returns { available: false } when no positions have a populated
// alphaPriceTao (can't weight by TAO value) — caller soft-omits the block.
export function validatorConcentration({ y }) {
  if (!y) return { available: false };
  const positions = Array.isArray(y.perPosition) ? y.perPosition : [];
  if (positions.length === 0) return { available: false };

  // Bucket TAO base value per hotkey. Hotkey is the validator identifier;
  // validatorName is the human label when present, opaque otherwise.
  const byHotkey = new Map();
  let totalTao = 0;
  for (const p of positions) {
    const tao = (p.alphaTokens || 0) * (p.alphaPriceTao || 0);
    if (!(tao > 0)) continue;
    const hk = p.hotkey;
    if (!hk) continue;
    const prev = byHotkey.get(hk) || {
      hotkey: hk,
      validatorName: p.validatorName || null,
      taoValue: 0,
      subnets: new Set(),
    };
    prev.taoValue += tao;
    prev.subnets.add(p.netuid);
    // Prefer non-null name if a later row supplied one.
    if (!prev.validatorName && p.validatorName) prev.validatorName = p.validatorName;
    byHotkey.set(hk, prev);
    totalTao += tao;
  }
  if (totalTao <= 0 || byHotkey.size === 0) return { available: false };

  const validators = Array.from(byHotkey.values())
    .map((v) => ({
      hotkey: v.hotkey,
      validatorName: v.validatorName,
      taoValue: v.taoValue,
      share: v.taoValue / totalTao,
      subnetCount: v.subnets.size,
    }))
    .sort((a, b) => b.share - a.share);

  const distinctValidatorCount = validators.length;
  const top1Share = validators[0].share;
  const top3Share = validators.slice(0, 3).reduce((a, v) => a + v.share, 0);

  // Verdict tree matches iter 116 KB VALIDATOR_HEURISTICS (g): "single-
  // validator concentration > 60% = SPOF". Tiered above/below for nuance.
  let verdict;
  let verdictReason;
  if (distinctValidatorCount === 1) {
    verdict = 'single_validator';
    verdictReason =
      'every position sits on one hotkey — one operational failure (downtime, deregistration, key compromise) unwinds the entire book regardless of APY';
  } else if (top1Share > 0.80) {
    verdict = 'extreme_concentration';
    verdictReason =
      `top validator holds ${(top1Share * 100).toFixed(0)}% of staked TAO value — well past the KB's 60% SPOF threshold; the book is effectively single-validator-exposed`;
  } else if (top1Share > 0.60) {
    verdict = 'concentrated';
    verdictReason =
      `top validator holds ${(top1Share * 100).toFixed(0)}% of staked TAO value — above the KB's 60% SPOF threshold; consider spreading to ≥3 distinct hotkeys`;
  } else if (top1Share > 0.30) {
    verdict = 'moderate';
    verdictReason =
      `top validator holds ${(top1Share * 100).toFixed(0)}% — not yet SPOF territory but a single failure would dent the book materially`;
  } else {
    verdict = 'diversified';
    verdictReason =
      `top validator holds only ${(top1Share * 100).toFixed(0)}% across ${distinctValidatorCount} distinct hotkeys — no single SPOF`;
  }

  return {
    available: true,
    distinctValidatorCount,
    top1Share,
    top3Share,
    totalTaoBaseValue: totalTao,
    verdict,
    verdictReason,
    top3: validators.slice(0, 3).map((v) => ({
      hotkey: v.hotkey,
      validatorName: v.validatorName,
      share: v.share,
      taoValue: v.taoValue,
      subnetCount: v.subnetCount,
    })),
  };
}

// §2b DRAWDOWN — peak balance, max peak-to-trough drop, days since peak
// Uses /api/account/history/v1 (daily snapshots) walked once. Adds the risk
// dimension a tax/PnL number alone can't tell you: how deep was the worst
// recent dip, and are you currently at an all-time high.
export async function drawdownSection({ coldkey, days = 365, series: preFetchedSeries }) {
  // Caller can pre-fetch balance history (we share with taxYearSection so
  // free-tier Taostats key doesn't get double-billed).
  const series = preFetchedSeries
    ? preFetchedSeries.slice(-days)
    : await getBalanceHistory(coldkey, days).catch(() => []);
  if (series.length < 3) {
    return { available: false, reason: 'insufficient_history', pointCount: series.length };
  }

  let runningPeak = -Infinity;
  let runningPeakDate = null;
  let maxDrawdownTao = 0;
  let maxDrawdownPct = 0;
  let maxDrawdownPeakTao = 0;
  let maxDrawdownPeakDate = null;
  let maxDrawdownTroughTao = 0;
  let maxDrawdownTroughDate = null;
  let maxDrawdownTroughIdx = -1;

  // Per-day {date, balanceTao, runningPeakTao, drawdownTao, drawdownPct}
  // built in the same walk so the §2 Drawdown CSV export is zero-recompute.
  const ddSeries = new Array(series.length);

  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    if (p.totalTao > runningPeak) {
      runningPeak = p.totalTao;
      runningPeakDate = p.timestamp;
    }
    const dd = runningPeak - p.totalTao;
    if (dd > maxDrawdownTao) {
      maxDrawdownTao = dd;
      maxDrawdownPct = runningPeak > 0 ? dd / runningPeak : 0;
      maxDrawdownPeakTao = runningPeak;
      maxDrawdownPeakDate = runningPeakDate;
      maxDrawdownTroughTao = p.totalTao;
      maxDrawdownTroughDate = p.timestamp;
      maxDrawdownTroughIdx = i;
    }
    ddSeries[i] = {
      date: p.timestamp,
      balanceTao: p.totalTao,
      runningPeakTao: runningPeak,
      drawdownTao: dd,
      drawdownPct: runningPeak > 0 ? dd / runningPeak : 0,
    };
  }

  // Recovery time for the worst dip: days from trough until balance first
  // climbed back to (or above) the peak. If still under water at the last
  // snapshot, surface daysUnderwater instead so the user knows the dip
  // hasn't been recovered yet.
  let recoveryDate = null;
  let recoveryDays = null;
  let daysUnderwater = null;
  let currentlyUnderwater = false;
  if (maxDrawdownTroughIdx >= 0 && maxDrawdownPeakTao > 0) {
    for (let i = maxDrawdownTroughIdx + 1; i < series.length; i++) {
      if (series[i].totalTao >= maxDrawdownPeakTao) {
        recoveryDate = series[i].timestamp;
        recoveryDays = Math.max(
          0,
          Math.round(
            (new Date(recoveryDate) - new Date(maxDrawdownTroughDate)) / (24 * 60 * 60 * 1000),
          ),
        );
        break;
      }
    }
    if (recoveryDate === null) {
      currentlyUnderwater = true;
      daysUnderwater = Math.max(
        0,
        Math.round(
          (new Date(series[series.length - 1].timestamp) - new Date(maxDrawdownTroughDate)) /
            (24 * 60 * 60 * 1000),
        ),
      );
    }
  }

  const allTimePeakTao = series.reduce((mx, p) => Math.max(mx, p.totalTao), -Infinity);
  const allTimePeakDate = series.find((p) => p.totalTao === allTimePeakTao)?.timestamp || null;
  const current = series[series.length - 1];
  const currentDrawdownTao = Math.max(0, allTimePeakTao - current.totalTao);
  const currentDrawdownPct = allTimePeakTao > 0 ? currentDrawdownTao / allTimePeakTao : 0;

  // Underwater-stretch duration percentiles. Walk the ddSeries once and segment
  // by sign of drawdownTao to collect the duration in days of every contiguous
  // underwater run (balance below its prior running peak). The CURRENT stretch
  // is included even if still open — daysUnderwater is the live tail.
  // Surfaces p50/p90/max so the user reads "you're Nd underwater; median dd
  // lasts X days, p90 is Y days" instead of bare "underwater" (iter 131 — extends
  // iter 121 dd block with longer-window stats per iter 121 followup).
  const underwaterRuns = [];
  {
    let runStartIdx = -1;
    for (let i = 0; i < ddSeries.length; i++) {
      const inDrawdown = ddSeries[i].drawdownTao > 0;
      if (inDrawdown && runStartIdx === -1) {
        runStartIdx = i;
      } else if (!inDrawdown && runStartIdx !== -1) {
        const startDate = new Date(ddSeries[runStartIdx].date);
        const endDate = new Date(ddSeries[i - 1].date);
        const durationDays = Math.max(
          1,
          Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1,
        );
        underwaterRuns.push(durationDays);
        runStartIdx = -1;
      }
    }
    if (runStartIdx !== -1) {
      const startDate = new Date(ddSeries[runStartIdx].date);
      const endDate = new Date(ddSeries[ddSeries.length - 1].date);
      const durationDays = Math.max(
        1,
        Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1,
      );
      underwaterRuns.push(durationDays);
    }
  }
  const percentile = (sorted, q) => {
    if (sorted.length === 0) return null;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
  };
  const sortedRuns = [...underwaterRuns].sort((a, b) => a - b);
  const ddDurationP50 = percentile(sortedRuns, 0.5);
  const ddDurationP90 = percentile(sortedRuns, 0.9);
  const ddDurationMax = sortedRuns.length > 0 ? sortedRuns[sortedRuns.length - 1] : null;
  const underwaterRunCount = sortedRuns.length;
  const daysSincePeak = allTimePeakDate
    ? Math.max(
        0,
        Math.round(
          (new Date(current.timestamp) - new Date(allTimePeakDate)) / (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const isAtAllTimeHigh = currentDrawdownPct < 0.005; // within 0.5%

  // 90-day balance sparkline — last 90 daily snapshots bucketed into 8
  // unicode block levels. Same algorithm as §1 portfolio sparkline (iter 87)
  // but anchored on the drawdown panel's longer time scale so the user sees
  // the dip + recovery shape, not just the recent 30 days. Soft-omits below
  // 14 snapshots (drawdown panel already gates §2 around that threshold).
  const sparkline90d = (() => {
    const slice = series.slice(-90).filter((s) => s.totalTao > 0);
    if (slice.length < 14) return null;
    const vals = slice.map((s) => s.totalTao);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const chars = vals
      .map((v) => {
        if (!(max > min)) return blocks[3];
        const t = (v - min) / (max - min);
        const idx = Math.min(blocks.length - 1, Math.max(0, Math.floor(t * blocks.length)));
        return blocks[idx];
      })
      .join('');
    return {
      str: chars,
      points: slice.length,
      minTao: min,
      maxTao: max,
      firstTao: vals[0],
      lastTao: vals[vals.length - 1],
      firstDate: slice[0].timestamp,
      lastDate: slice[slice.length - 1].timestamp,
    };
  })();

  return {
    available: true,
    windowDays: days,
    pointCount: series.length,
    firstDate: series[0].timestamp,
    lastDate: current.timestamp,
    currentTao: current.totalTao,
    allTimePeakTao,
    allTimePeakDate,
    daysSincePeak,
    isAtAllTimeHigh,
    currentDrawdownTao,
    currentDrawdownPct,
    maxDrawdownTao,
    maxDrawdownPct,
    maxDrawdownPeakTao,
    maxDrawdownPeakDate,
    maxDrawdownTroughTao,
    maxDrawdownTroughDate,
    recoveryDate,
    recoveryDays,
    currentlyUnderwater,
    daysUnderwater,
    ddDurationP50,
    ddDurationP90,
    ddDurationMax,
    underwaterRunCount,
    series: ddSeries,
    sparkline90d,
  };
}

// Drawdown verdict — single-word classification of the dd state matching iter
// 121's DRAWDOWN_HEURISTICS KB. The KB tells the model how to READ the four
// signals (maxDrawdownPct, currentDrawdownPct, daysSincePeak, currentlyUnderwater,
// recoveryDays); this hands it the read pre-computed so gpt-oss-20b can't
// either ignore the panel entirely or over-react to routine 15-30% alpha cycles.
// Pattern mirrors apyTrendVerdict (iter 119) and validatorConcentration (iter 120):
// both KB section + deterministic handoff, so the model has framework AND result.
//
// Verdict tree maps directly to KB rules:
//   - rule c: isAtAllTimeHigh → at_peak (do not narrate a drawdown the book is not in)
//   - rule b: currentlyUnderwater AND currentDrawdownPct > 30% AND daysSincePeak > 30 → flag_worthy
//     (the AND is load-bearing — depth alone or duration alone is noise)
//   - rule d: daysSincePeak tiers (<14 noise, 14-60 material, >60 strategy_question)
//   - rule e: currentlyUnderwater=false + recoveryDays<30 → resilient_absorb (name but don't alarm)
//   - rule 6: negative PnL + isAtAllTimeHigh → dataSanityFlag (contradictory pair)
//
// Iter 132 — SIXTH KB→§0 bridge: plumbs the iter 131 duration distribution
// (ddDurationP50/P90/Max/underwaterRunCount across 365d) into the verdict so the
// model reads dip SHAPE not just dip depth. Two distribution-aware branches gate
// ahead of the absolute-threshold tree when the distribution has ≥2 stretches:
//   - beyond_historical_tail: underwater AND daysUnderwater > ddDurationP90
//     — current stretch already past the slow-recovery tail; escalates above
//     flag_worthy (depth gate may not have tripped yet but durability has).
//   - within_typical_stretch: underwater AND daysUnderwater ≤ ddDurationP50 AND
//     currentDrawdownPct ≤ 30% — current stretch is at or below the median
//     historical underwater run; down-weights recent_deep_dip / shallow_but_extended
//     / material_dip to "monitor not flag" because the duration matches normal
//     book behaviour. flag_worthy (>30% depth + >30d duration) still wins.
export function drawdownVerdict({ dd, gt }) {
  if (!dd?.available) return { available: false };

  const maxPct = Number(dd.maxDrawdownPct) || 0;
  const curPct = Number(dd.currentDrawdownPct) || 0;
  const daysSincePeak = Number.isFinite(Number(dd.daysSincePeak)) ? Number(dd.daysSincePeak) : null;
  const recoveryDays = Number.isFinite(Number(dd.recoveryDays)) ? Number(dd.recoveryDays) : null;
  const daysUnderwater = Number.isFinite(Number(dd.daysUnderwater)) ? Number(dd.daysUnderwater) : null;
  const ddDurationP50 = Number.isFinite(Number(dd.ddDurationP50)) ? Number(dd.ddDurationP50) : null;
  const ddDurationP90 = Number.isFinite(Number(dd.ddDurationP90)) ? Number(dd.ddDurationP90) : null;
  const ddDurationMax = Number.isFinite(Number(dd.ddDurationMax)) ? Number(dd.ddDurationMax) : null;
  const underwaterRunCount = Number.isFinite(Number(dd.underwaterRunCount)) ? Number(dd.underwaterRunCount) : 0;
  const underwater = Boolean(dd.currentlyUnderwater);
  const atPeak = Boolean(dd.isAtAllTimeHigh);

  // Distribution is only meaningful with ≥2 historical stretches — a single
  // underwater run can't shape p50/p90 (every percentile equals the same value).
  const distAvailable =
    underwaterRunCount >= 2 && ddDurationP50 != null && ddDurationP90 != null;

  let verdict;
  let verdictReason;
  if (atPeak) {
    verdict = 'at_peak';
    verdictReason = 'currently at (or within 0.5% of) the all-time peak — do not narrate a drawdown that isn\'t there';
  } else if (!underwater) {
    if (recoveryDays != null && recoveryDays < 30) {
      verdict = 'resilient_absorb';
      verdictReason =
        `recovered from a ${(maxPct * 100).toFixed(0)}% peak-to-trough dip in ${recoveryDays}d — durability signal, name it but don't alarm`;
    } else {
      verdict = 'recovered';
      verdictReason =
        `worst dip was ${(maxPct * 100).toFixed(0)}% but the book has since recovered above prior peak — historical risk, not active`;
    }
  } else if (distAvailable && daysUnderwater != null && daysUnderwater > ddDurationP90) {
    verdict = 'beyond_historical_tail';
    verdictReason =
      `${daysUnderwater}d underwater is past the p90 historical stretch of ${ddDurationP90}d (max ${ddDurationMax}d across ${underwaterRunCount} stretches) — durability concern, route to concentration or sizing per KB iter 121, not a yield response`;
  } else if (curPct > 0.30 && daysSincePeak != null && daysSincePeak > 30) {
    verdict = 'flag_worthy';
    verdictReason =
      `${(curPct * 100).toFixed(0)}% below peak for ${daysSincePeak}d — clears the dual gate (>30% depth AND >30d duration), not a routine alpha cycle`;
  } else if (distAvailable && daysUnderwater != null && daysUnderwater <= ddDurationP50 && curPct <= 0.30) {
    verdict = 'within_typical_stretch';
    verdictReason =
      `${daysUnderwater}d underwater is at or below the p50 historical stretch of ${ddDurationP50}d (p90 ${ddDurationP90}d) — duration matches normal book behaviour, monitor not flag`;
  } else if (curPct > 0.30) {
    verdict = 'recent_deep_dip';
    verdictReason =
      `${(curPct * 100).toFixed(0)}% below peak but only ${daysSincePeak ?? '?'}d since peak — depth alone without duration is typical alpha noise, monitor not flag`;
  } else if (daysSincePeak != null && daysSincePeak > 60) {
    verdict = 'shallow_but_extended';
    verdictReason =
      `${daysSincePeak}d below peak at only ${(curPct * 100).toFixed(0)}% depth — extended underperformance without depth, a strategy-mix question more than a risk event`;
  } else if (daysSincePeak != null && daysSincePeak < 14) {
    verdict = 'recent_noise';
    verdictReason =
      `${daysSincePeak}d below peak at ${(curPct * 100).toFixed(0)}% — too fresh to read as anything but routine variance`;
  } else {
    verdict = 'material_dip';
    verdictReason =
      `${(curPct * 100).toFixed(0)}% below peak for ${daysSincePeak ?? '?'}d — material but neither flag-worthy depth nor extended-question duration`;
  }

  // Rule 6 data-sanity pair: negative window PnL + at-all-time-high is a
  // contradictory state the model should call out rather than try to reconcile
  // narratively. Most often a windowing mismatch (PnL over a longer window than
  // the snapshot history covers).
  let dataSanityFlag = null;
  if (atPeak && gt?.available && Number(gt.profitTao) < 0) {
    dataSanityFlag = 'negative_pnl_at_peak';
  }

  return {
    available: true,
    verdict,
    verdictReason,
    maxDrawdownPct: maxPct,
    currentDrawdownPct: curPct,
    daysSincePeak,
    daysUnderwater,
    recoveryDays,
    currentlyUnderwater: underwater,
    isAtAllTimeHigh: atPeak,
    dataSanityFlag,
    ddDurationP50,
    ddDurationP90,
    ddDurationMax,
    underwaterRunCount,
    distAvailable,
  };
}

// Staking-flow verdict — single-word classification of the transfer-flow
// behavioural overlay matching iter 123's STAKING_FLOW_HEURISTICS KB. The KB
// tells the model how to READ the four flow primitives at the gt root
// (transferInTao, transferOutTao, transferCount, dailyIncomeTao) — magnitude
// relative to currentPortfolioTao, cadence relative to effectiveWindowDays,
// flow-vs-income pair, direction-vs-price-regime confirming/anti-patterns.
// This hands the read pre-computed so gpt-oss-20b can't either ignore the
// flow data (collapse to "your wallet had some transfers") or anchor on
// absolute τ (call a 5τ inflow on a 500τ book "material" when it's noise).
// Same KB→§0 handoff pattern as 117→118 (PnL decomp) and 121→122 (drawdown).
//
// Verdict tree maps directly to KB rules:
//   - rule 7: transferCount === 0 → hands_off (zero-transfers window)
//   - rule 3 magnitude gate < 2% of book + transferCount > 0 → passive
//     (rebalancing too small to narrate)
//   - rule 2 sign + rule 3 magnitude > 15% → directional position change:
//       * net positive + transferIn > 2× dailyIncome → capitalising
//         (rule 5 — materially funding from external)
//       * net positive → accumulation
//       * net negative + transferOut > dailyIncome + not-underwater → harvesting
//         (rule 5 — sensible trim against income/rally)
//       * net negative → distribution
//   - 2-15% band → rebalancing (modest directional drift)
//   - rule 5 self_funding subcase: |net| < dailyIncome with non-trivial txns
//     overrides modest verdicts where staking income is doing the work
//
// Confirming / anti-pattern overlay (rule 6) handed as a separate field so
// the model surfaces it instead of having to derive it:
//   - buying_the_dip   = net positive AND currentlyUnderwater AND currentDrawdownPct > 20%
//   - selling_the_peak = net negative AND isAtAllTimeHigh
//   - distribution_in_drawdown = net negative AND currentlyUnderwater AND currentDrawdownPct > 15%  [flag]
//   - buying_the_peak  = net positive (material) AND isAtAllTimeHigh           [anti-pattern flag]
export function stakingFlowVerdict({ gt, dd }) {
  if (!gt?.available) return { available: false };

  const transferIn = Number(gt.transferInTao) || 0;
  const transferOut = Number(gt.transferOutTao) || 0;
  const transferCount = Number(gt.transferCount) || 0;
  const dailyIncome = Math.max(0, Number(gt.dailyIncomeTao) || 0);
  const book = Number(gt.currentPortfolioTao) || 0;
  const days = Math.max(1, Number(gt.effectiveWindowDays) || Number(gt.windowDays) || 30);

  const netTao = transferIn - transferOut;
  const grossTao = transferIn + transferOut;
  const netPctOfBook = book > 0 ? netTao / book : 0;
  const grossPctOfBook = book > 0 ? grossTao / book : 0;
  const txnsPer30d = (transferCount / days) * 30;

  let cadence;
  if (transferCount === 0) cadence = 'none';
  else if (txnsPer30d < 1) cadence = 'low';
  else if (txnsPer30d <= 5) cadence = 'normal';
  else cadence = 'high';

  const absNetPct = Math.abs(netPctOfBook);
  const underwater = Boolean(dd?.currentlyUnderwater);
  const atPeak = Boolean(dd?.isAtAllTimeHigh);
  const curDdPct = Number(dd?.currentDrawdownPct) || 0;

  let verdict;
  let verdictReason;
  if (transferCount === 0) {
    verdict = 'hands_off';
    verdictReason =
      'zero transfers in window — wallet untouched, all balance change is price + staking income, do not manufacture a flow narrative';
  } else if (grossPctOfBook < 0.02) {
    verdict = 'passive';
    verdictReason =
      `gross flow ${(grossPctOfBook * 100).toFixed(1)}% of book over ${days}d — sub-threshold, treat as passive holding, don't narrate as a flow`;
  } else if (absNetPct > 0.15) {
    if (netTao > 0 && dailyIncome > 0 && transferIn > 2 * dailyIncome) {
      verdict = 'capitalising';
      verdictReason =
        `net +${(netPctOfBook * 100).toFixed(0)}% with transfersIn ${(transferIn / Math.max(dailyIncome, 1e-9)).toFixed(1)}× staking income — externally funding the position, not just compounding yield`;
    } else if (netTao > 0) {
      verdict = 'accumulation';
      verdictReason =
        `net +${(netPctOfBook * 100).toFixed(0)}% of book over ${days}d — directional position increase`;
    } else if (dailyIncome > 0 && transferOut > dailyIncome && !underwater) {
      verdict = 'harvesting';
      verdictReason =
        `net ${(netPctOfBook * 100).toFixed(0)}% with transfersOut > staking income against not-underwater book — sensible trim, not distribution`;
    } else {
      verdict = 'distribution';
      verdictReason =
        `net ${(netPctOfBook * 100).toFixed(0)}% of book over ${days}d — directional position decrease`;
    }
  } else if (dailyIncome > 0 && Math.abs(netTao) < dailyIncome && transferCount > 0) {
    verdict = 'self_funding';
    verdictReason =
      `|net| ${Math.abs(netTao).toFixed(2)}τ < daily-income window ${dailyIncome.toFixed(2)}τ — staking income is doing the work, transfers are noise`;
  } else if (absNetPct < 0.02) {
    verdict = 'rebalancing';
    verdictReason =
      `near-zero net flow (${(netPctOfBook * 100).toFixed(1)}%) over ${transferCount} txns — rotation/round-trip, not a directional move`;
  } else if (netTao > 0) {
    verdict = 'accumulation';
    verdictReason =
      `modest net +${(netPctOfBook * 100).toFixed(0)}% (within 2-15% band) — measured directional drift`;
  } else {
    verdict = 'distribution';
    verdictReason =
      `modest net ${(netPctOfBook * 100).toFixed(0)}% (within 2-15% band) — measured directional drift`;
  }

  // Rule 6 direction-vs-price-regime confirming / anti-pattern overlay.
  // Surfaced as a separate field so the model names it explicitly instead of
  // having to derive the cross-product of flow direction × dd state itself.
  let patternFlag = null;
  let patternIsAntiPattern = false;
  if (netTao > 0 && underwater && curDdPct > 0.20) {
    patternFlag = 'buying_the_dip';
    patternIsAntiPattern = false;
  } else if (netTao < 0 && atPeak) {
    patternFlag = 'selling_the_peak';
    patternIsAntiPattern = false;
  } else if (netTao < 0 && underwater && curDdPct > 0.15) {
    patternFlag = 'distribution_in_drawdown';
    patternIsAntiPattern = true;
  } else if (netTao > 0 && atPeak && absNetPct > 0.05) {
    patternFlag = 'buying_the_peak';
    patternIsAntiPattern = true;
  }

  return {
    available: true,
    verdict,
    verdictReason,
    netTao,
    grossTao,
    netPctOfBook,
    grossPctOfBook,
    transferCount,
    txnsPer30d,
    cadence,
    transferInTao: transferIn,
    transferOutTao: transferOut,
    dailyIncomeTao: dailyIncome,
    effectiveWindowDays: days,
    patternFlag,
    patternIsAntiPattern,
  };
}

// Multi-window net-flow comparison (iter 137) — walks tax rows once and tallies
// transfer_in / transfer_out for trailing 30d / 90d / 180d / 365d windows so the
// staking-flow read has a durability dimension beyond the single-window iter 123
// snapshot. Lets the AI distinguish "30d +5τ inflow on top of 365d +25τ" (sustained
// accumulation) from "30d +5τ on a 365d −20τ book" (recent reversal — different
// behavioural meaning even though both windows look superficially similar).
//
// Zero extra API cost — uses the already-fetched tax rows (combined prior + current
// FY in buildReport). Returns an array shaped for the §0 numeric line + the
// stakingFlowVerdict durability classifier.
export function multiWindowNetFlow({ rows, now = new Date() }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { available: false, reason: 'no_rows' };
  }
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const windows = [30, 90, 180, 365];
  const buckets = new Map(windows.map((d) => [d, { transferInTao: 0, transferOutTao: 0, transferCount: 0 }]));

  for (const r of rows) {
    const t = r.transaction_type;
    if (t !== 'transfer_in' && t !== 'transfer_out') continue;
    const rowMs = r.date ? new Date(r.date).getTime() : NaN;
    if (!Number.isFinite(rowMs)) continue;
    const ageDays = (nowMs - rowMs) / (24 * 60 * 60 * 1000);
    if (ageDays < 0) continue; // future-dated row, defensive
    for (const d of windows) {
      if (ageDays > d) continue;
      const b = buckets.get(d);
      if (t === 'transfer_in') {
        b.transferInTao += Number(r.credit_amount || 0);
      } else {
        b.transferOutTao += Number(r.debit_amount || 0);
      }
      b.transferCount += 1;
    }
  }

  const points = windows.map((d) => {
    const b = buckets.get(d);
    const netTao = b.transferInTao - b.transferOutTao;
    return {
      windowDays: d,
      netTao,
      transferInTao: b.transferInTao,
      transferOutTao: b.transferOutTao,
      transferCount: b.transferCount,
    };
  });

  // Coverage gate — if even the 365d window saw zero transfers, the durability
  // read is "no flow data" and downstream callers should treat as N/A.
  const has365Flow = points[points.length - 1].transferCount > 0;
  return {
    available: has365Flow,
    reason: has365Flow ? null : 'no_transfers_in_365d',
    points,
  };
}

// Durability classifier on the multiWindowNetFlow output. Reads the four window
// net-flow tallies as a sequence and returns a single-word verdict + reason for
// the §0 staking-flow block. Maps directly to the iter 137 KB extension on
// STAKING_FLOW_HEURISTICS:
//   - sustained_accumulation: all four windows net positive AND nondecreasing
//     toward longer windows (recent flows haven't reversed the long arc).
//   - sustained_distribution: all four windows net negative AND non-increasing
//     toward longer windows.
//   - recent_reversal_to_accumulation: 30d net positive but 365d net negative —
//     user has flipped from distribution to accumulation recently.
//   - recent_reversal_to_distribution: 30d net negative but 365d net positive —
//     user has flipped from accumulation to distribution recently.
//   - one_off_spike: ≥ 80% of the 365d gross flow happened inside the 30d window
//     — single recent event dominates the year's flow, not a sustained pattern.
//   - fading_flow: 365d nontrivial but 30d ≈ 0 — flow has gone quiet recently.
//   - flat: all four windows have |net| < 1τ — no behavioural signal worth naming.
//   - mixed: anything that doesn't match the above (modest net both directions,
//     no monotonic trend).
// Gated on mwnf.available; callers should soft-omit when verdict is null.
//
// Iter 139 — dormant-wallet escape hatch. When mwnf reports unavailable because
// the wallet has zero transfer_in/transfer_out rows in the trailing 365d window
// (no_rows or no_transfers_in_365d), that is itself a meaningful signal: pure
// root-staking / harvest-only behaviour. Emit verdict `dormant_harvest_only`
// rather than returning available:false so §0 surfaces a positive read instead
// of soft-omitting. Matches Jai's primary 5Cnz1juP… coldkey (FY-quiet on both
// the single-window and multi-window dimensions but explicitly so by design —
// validator selection IS the strategy, not capital flow shaping).
export function multiWindowDurabilityVerdict({ mwnf, book }) {
  if (!mwnf) return { available: false };
  if (!mwnf.available && (mwnf.reason === 'no_rows' || mwnf.reason === 'no_transfers_in_365d')) {
    return {
      available: true,
      verdict: 'dormant_harvest_only',
      verdictReason: 'wallet has zero transfer_in/transfer_out events across the trailing 365d — pure root-staking harvest behaviour; validator selection and root staking ARE the strategy, behavioural capital-flow signals do not apply',
      points: null,
    };
  }
  if (!mwnf?.available || !Array.isArray(mwnf.points)) {
    return { available: false };
  }
  const p30 = mwnf.points.find((p) => p.windowDays === 30);
  const p90 = mwnf.points.find((p) => p.windowDays === 90);
  const p180 = mwnf.points.find((p) => p.windowDays === 180);
  const p365 = mwnf.points.find((p) => p.windowDays === 365);
  if (!p30 || !p90 || !p180 || !p365) return { available: false };

  const nets = [p30.netTao, p90.netTao, p180.netTao, p365.netTao];
  const allTrivial = nets.every((n) => Math.abs(n) < 1);
  if (allTrivial) {
    return {
      available: true,
      verdict: 'flat',
      verdictReason: 'all four window net flows within ±1τ — no directional flow signal worth narrating',
      points: mwnf.points,
    };
  }

  const gross365 = p365.transferInTao + p365.transferOutTao;
  const gross30 = p30.transferInTao + p30.transferOutTao;
  // one_off_spike — recent window holds the vast majority of the year's gross
  // movement. A 5-15% threshold would be too tight (normal recent activity);
  // 80% requires that the 30d window basically IS the year's flow.
  if (gross365 > 0 && gross30 / gross365 >= 0.8 && gross365 > 1) {
    return {
      available: true,
      verdict: 'one_off_spike',
      verdictReason: `${((gross30 / gross365) * 100).toFixed(0)}% of 365d gross flow concentrated in last 30d — single recent event dominates, not a sustained pattern`,
      points: mwnf.points,
    };
  }

  // fading_flow — 365d had material activity but the last 30d went quiet.
  // Net abs of 30d below 5% of 365d gross AND 30d count == 0 (or <= 1 with
  // tiny magnitude) — distinguishes "still active but slowing" from "stopped".
  const bookGuard = Math.max(1, Number(book) || 0);
  const matFloor = Math.max(1, 0.005 * bookGuard); // 0.5% of book OR 1τ floor
  const yearMaterial = Math.abs(p365.netTao) > matFloor || gross365 > 2 * matFloor;
  const recentQuiet = p30.transferCount === 0 || (Math.abs(p30.netTao) < 0.5 && p30.transferCount <= 1);
  if (yearMaterial && recentQuiet) {
    return {
      available: true,
      verdict: 'fading_flow',
      verdictReason: `365d window saw material flow (net ${p365.netTao >= 0 ? '+' : ''}${p365.netTao.toFixed(1)}τ over ${p365.transferCount} txns) but last 30d went quiet — flow regime has paused`,
      points: mwnf.points,
    };
  }

  // Reversal checks — recent 30d sign opposes 365d sign with both materially nonzero.
  const recentMaterial = Math.abs(p30.netTao) > matFloor;
  const yearNetMaterial = Math.abs(p365.netTao) > matFloor;
  if (recentMaterial && yearNetMaterial) {
    if (p30.netTao > 0 && p365.netTao < 0) {
      return {
        available: true,
        verdict: 'recent_reversal_to_accumulation',
        verdictReason: `30d net +${p30.netTao.toFixed(1)}τ flipped against 365d net ${p365.netTao.toFixed(1)}τ — recent direction change toward accumulation, prior arc was distribution`,
        points: mwnf.points,
      };
    }
    if (p30.netTao < 0 && p365.netTao > 0) {
      return {
        available: true,
        verdict: 'recent_reversal_to_distribution',
        verdictReason: `30d net ${p30.netTao.toFixed(1)}τ flipped against 365d net +${p365.netTao.toFixed(1)}τ — recent direction change toward distribution, prior arc was accumulation`,
        points: mwnf.points,
      };
    }
  }

  // Sustained-direction tests — all four windows share the sign of 365d AND
  // longer windows aren't dragging the shorter ones in the opposite direction.
  // Use net-per-window-day (netTao / windowDays) so we compare flow RATES across
  // windows of different lengths — a pure-net comparison is unfair because the
  // 365d window naturally accumulates more τ.
  const allPositive = nets.every((n) => n > 0);
  const allNegative = nets.every((n) => n < 0);
  if (allPositive && Math.abs(p365.netTao) > matFloor) {
    return {
      available: true,
      verdict: 'sustained_accumulation',
      verdictReason: `all four windows net positive (30d +${p30.netTao.toFixed(1)}τ → 365d +${p365.netTao.toFixed(1)}τ) — accumulation persists across the full year, not just recent activity`,
      points: mwnf.points,
    };
  }
  if (allNegative && Math.abs(p365.netTao) > matFloor) {
    return {
      available: true,
      verdict: 'sustained_distribution',
      verdictReason: `all four windows net negative (30d ${p30.netTao.toFixed(1)}τ → 365d ${p365.netTao.toFixed(1)}τ) — distribution persists across the full year, not just a recent trim`,
      points: mwnf.points,
    };
  }

  return {
    available: true,
    verdict: 'mixed',
    verdictReason: `windows split direction (30d ${p30.netTao >= 0 ? '+' : ''}${p30.netTao.toFixed(1)}τ · 90d ${p90.netTao >= 0 ? '+' : ''}${p90.netTao.toFixed(1)}τ · 180d ${p180.netTao >= 0 ? '+' : ''}${p180.netTao.toFixed(1)}τ · 365d ${p365.netTao >= 0 ? '+' : ''}${p365.netTao.toFixed(1)}τ) — no single durability arc, read each window separately`,
    points: mwnf.points,
  };
}

// §2d VOLATILITY — annualised stddev of daily returns from the balance
// history series. Same source the drawdown panel uses (one walk over the
// daily /api/account/history/v1 snapshots) — zero extra API cost. Pairs
// with the drawdown tile to answer two complementary risk questions:
//   - drawdown   = "how bad was the worst dip"
//   - volatility = "how bumpy is the ride day-to-day"
// Returns annualised vol (σ × √365), best/worst day pct, positive-day
// fraction, and a return-per-unit-risk ratio (annualised return ÷ vol,
// crypto's stand-in for Sharpe — no risk-free rate baked in).
export function volatilitySection({ series: preFetchedSeries, coldkey, days = 365 }) {
  const series = preFetchedSeries ? preFetchedSeries.slice(-days) : [];
  if (series.length < 14) {
    return { available: false, reason: 'insufficient_history', pointCount: series.length };
  }

  // Daily returns from consecutive snapshots. Skip pairs where the starting
  // balance is ≤ 0 (would blow up the ratio) and clamp extreme outliers to
  // ±200% so a single deposit/withdraw event doesn't dominate stddev. Real
  // crypto daily moves cap around ±20% — anything beyond is structural.
  const returns = [];
  // Track biggest absolute +/− τ moves in the same walk so §2 can surface
  // calendar-anchored "best/worst day" stats alongside the percent stats.
  // Deltas use raw balance diffs (no clamping) — clamping is only relevant for
  // ratio-based stddev math, not for "what was the single biggest τ move".
  let bestDeltaDay = null; // { date, deltaTao, prevBalanceTao, balanceTao }
  let worstDeltaDay = null;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].totalTao;
    const cur = series[i].totalTao;
    if (prev <= 0) continue;
    let r = (cur - prev) / prev;
    if (r > 2) r = 2;
    if (r < -2) r = -2;
    returns.push({ pct: r, date: series[i].timestamp });
    const delta = cur - prev;
    if (bestDeltaDay == null || delta > bestDeltaDay.deltaTao) {
      bestDeltaDay = { date: series[i].timestamp, deltaTao: delta, prevBalanceTao: prev, balanceTao: cur };
    }
    if (worstDeltaDay == null || delta < worstDeltaDay.deltaTao) {
      worstDeltaDay = { date: series[i].timestamp, deltaTao: delta, prevBalanceTao: prev, balanceTao: cur };
    }
  }
  if (returns.length < 14) {
    return { available: false, reason: 'too_few_returns', pointCount: returns.length };
  }

  const mean = returns.reduce((a, r) => a + r.pct, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r.pct - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualisedVol = dailyVol * Math.sqrt(365);

  // Annualised return: (end/start)^(365/days) − 1 using period total return.
  const startBal = series[0].totalTao;
  const endBal = series[series.length - 1].totalTao;
  const windowMs = new Date(series[series.length - 1].timestamp) - new Date(series[0].timestamp);
  const windowDays = Math.max(1, windowMs / (24 * 60 * 60 * 1000));
  const annualisedReturn = startBal > 0 ? (endBal / startBal) ** (365 / windowDays) - 1 : null;
  // Ratio: annualised return / annualised vol — crypto Sharpe-ish (rf=0).
  const returnPerRisk = annualisedReturn != null && annualisedVol > 0
    ? annualisedReturn / annualisedVol
    : null;

  const sorted = returns.slice().sort((a, b) => a.pct - b.pct);
  const worstDay = sorted[0];
  const bestDay = sorted[sorted.length - 1];
  const positiveDays = returns.filter((r) => r.pct > 0).length;
  const positiveDayPct = positiveDays / returns.length;

  // Rolling 30d annualised σ — one entry per day once the trailing window is
  // full. Lets §2 surface a vol trend sparkline beside the headline σ so the
  // user can see whether risk is climbing, stable, or fading.
  const WIN = 30;
  const volSeries = [];
  if (returns.length >= WIN) {
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < returns.length; i++) {
      sum += returns[i].pct;
      sumSq += returns[i].pct ** 2;
      if (i >= WIN) {
        const drop = returns[i - WIN].pct;
        sum -= drop;
        sumSq -= drop ** 2;
      }
      if (i >= WIN - 1) {
        const m = sum / WIN;
        const v = Math.max(0, sumSq / WIN - m * m);
        const sigma = Math.sqrt(v) * Math.sqrt(365);
        volSeries.push({ date: returns[i].date, sigma });
      }
    }
  }

  // 30-day daily-returns sparkline — symmetric around zero so positive days
  // sit high, negative low, and a flat day shows mid. Different signal from
  // the §1/§2 balance sparklines: shows VOLATILITY shape (which days were
  // big up/down moves) rather than accumulated balance. Soft-omits below 14
  // recent returns (matches §2 panel gating). Anchored on max(|return|) over
  // the window so a single outlier doesn't squash the rest of the shape.
  const returnsSparkline30d = (() => {
    const recent = returns.slice(-30);
    if (recent.length < 14) return null;
    const vals = recent.map((r) => r.pct);
    const maxAbs = Math.max(...vals.map((v) => Math.abs(v)));
    if (!(maxAbs > 0)) return null;
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const chars = vals
      .map((v) => {
        const t = (v + maxAbs) / (2 * maxAbs);
        const idx = Math.min(blocks.length - 1, Math.max(0, Math.floor(t * blocks.length)));
        return blocks[idx];
      })
      .join('');
    return {
      str: chars,
      points: recent.length,
      minPct: Math.min(...vals),
      maxPct: Math.max(...vals),
      firstDate: recent[0].date,
      lastDate: recent[recent.length - 1].date,
    };
  })();

  return {
    available: true,
    windowDays: Math.round(windowDays),
    returnsCount: returns.length,
    pointCount: series.length,
    dailyVolPct: dailyVol,
    annualisedVolPct: annualisedVol,
    annualisedReturnPct: annualisedReturn,
    returnPerRisk,
    bestDayPct: bestDay.pct,
    bestDayDate: bestDay.date,
    worstDayPct: worstDay.pct,
    worstDayDate: worstDay.date,
    positiveDayPct,
    positiveDayCount: positiveDays,
    firstDate: series[0].timestamp,
    lastDate: series[series.length - 1].timestamp,
    volSeries,
    bestDeltaDay,
    worstDeltaDay,
    returnsSparkline30d,
  };
}

// §2c AU TAX-YEAR BREAKDOWN — same formula as pnlGroundTruth, bucketed by
// Australian financial year (Jul 1 → Jun 30). Pulls 2 years of tax-report
// rows so FY24-25 (full) and FY25-26 (in progress) both have data. Carry-in
// balance for each FY is the last snapshot before the FY starts (so we don't
// double-count what was already in the wallet).
export async function taxYearSection({ coldkey, taoPrice, usdAud, balanceSeries: preFetchedBalance, fyRowsBySy: preFetchedFyRows }) {
  // Two data sources, both required for accurate per-FY PnL:
  //   1. Balance history (/api/account/history/v1) — full TOTAL balance per
  //      day INCLUDING alpha staking (tax/v1's total_balance excludes alpha).
  //      Used for start/end balances per FY.
  //   2. Tax report (/api/accounting/tax/v1) — transfers (in/out) per FY.
  //      Capped at 12 months per request, so one fetch per FY.
  // Caller can pre-fetch both (so pnlGroundTruth and taxYearSection share data
  // and don't burn free-tier rate limits with duplicate calls).
  const now = new Date();
  const currentFyStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fysToFetch = [currentFyStartYear - 1, currentFyStartYear];

  let balanceSeries = preFetchedBalance;
  let fyRowsBySy = preFetchedFyRows;
  if (!balanceSeries || !fyRowsBySy) {
    balanceSeries = await getBalanceHistory(coldkey, 730).catch(() => []);
    fyRowsBySy = new Map();
    for (const sy of fysToFetch) {
      const rows = await getTaxReportRange(
        coldkey, `${sy}-07-01`, `${sy + 1}-06-30`,
      ).catch(() => []);
      fyRowsBySy.set(sy, rows);
    }
  }

  if (balanceSeries.length < 2) {
    return { available: false, reason: 'insufficient_history' };
  }

  const buckets = [];
  let totalTransfers = 0;

  for (const sy of fysToFetch) {
    const fyStartMs = new Date(`${sy}-07-01T00:00:00Z`).getTime();
    const fyEndMs = new Date(`${sy + 1}-06-30T23:59:59Z`).getTime();

    // Find balance snapshot just BEFORE fyStart (carry-in) and last snapshot
    // WITHIN the FY (end balance). For the current in-progress FY, "end"
    // is the most recent snapshot we have.
    let priorSnap = null;
    let firstSnapInFy = null;
    let lastSnapInFy = null;
    for (const s of balanceSeries) {
      const ms = new Date(s.timestamp).getTime();
      if (ms < fyStartMs) {
        priorSnap = s;
      } else if (ms <= fyEndMs) {
        if (firstSnapInFy == null) firstSnapInFy = s;
        lastSnapInFy = s;
      }
    }
    if (lastSnapInFy == null) continue; // wallet has no data in this FY

    // Start balance:
    //   - If we have a snapshot BEFORE the FY started, use it (wallet pre-existed).
    //   - Otherwise the wallet was created mid-FY and we treat start = 0,
    //     so the first transfer-in counts as "money in" and isn't double-counted
    //     against an already-funded "first snapshot of the FY".
    const startBal = priorSnap ? priorSnap.totalTao : 0;
    const endBal = lastSnapInFy.totalTao;

    const txRows = fyRowsBySy.get(sy) || [];
    let transferIn = 0;
    let transferOut = 0;
    let txCount = 0;
    for (const r of txRows) {
      const t = r.transaction_type;
      if (t === 'transfer_in') {
        transferIn += Number(r.credit_amount || 0);
        txCount += 1;
      } else if (t === 'transfer_out') {
        transferOut += Number(r.debit_amount || 0);
        txCount += 1;
      }
    }
    totalTransfers += txCount;

    const profitTao = endBal + transferOut - transferIn - startBal;
    const denom = startBal + transferIn;
    const returnPct = denom > 0 ? profitTao / denom : 0;

    buckets.push({
      label: `FY${String(sy).slice(-2)}-${String(sy + 1).slice(-2)}`,
      startDate: `${sy}-07-01`,
      endDate: `${sy + 1}-06-30`,
      startBalanceTao: startBal,
      endBalanceTao: endBal,
      transferInTao: transferIn,
      transferOutTao: transferOut,
      profitTao,
      returnPct,
      profitUsd: profitTao * taoPrice,
      profitAud: profitTao * taoPrice * usdAud,
      snapshotCount: balanceSeries.filter((s) => {
        const ms = new Date(s.timestamp).getTime();
        return ms >= fyStartMs && ms <= fyEndMs;
      }).length,
      transferCount: txCount,
      isCurrentFy: sy === currentFyStartYear,
      carryInUsedPriorSnapshot: priorSnap != null,
      carryInDate: priorSnap ? priorSnap.timestamp : null,
    });
  }

  if (buckets.length === 0) {
    return { available: false, reason: 'no_data_in_window' };
  }
  return {
    available: true,
    buckets,
    pointCount: balanceSeries.length,
    transferCount: totalTransfers,
    firstDate: balanceSeries[0].timestamp,
    lastDate: balanceSeries[balanceSeries.length - 1].timestamp,
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
  const change1hTao = periodChange('pct1h');
  const change24hTao = periodChange('pct1d');
  const change7dTao = periodChange('pct7d');
  const change30dTao = periodChange('pct1m');

  // iter 140 — alpha-weighted multi-window price-momentum quartet.
  // The existing 24h/7d/30d deltas are computed above; 1h completes the
  // quartet so §0 can read the portfolio across a full depth ladder
  // (hour → month) instead of just the 1d slice. Verdict is derived from
  // the 1d/7d/30d trio only — 1h is shown as detail but excluded from
  // the directional verdict to avoid intra-hour noise flipping the read.
  // Pairs with iter 137's multi-window net-flow durability on the
  // BEHAVIOURAL axis — this is the equivalent on the PRICE axis.
  const multiWindowPriceMomentum = (() => {
    if (currentTao <= 0) {
      return { available: false, reason: 'empty_portfolio' };
    }
    const pctOf = (deltaTao) => (deltaTao / currentTao) * 100;
    const windows = [
      { label: '1h', changeTao: change1hTao, changeUsd: change1hTao * taoPrice, pctPortfolio: pctOf(change1hTao) },
      { label: '1d', changeTao: change24hTao, changeUsd: change24hTao * taoPrice, pctPortfolio: pctOf(change24hTao) },
      { label: '7d', changeTao: change7dTao, changeUsd: change7dTao * taoPrice, pctPortfolio: pctOf(change7dTao) },
      { label: '30d', changeTao: change30dTao, changeUsd: change30dTao * taoPrice, pctPortfolio: pctOf(change30dTao) },
    ];
    const FLAT_THRESHOLD_PCT = 0.5;
    const trio = [windows[1], windows[2], windows[3]]; // 1d / 7d / 30d
    const sign = (w) => {
      if (Math.abs(w.pctPortfolio) < FLAT_THRESHOLD_PCT) return 0;
      return w.pctPortfolio > 0 ? 1 : -1;
    };
    const signs = trio.map(sign);
    const all = (s) => signs.every((x) => x === s);
    let verdict;
    let verdictReason;
    if (all(0)) {
      verdict = 'flat';
      verdictReason = 'all three windows (1d/7d/30d) within ±0.5% of portfolio — no directional read across price-momentum ladder';
    } else if (all(1)) {
      verdict = 'sustained_uptrend';
      verdictReason = `portfolio up across 1d (${windows[1].pctPortfolio.toFixed(2)}%) / 7d (${windows[2].pctPortfolio.toFixed(2)}%) / 30d (${windows[3].pctPortfolio.toFixed(2)}%) — durable price tailwind`;
    } else if (all(-1)) {
      verdict = 'sustained_downtrend';
      verdictReason = `portfolio down across 1d (${windows[1].pctPortfolio.toFixed(2)}%) / 7d (${windows[2].pctPortfolio.toFixed(2)}%) / 30d (${windows[3].pctPortfolio.toFixed(2)}%) — durable price headwind, not just a one-day blip`;
    } else if (signs[2] === -1 && signs[1] === -1 && signs[0] === 1) {
      verdict = 'recent_reversal_to_up';
      verdictReason = `30d (${windows[3].pctPortfolio.toFixed(2)}%) and 7d (${windows[2].pctPortfolio.toFixed(2)}%) negative but 1d (${windows[1].pctPortfolio.toFixed(2)}%) positive — recent bounce off a longer drawdown, not yet a durable reversal`;
    } else if (signs[2] === 1 && signs[1] === 1 && signs[0] === -1) {
      verdict = 'recent_reversal_to_down';
      verdictReason = `30d (${windows[3].pctPortfolio.toFixed(2)}%) and 7d (${windows[2].pctPortfolio.toFixed(2)}%) positive but 1d (${windows[1].pctPortfolio.toFixed(2)}%) negative — recent top off a longer uptrend, watch for confirmation`;
    } else {
      verdict = 'chop';
      verdictReason = `mixed signs across windows 1d:${windows[1].pctPortfolio.toFixed(2)}% / 7d:${windows[2].pctPortfolio.toFixed(2)}% / 30d:${windows[3].pctPortfolio.toFixed(2)}% — no clean directional read`;
    }
    return {
      available: true,
      windows,
      verdict,
      verdictReason,
      flatThresholdPct: FLAT_THRESHOLD_PCT,
    };
  })();

  // Per-subnet breakdown
  const perSubnet = [];
  const subnetMap = new Map(allPositions.map((p) => [p.netuid, p]));
  const allNetuids = new Set([...subnetMap.keys(), ...bySubnet.keys()]);
  for (const nid of allNetuids) {
    const pos = subnetMap.get(nid);
    const tx = bySubnet.get(nid) || { spent: 0, sold: 0 };
    const current = pos?.taoValue || 0;
    // Attach pct7d from screener so the §4 PnL row can render a 7d price trend
    // chip without needing a second pass over screener.byNetuid on the client.
    // Null when subnet isn't in screener (rare: e.g. fully de-registered subnet
    // that we still have spend history for) — chip soft-omits in that case.
    const sn = screener?.byNetuid?.[nid];
    const pct7d = sn && sn.price_7d_pct_change != null ? Number(sn.price_7d_pct_change) : null;
    perSubnet.push({
      netuid: nid,
      name: pos?.name || `Subnet ${nid}`,
      currentTao: current,
      spentTao: tx.spent,
      soldTao: tx.sold,
      pnlTao: current + tx.sold - tx.spent,
      pct7d,
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
    change1hTao,
    change1hUsd: change1hTao * taoPrice,
    change24hTao,
    change24hUsd: change24hTao * taoPrice,
    change7dTao,
    change7dUsd: change7dTao * taoPrice,
    change30dTao,
    change30dUsd: change30dTao * taoPrice,
    multiWindowPriceMomentum,
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
  const subnetPrice = (nid) => Number(screener?.byNetuid?.[nid]?.price || 0) || null;

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
      alphaPriceTao: subnetPrice(h.netuid),
      apy: effectiveApy,
      apyIsFallback: apy == null && fallback != null,
      // Per-window APYs for trend visualisation. Only emit when the actual
      // validator matched (not subnet-median fallback) — otherwise the trend
      // would reflect the median of all validators rather than this specific one.
      apy1h: match ? match.apy1h ?? null : null,
      apy1d: match ? match.apy1d ?? null : null,
      apy7d: match ? match.apy7d ?? null : null,
      apy30d: match ? match.apy30d ?? null : null,
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

  // Weighted-APY trend across windows. Re-run the same alpha-weighted average
  // once per {apy30d, apy7d, apy1d} window so we can show the user whether
  // their portfolio-level yield is climbing, holding, or fading vs the
  // trailing 30d baseline. Only emit a window if coverage >= 50% of total
  // alpha (otherwise the headline number would over-represent a tiny slice).
  const COVERAGE_FLOOR = 0.5;
  const computeWindowApy = (windowKey) => {
    let w = 0;
    let wTotal = 0;
    for (const p of perPosition) {
      const v = p[windowKey];
      if (v != null) {
        w += v * p.alphaTokens;
        wTotal += p.alphaTokens;
      }
    }
    if (wTotal === 0 || totalAlpha === 0) return null;
    if (wTotal / totalAlpha < COVERAGE_FLOOR) return null;
    return w / wTotal;
  };
  const weightedApySeries = [
    { label: '30d', value: computeWindowApy('apy30d') },
    { label: '7d', value: computeWindowApy('apy7d') },
    { label: '1d', value: computeWindowApy('apy1d') },
  ].filter((row) => row.value != null);

  return {
    weightedApy,
    bestCaseWeightedApy,
    liftIfOptimised,
    coverage: totalAlpha > 0 ? weightedTotal / totalAlpha : 0,
    weightedApySeries,
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

  // Delegation-opportunity recommendations — surface the highest-impact
  // re-delegation candidates from yieldSection's enriched per-position data.
  // Each is a concrete "move alpha on sn<N> from validator X to validator Y"
  // sized by potential τ/yr lift, so the user can act on them directly.
  if (Array.isArray(yieldData?.delegationOpportunities) && yieldData.delegationOpportunities.length > 0) {
    for (const op of yieldData.delegationOpportunities) {
      if (out.length >= 5) break;
      if (seenSubnets.has(op.netuid)) continue;
      const apyPct = (op.apy * 100).toFixed(1);
      const bestPct = (op.subnetBestApy * 100).toFixed(1);
      const liftPerYear = op.potentialLiftTaoPerYear.toFixed(3);
      out.push({
        netuid: op.netuid,
        observation: `${op.subnetName} (sn${op.netuid}): your validator yields ${apyPct}% vs the subnet's best at ${bestPct}% (Δ ${(op.deltaToBest * 100).toFixed(1)}pp).`,
        action: `Re-delegate ${op.alphaTokens.toFixed(2)} α off your current validator — best validator on this subnet would add ≈ ${liftPerYear} τ/yr at current alpha levels.`,
      });
      seenSubnets.add(op.netuid);
    }
  }

  // Fallback yield-spread rec only if no delegation opportunities surfaced.
  if (out.length < 5 && yieldData.best && yieldData.worst && yieldData.best.apy != null && yieldData.worst.apy != null) {
    const spread = yieldData.best.apy - yieldData.worst.apy;
    const hasDelegOps = Array.isArray(yieldData.delegationOpportunities) && yieldData.delegationOpportunities.length > 0;
    if (spread > 0.1 && !hasDelegOps && !seenSubnets.has(yieldData.worst.netuid)) {
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
export function broader({ screener, taoPrice, portfolio: port }) {
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
      pct7d: r.price_7d_pct_change != null ? Number(r.price_7d_pct_change) : null,
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

  // Top movers by 7d price change — symmetric to topMovers24h. A 24h table
  // alone misses the week's narrative: a subnet may be flat today but on a
  // multi-day tear (or bleed). Sorted by abs(7d) so both directions surface,
  // colored per-row in the UI by sign. Same tradeability filter as 24h.
  const sortedBy7d = rows
    .filter((r) => r.price_7d_pct_change != null && isTradeable(r))
    .sort((a, b) => Math.abs(Number(b.price_7d_pct_change)) - Math.abs(Number(a.price_7d_pct_change)))
    .slice(0, 5)
    .map((r) => ({
      netuid: r.netuid,
      name: r.subnet_name || `Subnet ${r.netuid}`,
      priceTao: Number(r.price),
      pct7d: Number(r.price_7d_pct_change),
      pct1d: r.price_1d_pct_change != null ? Number(r.price_1d_pct_change) : null,
      volumeTao24h: Number(r.total_volume_tao_1d || 0),
    }));

  // Subnets to watch — top 3 positive 7d gainers NOT already in the portfolio.
  // Turns §6 from passive market context into an active "here's what's running
  // that you don't own yet" prompt.
  const heldNetuids = new Set((port?.allPositions || []).map((p) => p.netuid));
  const subnetsToWatch = rows
    .filter((r) =>
      r.price_7d_pct_change != null &&
      isTradeable(r) &&
      Number(r.price_7d_pct_change) > 0 &&
      !heldNetuids.has(r.netuid)
    )
    .sort((a, b) => Number(b.price_7d_pct_change) - Number(a.price_7d_pct_change))
    .slice(0, 3)
    .map((r) => ({
      netuid: r.netuid,
      name: r.subnet_name || `Subnet ${r.netuid}`,
      priceTao: Number(r.price),
      pct7d: Number(r.price_7d_pct_change),
      pct1d: r.price_1d_pct_change != null ? Number(r.price_1d_pct_change) : null,
      volumeTao24h: Number(r.total_volume_tao_1d || 0),
    }));

  // Subnets to trim — top 3 worst 7d performers AMONG HELD positions.
  // Counterpart to subnetsToWatch: that says "what's running you don't own",
  // this says "what you own is bleeding the most". Direct action signal.
  const screenerByNetuid = new Map(rows.map((r) => [r.netuid, r]));
  const subnetsToTrim = (port?.allPositions || [])
    .map((pos) => {
      const r = screenerByNetuid.get(pos.netuid);
      if (!r || r.price_7d_pct_change == null) return null;
      const pct7d = Number(r.price_7d_pct_change);
      if (!(pct7d < 0)) return null;
      return {
        netuid: pos.netuid,
        name: pos.name || r.subnet_name || `Subnet ${pos.netuid}`,
        priceTao: Number(r.price),
        pct7d,
        pct1d: r.price_1d_pct_change != null ? Number(r.price_1d_pct_change) : null,
        valueTao: Number(pos.valueTao || 0),
        pctOfPortfolio:
          pos.pctOfPortfolio != null ? Number(pos.pctOfPortfolio) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.pct7d - b.pct7d)
    .slice(0, 3);

  // Market context strip: a 4-number snapshot above the §6 movers tables.
  // Frames every per-subnet figure below ("is +5% a big day?") against the
  // market's typical day. Median (not mean) so a single 200% pump doesn't
  // skew the centre. Computed over tradeable subnets only — dead listings
  // would pin the median at 0 and hide real movement.
  const tradeableRows = rows.filter(isTradeable);
  const median = (arr) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const pct1dVals = tradeableRows
    .filter((r) => r.price_1d_pct_change != null)
    .map((r) => Number(r.price_1d_pct_change));
  const pct7dVals = tradeableRows
    .filter((r) => r.price_7d_pct_change != null)
    .map((r) => Number(r.price_7d_pct_change));
  const volVals = tradeableRows.map((r) => Number(r.total_volume_tao_1d || 0));
  const pct1dGreen = pct1dVals.filter((v) => v > 0).length;
  const pct1dRed = pct1dVals.filter((v) => v < 0).length;
  const marketContext = {
    totalActive: rows.length,
    tradeableCount: tradeableRows.length,
    median24hPct: median(pct1dVals),
    median7dPct: median(pct7dVals), // used by §6 watch/trim "vs market" chip
    median24hVolumeTao: median(volVals),
    greenCount: pct1dGreen,
    redCount: pct1dRed,
    breadth:
      pct1dGreen + pct1dRed > 0
        ? (pct1dGreen / (pct1dGreen + pct1dRed)) * 100
        : null, // percent of moving subnets that are up — 50 = balanced
  };

  // Portfolio context: same 4 numbers but computed over the user's holdings.
  // Paired with marketContext in the §6 strip so Jai sees at a glance whether
  // his book is leaning with or against the market today — e.g. market median
  // -0.6% (risk-off) but your median +1.2% (you're outperforming).
  const positions = port?.allPositions || [];
  let portfolioContext = null;
  if (positions.length > 0) {
    const posPct1d = positions
      .map((p) => (p.pct1d != null ? Number(p.pct1d) : null))
      .filter((v) => v != null);
    const posValues = positions.map((p) => Number(p.taoValue || 0));
    const posGreen = posPct1d.filter((v) => v > 0).length;
    const posRed = posPct1d.filter((v) => v < 0).length;
    portfolioContext = {
      positionCount: positions.length,
      coveredCount: posPct1d.length,
      median24hPct: median(posPct1d),
      medianPositionValueTao: median(posValues),
      greenCount: posGreen,
      redCount: posRed,
      breadth:
        posGreen + posRed > 0 ? (posGreen / (posGreen + posRed)) * 100 : null,
    };
  }

  return {
    taoPrice,
    subnetCount: rows.length,
    marketContext,
    portfolioContext,
    topMovers24h: sortedBy24h,
    topMovers7d: sortedBy7d,
    topByVolume24h: sortedByVolume,
    subnetsToWatch,
    subnetsToTrim,
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

// Force-refresh: build a fresh report AND overwrite the cache, so subsequent
// SSR / OG / API hits see the fresh data. Used by skipCache=true POST paths
// so debug invocations also clear poisoned cache entries.
export async function buildAndCacheReport(coldkey) {
  const data = await buildReport(coldkey);
  reportCache.set(coldkey, { at: Date.now(), data });
  return data;
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

  // Pre-fetch the tax-report data ONCE and SEQUENTIALLY here, then share between
  // pnlGroundTruth and taxYearSection. Reason: free-tier Taostats key rate-limits
  // (HTTP 429) when 3+ tax/v1 calls fire in parallel from a single Vercel cold
  // start. Sequential + shared avoids that.
  const now = new Date();
  const currentFyStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fysToFetch = [currentFyStartYear - 1, currentFyStartYear];
  const balanceSeriesP = getBalanceHistory(coldkey, 730).catch(() => []);
  const latestBalanceP = getLatestBalance(coldkey).catch(() => null);
  const fyRowsBySy = new Map();
  for (const sy of fysToFetch) {
    const rows = await getTaxReportRange(
      coldkey, `${sy}-07-01`, `${sy + 1}-06-30`,
    ).catch(() => []);
    fyRowsBySy.set(sy, rows);
  }
  const balanceSeries = await balanceSeriesP;
  const latestBalance = await latestBalanceP;

  // Trailing 365d rows for pnlGroundTruth = the current FY rows (close enough
  // to "trailing 365 days" in May — we're in month 11 of FY25-26).
  const trailingRows = fyRowsBySy.get(currentFyStartYear) || [];

  const [p, gt, dd, ty] = await Promise.all([
    pnl({
      holdings,
      history,
      screener,
      taoPrice,
      allPositions: port.allPositions,
    }),
    pnlGroundTruth({
      coldkey,
      days: 365,
      taoPrice,
      usdAud,
      rows: trailingRows,
      balance: latestBalance,
    }),
    drawdownSection({ coldkey, days: 365, series: balanceSeries }).catch(() => ({
      available: false,
      reason: 'fetch_failed',
    })),
    taxYearSection({
      coldkey,
      taoPrice,
      usdAud,
      balanceSeries,
      fyRowsBySy,
    }).catch(() => ({
      available: false,
      reason: 'fetch_failed',
    })),
  ]);
  // Volatility — sync, off the same series we already fetched for drawdown.
  const vol = volatilitySection({ series: balanceSeries, days: 365 });
  const y = await yieldSection({ holdings, screener });
  const f = flags({ portfolio: port, pnl: p });
  const r = recs({ flags: f, portfolio: port, yieldData: y });
  const b = broader({ screener, taoPrice, portfolio: port });

  // Portfolio-level Δ pills — pick the balance snapshot closest to (latest −
  // window) with a tolerated slop (half the window, capped at 36h). Surfaces
  // an emotional "you're up/down" anchor above §1 for both today and the
  // trailing week. Soft-omits if we don't have enough history.
  const computeDelta = (windowHours) => {
    if (!Array.isArray(balanceSeries) || balanceSeries.length < 2) return null;
    const last = balanceSeries[balanceSeries.length - 1];
    const lastT = new Date(last.timestamp).getTime();
    const windowMs = windowHours * 60 * 60 * 1000;
    const targetT = lastT - windowMs;
    const slopMs = Math.min(36, windowHours / 2) * 60 * 60 * 1000;
    let prior = null;
    let bestDiff = Infinity;
    for (let i = balanceSeries.length - 2; i >= 0; i--) {
      const t = new Date(balanceSeries[i].timestamp).getTime();
      const diff = Math.abs(t - targetT);
      if (diff < bestDiff) {
        bestDiff = diff;
        prior = balanceSeries[i];
      }
      if (t < targetT - slopMs) break;
    }
    if (!prior || !(prior.totalTao > 0) || bestDiff > slopMs) return null;
    const deltaTao = last.totalTao - prior.totalTao;
    return {
      deltaTao,
      deltaPct: deltaTao / prior.totalTao,
      deltaUsd: deltaTao * taoPrice,
      deltaAud: deltaTao * taoPrice * usdAud,
      currentTao: last.totalTao,
      priorTao: prior.totalTao,
      priorDate: prior.timestamp,
      currentDate: last.timestamp,
    };
  };
  const delta24h = computeDelta(24);
  const delta7d = computeDelta(24 * 7);

  // 30-day balance sparkline — last 30 daily snapshots rendered as unicode
  // block chars. Pure-string output so the client renders it inline beside the
  // Total τ stat tile without any chart library. Soft-omits when <7 snapshots.
  const sparkline30d = (() => {
    if (!Array.isArray(balanceSeries) || balanceSeries.length < 7) return null;
    const slice = balanceSeries.slice(-30).filter((s) => s.totalTao > 0);
    if (slice.length < 7) return null;
    const vals = slice.map((s) => s.totalTao);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    // When min === max (flat wallet) render a single mid-level bar across.
    const chars = vals
      .map((v) => {
        if (!(max > min)) return blocks[3];
        const t = (v - min) / (max - min);
        const idx = Math.min(blocks.length - 1, Math.max(0, Math.floor(t * blocks.length)));
        return blocks[idx];
      })
      .join('');
    return {
      str: chars,
      points: slice.length,
      minTao: min,
      maxTao: max,
      firstTao: vals[0],
      lastTao: vals[vals.length - 1],
      firstDate: slice[0].timestamp,
      lastDate: slice[slice.length - 1].timestamp,
    };
  })();

  // Drop the heavy internal allPositions from the response
  const { allPositions, ...portClean } = port;
  portClean.delta24h = delta24h;
  portClean.delta7d = delta7d;
  portClean.sparkline30d = sparkline30d;

  // Per-position kind classifier — shared between iter 94 chip logic and
  // iter 96 alignment counting. Returns null when the row is too flat to
  // assign a shape (matches the per-row chip soft-omit threshold).
  const classifyTrendKind = (pct24h, pct7d) => {
    if (pct24h == null || pct7d == null) return null;
    if (!Number.isFinite(pct24h) || !Number.isFinite(pct7d)) return null;
    if (Math.abs(pct24h) < 0.1 || Math.abs(pct7d) < 0.1) return null;
    const sameSign = (pct24h > 0 && pct7d > 0) || (pct24h < 0 && pct7d < 0);
    const oppSign = (pct24h > 0 && pct7d < 0) || (pct24h < 0 && pct7d > 0);
    if (sameSign && pct7d > 0) return 'rally';
    if (sameSign && pct7d < 0) return 'bleed';
    if (oppSign && pct24h > 0) return 'bounce';
    if (oppSign && pct24h < 0) return 'pullback';
    return null;
  };

  // Portfolio-level day-vs-week trend hint — aggregate complement to the
  // per-position chips. Same emoji vocabulary as the row chips but expresses
  // the whole book's day shape vs week shape in a single stat-grid tile.
  // pct values derived from the existing delta objects (deltaPct is already
  // the proportion change vs the prior snapshot).
  const trendHint = (() => {
    if (!delta24h || !delta7d) return null;
    const pct24h = Number(delta24h.deltaPct) * 100;
    const pct7d = Number(delta7d.deltaPct) * 100;
    const kind = classifyTrendKind(pct24h, pct7d);
    if (!kind) return null;
    const meta = {
      rally: { emoji: '📈', label: 'Week-long rally' },
      bleed: { emoji: '📉', label: 'Week-long bleed' },
      bounce: { emoji: '↩️', label: 'Bounce off weekly low' },
      pullback: { emoji: '🔻', label: 'Pullback in uptrend' },
    }[kind];
    // Alignment — how many of the top10 holdings carry the SAME shape kind.
    // Bridges the aggregate read with the per-row chips: 9/10 = broad move,
    // 2/10 = aggregate driven by one or two big positions while the rest are
    // mixed (a narrative-concentration signal). Soft-omit when fewer than 5
    // classifiable positions — not enough to draw a conclusion from.
    const alignment = (() => {
      const top = portClean.top10 || [];
      const classified = top
        .map((pos) => classifyTrendKind(pos.pct1d, pos.pct7d))
        .filter((k) => k != null);
      if (classified.length < 5) return null;
      const matches = classified.filter((k) => k === kind).length;
      return { matches, total: classified.length };
    })();
    return { kind, ...meta, pct24h, pct7d, alignment };
  })();
  portClean.trendHint = trendHint;

  const pnlDecomp = pnlDecomposition({ gt, weightedApy: y?.weightedApy });
  const apyTrend = apyTrendVerdict({ y });
  const valConc = validatorConcentration({ y });
  const ddVerdict = drawdownVerdict({ dd, gt });
  const sfVerdict = stakingFlowVerdict({ gt, dd });

  // Iter 137 — multi-window net-flow comparison. Combine prior + current FY rows
  // so the 365d window has real coverage (current-FY-only would underfill in the
  // first half of any new FY). Then derive a durability verdict from the four
  // window net tallies and attach to the staking-flow verdict so §0 reads
  // recent-flow shape against the long arc, not just the single-window snapshot.
  const allTaxRows = [];
  for (const sy of fysToFetch) {
    const rows = fyRowsBySy.get(sy);
    if (Array.isArray(rows)) allTaxRows.push(...rows);
  }
  const mwnf = multiWindowNetFlow({ rows: allTaxRows });
  const mwDurability = multiWindowDurabilityVerdict({
    mwnf,
    book: gt?.currentPortfolioTao,
  });

  // Iter 142 — Drive-sheet PnL parity. Jai's Bittensor portfolio tracker
  // (Drive 10Nl8u…) computes PnL with TWO transfer-based formulas:
  //   - Accumulation (Subnets/Mantat/Mum_subnets/Mum_mantat):
  //       net_pnl = Σ(sell) + current − Σ(buy)
  //     Treating transferIn as Σ(buy) and transferOut as Σ(sell) for
  //     subnet-trading wallets where TAO movements ARE the cost basis.
  //   - Harvest (Root/Mum_root/Mum_smf):
  //       earnings = current − (transferIn − transferOut)
  // Both reduce algebraically to: current + transferOut − transferIn
  // (the sheet doesn't subtract a window starting balance — it treats
  // lifetime net funding as the cost basis).
  //
  // The app's headline `profitTao` is `current + windowOut − windowIn − starting`.
  // That formula matches the sheet ONLY when the wallet's pre-window
  // history is captured cleanly by the snapshot's starting balance —
  // for wallets funded mostly INSIDE the window with starting≈0, the
  // two agree. For wallets with significant pre-window funding + yield
  // (a multi-year harvest wallet like Jai's Root coldkey), the app
  // subtracts the starting balance (which already absorbed years of
  // yield) and reports only the WITHIN-WINDOW delta, while the sheet
  // reports the FULL gain vs lifetime cost basis.
  //
  // This iter ships the sheet's transfer-based formula on the side
  // (non-regressive — headline profitTao unchanged) so divergence is
  // visible. lifetimeTransferIn/Out tally over allTaxRows (covers the
  // 2-FY fetch built above — adequate for wallets funded in the last
  // ~24 months, which covers all of Jai's seven pinned coldkeys per
  // iter 141 truth row). Iter 143 candidate: extend fysToFetch loop
  // backwards conditionally for wallets where the 2-FY tally misses
  // the funding event.
  let lifetimeTransferInTao = 0;
  let lifetimeTransferOutTao = 0;
  let hasDelegationEvents = false;
  for (const r of allTaxRows) {
    const t = r.transaction_type;
    if (t === 'transfer_in') lifetimeTransferInTao += Number(r.credit_amount || 0);
    else if (t === 'transfer_out') lifetimeTransferOutTao += Number(r.debit_amount || 0);
    else if (t === 'delegation_buy' || t === 'delegation_sell') hasDelegationEvents = true;
  }
  // Wallet-type heuristic — names which sheet formula applies. Order of
  // checks matters: delegation_buy/sell rows are the strongest signal
  // (those events only happen on accumulation wallets that trade
  // subnets); a zero-transfer wallet with positive daily income is the
  // canonical harvest pattern.
  let walletTypeHeuristic = 'unknown';
  const transferTotal = lifetimeTransferInTao + lifetimeTransferOutTao;
  const dailyInc = Number(gt?.dailyIncomeTao || 0);
  if (hasDelegationEvents) walletTypeHeuristic = 'accumulation';
  else if (transferTotal === 0 && dailyInc > 0) walletTypeHeuristic = 'harvest';
  else if (dailyInc > 0 && transferTotal > 0) walletTypeHeuristic = 'harvest';
  else if (transferTotal > 0) walletTypeHeuristic = 'accumulation';

  if (gt && gt.available && Number.isFinite(gt.currentPortfolioTao)) {
    const sheetParityProfitTao =
      gt.currentPortfolioTao - (lifetimeTransferInTao - lifetimeTransferOutTao);
    const sheetParityCostBasis = lifetimeTransferInTao - lifetimeTransferOutTao;
    const sheetParityReturnPct =
      sheetParityCostBasis > 0 ? sheetParityProfitTao / sheetParityCostBasis : null;
    const formulaDivergenceTao = Math.abs(gt.profitTao - sheetParityProfitTao);

    const matchThresholdTao = 0.05;
    let parityVerdict;
    let parityVerdictReason;
    if (formulaDivergenceTao < matchThresholdTao) {
      parityVerdict = 'matched';
      parityVerdictReason = `app's window-formula PnL (${gt.profitTao.toFixed(3)}τ) agrees with the sheet's lifetime transfer formula (${sheetParityProfitTao.toFixed(3)}τ) within ${matchThresholdTao}τ — wallet appears fresh-funded inside the window`;
    } else if (walletTypeHeuristic === 'harvest') {
      parityVerdict = 'harvest_preferred';
      parityVerdictReason = `harvest wallet: sheet earnings = current − (lifetimeIn − lifetimeOut) = ${sheetParityProfitTao.toFixed(3)}τ; app's window formula yields ${gt.profitTao.toFixed(3)}τ, diverging by ${formulaDivergenceTao.toFixed(3)}τ (likely pre-window yield absorbed by starting-balance subtraction)`;
    } else if (walletTypeHeuristic === 'accumulation') {
      parityVerdict = 'accumulation_preferred';
      parityVerdictReason = `accumulation wallet: sheet net_pnl = Σsell + current − Σbuy = ${sheetParityProfitTao.toFixed(3)}τ; app's window formula yields ${gt.profitTao.toFixed(3)}τ, diverging by ${formulaDivergenceTao.toFixed(3)}τ (likely pre-window starting balance absorbed funding)`;
    } else {
      parityVerdict = 'divergent_unclassified';
      parityVerdictReason = `app ${gt.profitTao.toFixed(3)}τ vs sheet ${sheetParityProfitTao.toFixed(3)}τ (Δ ${formulaDivergenceTao.toFixed(3)}τ) — wallet's transfer pattern doesn't match either harvest or accumulation heuristic`;
    }

    gt.sheetParityProfitTao = sheetParityProfitTao;
    gt.sheetParityReturnPct = sheetParityReturnPct;
    gt.lifetimeTransferInTao = lifetimeTransferInTao;
    gt.lifetimeTransferOutTao = lifetimeTransferOutTao;
    gt.walletTypeHeuristic = walletTypeHeuristic;
    gt.formulaDivergenceTao = formulaDivergenceTao;
    gt.pnlFormulaParity = {
      available: true,
      accumulationFormulaTao: gt.profitTao,
      sheetFormulaTao: sheetParityProfitTao,
      sheetReturnPct: sheetParityReturnPct,
      divergenceTao: formulaDivergenceTao,
      walletTypeHeuristic,
      hasDelegationEvents,
      lifetimeTransferInTao,
      lifetimeTransferOutTao,
      verdict: parityVerdict,
      verdictReason: parityVerdictReason,
    };
  }

  // Iter 138 — multi-window enrichment was previously gated on sfVerdict.available,
  // which kept it invisible on Jai's primary 5Cnz1juP… coldkey where the FY-windowed
  // pnlGroundTruth returns available:false (no transfer events inside the current FY
  // window) even though the 365d raw tax-row scan has data. The two layers are
  // independent — single-window staking-flow reads gt.transferInTao (FY-windowed),
  // multi-window reads raw allTaxRows (365d rolling). Attach unconditionally; the
  // inner availability flags on mwnf and mwDurability still gate downstream renders.
  if (sfVerdict) {
    sfVerdict.multiWindowNetFlow = mwnf;
    sfVerdict.multiWindowDurability = mwDurability;
  }

  return {
    coldkey,
    generatedAt: new Date().toISOString(),
    taoPriceUsd: taoPrice,
    usdAud,
    portfolio: portClean,
    pnl: p,
    pnlGroundTruth: gt,
    pnlDecomp,
    apyTrend,
    validatorConcentration: valConc,
    drawdown: dd,
    drawdownVerdict: ddVerdict,
    stakingFlowVerdict: sfVerdict,
    volatility: vol,
    taxYear: ty,
    yield: y,
    flags: f,
    recommendations: r,
    broader: b,
  };
}
