// iter 230 stake-valuation parity sub-block AMM drift probe — Jai subnets
// holdout (+5.975 mτ at TRUE anchor block #8286210 from iter 228/229).
//
// Tests hypothesis (c2) — per-subnet AMM sub-block drift with asymmetric
// cancellation. Iter 229 found archive UNDER taostats with consistent sign
// across both DRIFT wallets (6-subnet Jai subnets, 4-subnet Mum subnets) at
// 4σ above random per-subnet noise prediction. (c1) sn0, (a) concentrated
// outlier, (b) Float64 noise all REJECTED. (c2) PARTIAL — magnitude needs
// either per-subnet bias or commission accrual.
//
// Method: anchor at Taostats /api/account/history/v1.block_number =
// #8286210 (TRUE anchor for 2026-05-28 EOD on Jai subnets), then fire
// getHistoricalColdkeyBalance with opts.anchorBlock at Δ ∈
// {-10,-5,-2,-1,0,+1,+2,+5,+10}. Compute per-block archive_total_τ −
// taostats_target_τ residual. Compute per-subnet stakeτ swing across the
// 21-block window (max − min).
//
// Decision:
//   (a) RESIDUAL SWINGS ≥1 mτ ACROSS WINDOW (c2 CONFIRMED): iter 231 ship
//       flag-flip ARCHIVE_STARTING_SHADOW default-on + badge tooltip
//       "anchor: taostats-block-number-exact, ±10 mτ AMM sub-block
//       tolerance on multi-subnet wallets" → Priority #1 graduation.
//   (b) RESIDUAL CONSTANT WITHIN ±0.1 mτ (c2 BUSTED): iter 231 queue
//       commission probe via Taostats /api/validator/latest/v1.
//   (c) MIXED (some subnets swing, total residual barely changes): per-
//       subnet attribution — single AMM-drifty subnet identified → iter
//       231 subnet-specific mechanical patch.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-subblock-amm-drift-iter-230.mjs

import { getHistoricalColdkeyBalance } from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', primary: true },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V', primary: false },
];

const DELTAS = [-10, -5, -2, -1, 0, +1, +2, +5, +10];
const WINDOW_DAYS = 30;
const TAOSTATS_BASE = 'https://api.taostats.io';
const INTER_BLOCK_DELAY_MS = 250;

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) {
  console.error('TAOSTATS_API_KEY required');
  process.exit(1);
}

const toTao = (rao) => rao == null ? null : Number(BigInt(rao)) / 1e9;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    balance_total: toTao(best.balance_total),
    blockNumber: best.block_number != null ? Number(best.block_number) : null,
  };
}

function fmtTao(n) { return (n >= 0 ? '+' : '') + n.toFixed(6); }
function pad(s, n) { return String(s).padEnd(n); }
function padR(s, n) { return String(s).padStart(n); }

async function probeOne(wallet) {
  console.error(`\n========== [${wallet.label}] ${wallet.coldkey} ==========`);

  const ts = await taostatsHistory(wallet.coldkey);
  console.error(`Step 1: Taostats /history → ${ts.timestamp} balance_staked=${ts.balance_staked}τ block_number=${ts.blockNumber}`);
  if (!Number.isFinite(ts.blockNumber) || ts.blockNumber <= 0) {
    return { wallet, error: 'missing-block-number' };
  }
  const anchorBlock = ts.blockNumber;
  const targetStakedTao = ts.balance_staked;

  console.error(`\nStep 2: 21-block window sweep around anchor=${anchorBlock} (Δ ∈ ${DELTAS.join(', ')})`);
  const perBlock = [];
  for (const dB of DELTAS) {
    const bn = anchorBlock + dB;
    try {
      const arch = await getHistoricalColdkeyBalance(wallet.coldkey, 0, { anchorBlock: bn });
      const residualTau = arch.stakeTao - targetStakedTao;
      const byNu = {};
      for (const r of arch.byNetuid || []) byNu[r.netuid] = r.stakeTao;
      perBlock.push({ dB, blockNumber: bn, stakeTao: arch.stakeTao, residualTau, byNu });
      console.error(`  Δ${dB >= 0 ? '+' : ''}${dB} block=${bn} stakeτ=${arch.stakeTao.toFixed(9)} residual=${fmtTao(residualTau)}τ (${fmtTao(residualTau * 1000)} mτ)`);
    } catch (e) {
      console.error(`  Δ${dB} block=${bn} ERR ${e.message}`);
      perBlock.push({ dB, blockNumber: bn, error: e.message });
    }
    await sleep(INTER_BLOCK_DELAY_MS);
  }

  // Total residual swing across window
  const ok = perBlock.filter(p => Number.isFinite(p.residualTau));
  if (ok.length < 2) {
    console.error(`\n  Only ${ok.length} blocks succeeded — cannot assess swing.`);
    return { wallet, taostatsHistory: ts, perBlock, error: 'insufficient-window' };
  }
  const residuals = ok.map(p => p.residualTau);
  const rMin = Math.min(...residuals);
  const rMax = Math.max(...residuals);
  const totalSwingTau = rMax - rMin;
  console.error(`\nStep 3: residual swing across window`);
  console.error(`  min residual: ${fmtTao(rMin * 1000)} mτ`);
  console.error(`  max residual: ${fmtTao(rMax * 1000)} mτ`);
  console.error(`  TOTAL SWING : ${(totalSwingTau * 1000).toFixed(4)} mτ`);

  // Per-subnet swing — for each netuid, max−min stakeTao across the window
  const allNus = new Set();
  for (const p of ok) for (const k of Object.keys(p.byNu)) allNus.add(Number(k));
  const perSubnetSwing = [];
  for (const nu of [...allNus].sort((a, b) => a - b)) {
    const vals = ok.map(p => p.byNu[nu] ?? 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const swingTau = max - min;
    perSubnetSwing.push({ netuid: nu, min, max, swingTau, swingMTau: swingTau * 1000 });
  }
  perSubnetSwing.sort((a, b) => b.swingMTau - a.swingMTau);

  console.error(`\nStep 4: per-subnet stakeτ swing (top 8 by |swing|)`);
  console.error('  ' + pad('netuid', 8) + pad('min τ', 16) + pad('max τ', 16) + pad('swing τ', 16) + 'swing mτ');
  console.error('  ' + '-'.repeat(70));
  for (const s of perSubnetSwing.slice(0, 8)) {
    console.error('  ' + pad(`sn${s.netuid}`, 8)
      + pad(s.min.toFixed(9), 16)
      + pad(s.max.toFixed(9), 16)
      + pad(s.swingTau.toFixed(9), 16)
      + s.swingMTau.toFixed(4));
  }

  // Classification
  const swingMTau = totalSwingTau * 1000;
  let verdict;
  if (swingMTau >= 1.0) {
    verdict = 'c2-CONFIRMED';
    console.error(`\n  ⟹ total swing ${swingMTau.toFixed(4)} mτ ≥ 1.0 mτ — (c2) AMM sub-block drift CONFIRMED`);
  } else if (swingMTau <= 0.1) {
    verdict = 'c2-BUSTED';
    console.error(`\n  ⟹ total swing ${swingMTau.toFixed(4)} mτ ≤ 0.1 mτ — (c2) AMM sub-block drift BUSTED`);
  } else {
    verdict = 'c2-MIXED';
    const dominantSubnet = perSubnetSwing[0];
    console.error(`\n  ⟹ total swing ${swingMTau.toFixed(4)} mτ ambiguous — (c2) MIXED; top-swing subnet sn${dominantSubnet.netuid} ${dominantSubnet.swingMTau.toFixed(4)} mτ`);
  }

  return {
    wallet,
    taostatsHistory: ts,
    anchorBlock,
    targetStakedTao,
    perBlock,
    totalSwingTau,
    swingMTau,
    rMin,
    rMax,
    perSubnetSwing,
    verdict,
  };
}

async function main() {
  const t0 = Date.now();
  const results = [];
  for (const w of WALLETS) {
    try {
      results.push(await probeOne(w));
    } catch (e) {
      console.error(`ERR [${w.label}]: ${e.stack || e.message}`);
      results.push({ wallet: w, error: e.message });
    }
  }

  console.error(`\n========== SUMMARY (${((Date.now() - t0) / 1000).toFixed(1)}s) ==========`);
  console.error(pad('wallet', 14) + pad('anchor', 12) + pad('target τ', 14) + pad('min mτ', 12) + pad('max mτ', 12) + pad('swing mτ', 12) + 'verdict');
  console.error('-'.repeat(94));
  for (const r of results) {
    if (r.error || !Number.isFinite(r.swingMTau)) {
      console.error(pad(r.wallet.label, 14) + 'ERR ' + (r.error || 'no swing'));
      continue;
    }
    console.error(pad(r.wallet.label, 14)
      + pad(String(r.anchorBlock), 12)
      + pad(r.targetStakedTao.toFixed(6), 14)
      + pad((r.rMin * 1000).toFixed(3), 12)
      + pad((r.rMax * 1000).toFixed(3), 12)
      + pad(r.swingMTau.toFixed(4), 12)
      + r.verdict);
  }

  console.log(JSON.stringify({
    iter: 230,
    timestamp: new Date().toISOString(),
    deltas: DELTAS,
    results: results.map(r => ({
      label: r.wallet.label,
      coldkey: r.wallet.coldkey,
      error: r.error,
      anchorBlock: r.anchorBlock,
      targetStakedTao: r.targetStakedTao,
      perBlock: r.perBlock?.map(p => ({
        dB: p.dB,
        blockNumber: p.blockNumber,
        stakeTao: p.stakeTao,
        residualTau: p.residualTau,
        error: p.error,
      })),
      totalSwingTau: r.totalSwingTau,
      swingMTau: r.swingMTau,
      rMinMTau: Number.isFinite(r.rMin) ? r.rMin * 1000 : null,
      rMaxMTau: Number.isFinite(r.rMax) ? r.rMax * 1000 : null,
      topSubnetSwing: r.perSubnetSwing?.slice(0, 8),
      verdict: r.verdict,
    })),
  }, null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
