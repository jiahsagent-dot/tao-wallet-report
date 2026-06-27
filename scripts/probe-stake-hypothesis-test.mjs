// iter 226 stake-valuation parity — two-part hypothesis test.
//
// iter 225 isolated the residual stake-leg drift (Jai mantat: +16.197 mτ at aligned
// anchor) to one of two candidates after ruling out (a/b/c/f) via current-block
// RAO-exact cross-check:
//   (g) sub-12s block-time skew — archive nearest-block lookup vs Taostats EOD
//       snapshot block magnified on active wallets
//   (h) Taostats balance_staked includes pending alpha emission during the
//       snapshot day while archive reads only raw at-block SubstakeShares.
//       (Decoder already exposes entry.emissionAlpha + entry.alphaEmissionAlpha
//        — getColdkeyStakeAlpha just doesn't sum them.)
//
// This probe runs both tests on Jai mantat at the iter 224-aligned anchor and
// localizes which (if either) explains the residual.
//
// METHOD:
//   1. Fetch Taostats /api/account/history/v1 → firstSnapshotDate EOD + balance_staked
//      (re-derive each run; anchor block drifts day-over-day as window slides).
//   2. Derive alignedSecondsAgo from firstSnapshotDate (iter 224 alignment fix).
//   3. Compute target archive block number from alignedSecondsAgo.
//   4. (g) BLOCK-SENSITIVITY SWEEP: for delta in [-100, -5, -1, 0, +1, +5, +100],
//      call getHistoricalColdkeyBalance and record stakeTao. Chart sensitivity.
//   5. (h) EMISSION-INCLUSIVE DECODE: at the target blockHash (delta=0),
//      re-aggregate stake.entries summing stakeAlpha + emissionAlpha +
//      alphaEmissionAlpha per (hotkey, netuid), multiply by same per-subnet
//      price, sum. Compare three totals (rawStake / +emission / +alpha_emission /
//      +both) against Taostats balance_staked.
//   6. Verdict matrix → decision for iter 227.
//
// Courteous-RPC: 50ms sleep between archive calls (per iter 225 budget note).
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-stake-hypothesis-test.mjs

import {
  getHistoricalColdkeyBalance,
  getHistoricalColdkeyStakeAlpha,
  getHistoricalSubnetPrices,
  getArchiveFinalizedHead,
  getArchiveBlockHash,
  blockNumberForSecondsAgo,
} from '../lib/freeRpc.js';

const COLDKEY = '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn'; // Jai mantat
const LABEL = 'Jai mantat';
const WINDOW_DAYS = 30;
const TAOSTATS_BASE = 'https://api.taostats.io';
const SWEEP_DELTAS = [-100, -5, -1, 0, +1, +5, +100];
const SLEEP_MS = 50;

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) {
  console.error('TAOSTATS_API_KEY required');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toTao = (rao) => rao == null ? null : Number(BigInt(rao)) / 1e9;
const fmtTao = (n) => (n >= 0 ? '+' : '') + n.toFixed(6);
const pad = (s, n) => String(s).padEnd(n);
const padR = (s, n) => String(s).padStart(n);

async function taostatsHistory(coldkey) {
  const tEnd = Math.floor(Date.now() / 1000);
  const tStart = tEnd - WINDOW_DAYS * 86400 - 86400;
  const url = `${TAOSTATS_BASE}/api/account/history/v1?address=${coldkey}&timestamp_start=${tStart}&timestamp_end=${tEnd}&order=timestamp_asc&limit=100`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`taostats history http ${r.status}`);
  const json = await r.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  if (!rows.length) throw new Error('no taostats history rows');
  const targetTs = Date.now() / 1000 - WINDOW_DAYS * 86400;
  let best = rows[0];
  let bestDelta = Math.abs(Date.parse(best.timestamp) / 1000 - targetTs);
  for (const row of rows) {
    const d = Math.abs(Date.parse(row.timestamp) / 1000 - targetTs);
    if (d < bestDelta) { best = row; bestDelta = d; }
  }
  return {
    timestamp: best.timestamp,
    ts: Date.parse(best.timestamp) / 1000,
    balance_staked: toTao(best.balance_staked),
    balance_staked_rao: best.balance_staked,
    balance_total: toTao(best.balance_total),
    rowCount: rows.length,
  };
}

async function main() {
  const tStart = Date.now();
  console.error(`[${LABEL}] ${COLDKEY}`);
  console.error(`Step 1: Taostats /api/account/history/v1 — anchor`);
  const ts = await taostatsHistory(COLDKEY);
  console.error(`  firstSnapshot ${ts.timestamp} balance_staked=${ts.balance_staked}τ balance_total=${ts.balance_total}τ`);

  // iter 224 alignment: derive secondsAgo from Taostats EOD timestamp
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedSecondsAgo = nowSec - Math.floor(ts.ts);
  console.error(`  alignedSecondsAgo=${alignedSecondsAgo}s  (${(alignedSecondsAgo / 86400).toFixed(2)}d)`);

  // Resolve the target archive block from alignedSecondsAgo
  console.error(`Step 2: resolve archive head + target block`);
  const headBlock = await getArchiveFinalizedHead();
  const targetBlock = blockNumberForSecondsAgo(headBlock, alignedSecondsAgo);
  console.error(`  archive head=${headBlock}  target=${targetBlock}  Δ=${headBlock - targetBlock} blocks`);

  // ============================================================
  // (g) BLOCK-SENSITIVITY SWEEP
  // ============================================================
  console.error(`\nStep 3: (g) BLOCK-SENSITIVITY SWEEP — stakeTao at target ± [${SWEEP_DELTAS.join(', ')}] blocks`);
  const sweep = [];
  for (const delta of SWEEP_DELTAS) {
    const bn = targetBlock + delta;
    // re-derive secondsAgo equivalent for the API (it picks a block from secondsAgo).
    // Simpler: compute secondsAgo such that blockNumberForSecondsAgo(headBlock, sa) === bn.
    // bn = headBlock - sa/12.545  →  sa = (headBlock - bn) * 12.545
    const sa = Math.max(1, Math.round((headBlock - bn) * 12.545));
    const t0 = Date.now();
    const arch = await getHistoricalColdkeyBalance(COLDKEY, sa);
    const dt = Date.now() - t0;
    sweep.push({
      delta,
      blockNumber: arch.blockNumber,
      blockHash: arch.blockHash,
      stakeTao: arch.stakeTao,
      totalStakeAlpha: arch.totalStakeAlpha,
      freeTao: arch.freeTao,
      reservedTao: arch.reservedTao,
      totalTao: arch.totalTao,
      latencyMs: dt,
    });
    console.error(`  Δ=${padR(delta, 5)} block=${arch.blockNumber} stakeTao=${arch.stakeTao.toFixed(9)}τ Σα=${arch.totalStakeAlpha.toFixed(6)}α free=${arch.freeTao.toFixed(9)} (${dt}ms)`);
    await sleep(SLEEP_MS);
  }

  const sweepStakes = sweep.map(s => s.stakeTao);
  const sweepMin = Math.min(...sweepStakes);
  const sweepMax = Math.max(...sweepStakes);
  const sweepRange = sweepMax - sweepMin;
  const targetIdx = SWEEP_DELTAS.indexOf(0);
  const targetStake = sweep[targetIdx].stakeTao;
  const window5 = sweep.filter(s => Math.abs(s.delta) <= 5);
  const win5Min = Math.min(...window5.map(s => s.stakeTao));
  const win5Max = Math.max(...window5.map(s => s.stakeTao));
  const win5Range = win5Max - win5Min;

  console.error(`\n  (g) sensitivity stats:`);
  console.error(`    target stakeTao       : ${targetStake.toFixed(9)}τ`);
  console.error(`    Taostats balance_staked: ${ts.balance_staked.toFixed(9)}τ`);
  console.error(`    residual at target    : ${fmtTao(targetStake - ts.balance_staked)}τ`);
  console.error(`    ±5 block window range : ${win5Range.toFixed(9)}τ  (${(win5Range * 1000).toFixed(3)} mτ)`);
  console.error(`    ±100 block range      : ${sweepRange.toFixed(9)}τ  (${(sweepRange * 1000).toFixed(3)} mτ)`);
  const residualAbs = Math.abs(targetStake - ts.balance_staked);
  const gSufficient = win5Range >= residualAbs * 0.8;
  console.error(`    (g) verdict           : ${gSufficient ? 'SUFFICIENT — residual within natural block-time variability' : 'INSUFFICIENT — residual exceeds ±5 block window range'}`);

  // ============================================================
  // (h) EMISSION-INCLUSIVE DECODE at target blockHash
  // ============================================================
  const targetBlockHash = sweep[targetIdx].blockHash;
  console.error(`\nStep 4: (h) EMISSION-INCLUSIVE DECODE at target blockHash ${targetBlockHash.slice(0, 16)}…`);
  await sleep(SLEEP_MS);
  const stakeRaw = await getHistoricalColdkeyStakeAlpha(COLDKEY, targetBlockHash);
  await sleep(SLEEP_MS);
  const netuids = [...new Set(stakeRaw.entries.map(e => e.netuid))];
  const { prices } = await getHistoricalSubnetPrices(netuids, targetBlockHash);

  // Aggregate four totals via four α definitions
  const variants = {
    rawStake: (e) => e.stakeAlpha,
    stakePlusEmission: (e) => e.stakeAlpha + e.emissionAlpha,
    stakePlusAlphaEmission: (e) => e.stakeAlpha + e.alphaEmissionAlpha,
    stakePlusBoth: (e) => e.stakeAlpha + e.emissionAlpha + e.alphaEmissionAlpha,
  };
  const totals = {};
  for (const [name, fn] of Object.entries(variants)) {
    let sumTao = 0;
    let sumAlpha = 0;
    for (const e of stakeRaw.entries) {
      const a = fn(e);
      sumAlpha += a;
      sumTao += a * (prices[e.netuid] ?? 0);
    }
    totals[name] = { sumAlpha, sumTao, drift: sumTao - ts.balance_staked };
  }

  // Per-subnet pending-emission breakdown
  const perNuEmissionRows = [];
  const byNu = {};
  for (const e of stakeRaw.entries) {
    if (!byNu[e.netuid]) byNu[e.netuid] = {
      netuid: e.netuid,
      stakeAlpha: 0,
      emissionAlpha: 0,
      alphaEmissionAlpha: 0,
      hotkeyCount: 0,
      price: prices[e.netuid] ?? 0,
    };
    byNu[e.netuid].stakeAlpha += e.stakeAlpha;
    byNu[e.netuid].emissionAlpha += e.emissionAlpha;
    byNu[e.netuid].alphaEmissionAlpha += e.alphaEmissionAlpha;
    byNu[e.netuid].hotkeyCount += 1;
  }
  for (const nu of Object.values(byNu)) {
    perNuEmissionRows.push({
      netuid: nu.netuid,
      stakeAlpha: nu.stakeAlpha,
      emissionAlpha: nu.emissionAlpha,
      alphaEmissionAlpha: nu.alphaEmissionAlpha,
      price: nu.price,
      rawTao: nu.stakeAlpha * nu.price,
      emissionTao: nu.emissionAlpha * nu.price,
      alphaEmissionTao: nu.alphaEmissionAlpha * nu.price,
    });
  }
  perNuEmissionRows.sort((a, b) => b.emissionAlpha + b.alphaEmissionAlpha - (a.emissionAlpha + a.alphaEmissionAlpha));

  console.error(`\n  variant totals vs Taostats balance_staked=${ts.balance_staked.toFixed(9)}τ:`);
  for (const [name, t] of Object.entries(totals)) {
    console.error(`    ${pad(name, 28)} Σα=${t.sumAlpha.toFixed(6)}α  Στ=${t.sumTao.toFixed(9)}τ  drift=${fmtTao(t.drift)}τ`);
  }

  console.error(`\n  per-subnet pending-emission breakdown (top by emission+alphaEmission):`);
  console.error(`  ${pad('netuid', 8)} ${pad('stakeα', 14)} ${pad('emα', 14)} ${pad('αemα', 14)} ${pad('price', 12)} ${pad('rawτ', 14)} ${pad('emτ', 14)} ${pad('αemτ', 14)}`);
  for (const r of perNuEmissionRows.slice(0, 10)) {
    console.error(`  ${pad(`sn${r.netuid}`, 8)} ${pad(r.stakeAlpha.toFixed(6), 14)} ${pad(r.emissionAlpha.toFixed(6), 14)} ${pad(r.alphaEmissionAlpha.toFixed(6), 14)} ${pad(r.price.toFixed(8), 12)} ${pad(r.rawTao.toFixed(9), 14)} ${pad(r.emissionTao.toFixed(9), 14)} ${pad(r.alphaEmissionTao.toFixed(9), 14)}`);
  }

  // Best variant
  const variantDrifts = Object.entries(totals).map(([n, t]) => ({ name: n, absDrift: Math.abs(t.drift), drift: t.drift }));
  variantDrifts.sort((a, b) => a.absDrift - b.absDrift);
  const best = variantDrifts[0];
  const hConfirmed = best.name !== 'rawStake' && best.absDrift < 0.001;
  console.error(`\n  (h) verdict: best variant=${best.name} drift=${fmtTao(best.drift)}τ  ${hConfirmed ? 'CONFIRMED — emission inclusion closes residual to sub-mRAO' : 'NOT CONFIRMED — emission inclusion does not close residual'}`);

  // ============================================================
  // DECISION MATRIX
  // ============================================================
  console.error(`\nStep 5: DECISION`);
  let decision;
  if (hConfirmed) {
    decision = '(a) iter 227 amend composer to sum stake+emission+alpha_emission, then flag-flip default-on';
  } else if (gSufficient) {
    decision = '(b) iter 227 flag-flip with "bounded by block-time" framing in badge tooltip';
  } else {
    decision = '(c) iter 227 deeper forensics — neither (g) nor (h) explains residual';
  }
  console.error(`  decision: ${decision}`);

  const wallMs = Date.now() - tStart;
  console.error(`\n[probe done] wall=${wallMs}ms`);

  process.stdout.write(JSON.stringify({
    coldkey: COLDKEY,
    label: LABEL,
    headBlock,
    targetBlock,
    targetBlockHash,
    alignedSecondsAgo,
    taostatsAnchor: ts,
    sweep,
    sweepStats: { sweepRange, win5Range, targetStake, residualAtTarget: targetStake - ts.balance_staked, gSufficient },
    variantTotals: totals,
    perNuEmission: perNuEmissionRows,
    hVerdict: { bestVariant: best.name, bestDrift: best.drift, hConfirmed },
    decision,
    wallMs,
  }, null, 2) + '\n');
}

main().catch(e => {
  console.error('ERR:', e.stack || e.message);
  process.exit(2);
});
