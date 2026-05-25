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
    dailyIncomeSeries,
    firstSnapshotDate,
    lastSnapshotDate,
    snapshotCount,
    transferCount,
    formula: 'current + transfer_out - transfer_in - starting',
    source: 'taostats /api/accounting/tax/v1',
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
    series: ddSeries,
    sparkline90d,
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
  const volVals = tradeableRows.map((r) => Number(r.total_volume_tao_1d || 0));
  const pct1dGreen = pct1dVals.filter((v) => v > 0).length;
  const pct1dRed = pct1dVals.filter((v) => v < 0).length;
  const marketContext = {
    totalActive: rows.length,
    tradeableCount: tradeableRows.length,
    median24hPct: median(pct1dVals),
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

  return {
    coldkey,
    generatedAt: new Date().toISOString(),
    taoPriceUsd: taoPrice,
    usdAud,
    portfolio: portClean,
    pnl: p,
    pnlGroundTruth: gt,
    drawdown: dd,
    volatility: vol,
    taxYear: ty,
    yield: y,
    flags: f,
    recommendations: r,
    broader: b,
  };
}
