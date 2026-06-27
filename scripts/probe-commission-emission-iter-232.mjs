// iter 232 stake-valuation parity commission-on-EMISSION probe — tests
// (c3-emission) as explanation for the residuals at TRUE anchor block
// #8286210 after iter 231 BUSTED the stake-base commission model.
//
// iter 231 outcome: stake-base commission overshoots by 3 OOM on all 3
// wallets (Jai subnets 69×, Mum subnets 39×, Jai mantat 2958×). The
// MATCH-baseline overshoot was the killer — if commission on the full
// stake base drove residual, mantat would diverge ~1τ not 0.378 mτ.
// Right model: per-block per-validator EMISSION (~3 OOM smaller than
// stake-base, lands in mτ regime).
//
// (c3-emission) intuition: Taostats balance_staked at the EOD snapshot
// may include the per-(hotkey, netuid) pending alpha emission credited
// to the delegator since the last on-chain distribution (post-validator
// take). Archive StakeInfoRuntimeApi sees only the settled stake. The
// difference for a multi-validator wallet over a ~24h window is in the
// mτ regime — exactly what we observe.
//
// THE KEY ARCHITECTURAL WIN of this probe vs iter 231: the StakeInfo
// SCALE struct already carries `emissionAlpha` (pending emission alpha)
// AND `alphaEmissionAlpha` (separate alpha-emission field) per
// (hotkey, netuid). We can test multiple emission-inclusion models
// purely from the same archive call — no external API calls, no
// integration-window guessing.
//
// Models tested (all against Taostats /api/account/history/v1.balance_staked):
//   M0: Σ stakeAlpha × price                                 — current model (known residuals)
//   M1: Σ (stakeAlpha + emissionAlpha) × price               — includes pending emission
//   M2: Σ (stakeAlpha + alphaEmissionAlpha) × price          — includes alpha-emission alone
//   M3: Σ (stakeAlpha + emissionAlpha + alphaEmissionAlpha) × price — both
//
// Match criterion: model where the residual on Jai mantat MATCH baseline
// (currently +0.378 mτ) drops to noise floor (<0.1 mτ) AND DRIFT wallet
// residuals (currently −5.975 / −4.415 mτ) also drop to noise floor.
//
// Decision branches:
//   (a) M1/M2/M3 residual <1 mτ on ALL 3 wallets → (c3-emission) CONFIRMED →
//       iter 233 mechanical fix in lib/report.js shadow path: include
//       emissionAlpha (and/or alphaEmissionAlpha) in archive stakeτ →
//       re-sweep → flag-flip → Priority #1 graduation.
//   (b) Best model still overshoots/undershoots on at least one wallet
//       beyond ±2 mτ → (c3-emission) PARTIAL → iter 233 either
//       post-take-only refinement or queue (c4) storage-version probe.
//   (c) All models leave residuals essentially unchanged (emission fields
//       are zero across the board at this block) → (c3-emission) BUSTED →
//       iter 233 (c4) storage-version drift OR bounded-noise flag-flip.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-commission-emission-iter-232.mjs

import {
  getArchiveBlockHash,
  getHistoricalColdkeyStakeAlpha,
  getHistoricalSubnetPrices,
} from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', expectedResidualMTau: -5.975 },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V', expectedResidualMTau: -4.415 },
  { label: 'Jai mantat',   coldkey: '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn', expectedResidualMTau: +0.378, baseline: true },
];

const WINDOW_DAYS = 30;
const TAOSTATS_BASE = 'https://api.taostats.io';

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
    balance_staked: toTao(best.balance_staked),
    blockNumber: best.block_number != null ? Number(best.block_number) : null,
  };
}

function fmtMTau(n) { return (n >= 0 ? '+' : '') + n.toFixed(3); }
function pad(s, n) { return String(s).padEnd(n); }

async function probeOne(wallet, sharedAnchor) {
  console.error(`\n========== [${wallet.label}] ${wallet.coldkey} ==========`);

  let anchorBlock = sharedAnchor?.blockNumber;
  let targetStakedTao = wallet.targetStakedTao;
  if (anchorBlock == null) {
    const ts = await taostatsHistory(wallet.coldkey);
    anchorBlock = ts.blockNumber;
    targetStakedTao = ts.balance_staked;
    console.error(`Step 1: Taostats /history → block_number=${anchorBlock} balance_staked=${targetStakedTao}τ`);
  } else {
    console.error(`Step 1: shared anchor block=${anchorBlock} target=${targetStakedTao}τ`);
  }

  const blockHash = await getArchiveBlockHash(anchorBlock);

  const stake = await getHistoricalColdkeyStakeAlpha(wallet.coldkey, blockHash);
  const netuids = [...new Set(stake.entries.map(e => e.netuid))];
  const { prices } = await getHistoricalSubnetPrices(netuids, blockHash);

  // Build 4 models per-entry.
  let m0 = 0, m1 = 0, m2 = 0, m3 = 0;
  let sumEmissionTau = 0, sumAlphaEmissionTau = 0;
  const enriched = stake.entries.map(e => {
    const price = prices[e.netuid] ?? 0;
    const stakeTao = e.stakeAlpha * price;
    const emissionTao = e.emissionAlpha * price;
    const alphaEmissionTao = e.alphaEmissionAlpha * price;
    m0 += stakeTao;
    m1 += stakeTao + emissionTao;
    m2 += stakeTao + alphaEmissionTao;
    m3 += stakeTao + emissionTao + alphaEmissionTao;
    sumEmissionTau += emissionTao;
    sumAlphaEmissionTau += alphaEmissionTao;
    return { ...e, price, stakeTao, emissionTao, alphaEmissionTao };
  });

  // Surface entries with any non-zero pending emission.
  const withPending = enriched.filter(e => e.emissionTao > 0 || e.alphaEmissionTao > 0);
  console.error(`Step 2: ${enriched.length} entries decoded; ${withPending.length} carry non-zero pending emission`);
  if (withPending.length > 0) {
    console.error('  ' + pad('hotkey', 16) + pad('sn', 6) + pad('stakeα', 13) + pad('emα', 13) + pad('αemα', 13) + pad('emτ(mτ)', 12) + 'αemτ(mτ)');
    console.error('  ' + '-'.repeat(96));
    const sortedPending = withPending.sort((a, b) => (b.emissionTao + b.alphaEmissionTao) - (a.emissionTao + a.alphaEmissionTao));
    for (const e of sortedPending.slice(0, 15)) {
      const hkShort = e.hotkey.slice(0, 8) + '…' + e.hotkey.slice(-4);
      console.error('  '
        + pad(hkShort, 16)
        + pad(`sn${e.netuid}`, 6)
        + pad(e.stakeAlpha.toFixed(6), 13)
        + pad(e.emissionAlpha.toFixed(9), 13)
        + pad(e.alphaEmissionAlpha.toFixed(9), 13)
        + pad((e.emissionTao * 1000).toFixed(4), 12)
        + (e.alphaEmissionTao * 1000).toFixed(4));
    }
  }

  // Residuals per model.
  const residuals = {
    M0_stake_only: (m0 - targetStakedTao) * 1000,
    M1_stake_plus_emission: (m1 - targetStakedTao) * 1000,
    M2_stake_plus_alpha_emission: (m2 - targetStakedTao) * 1000,
    M3_stake_plus_both: (m3 - targetStakedTao) * 1000,
  };
  console.error(`\nStep 3: per-model residual (mτ vs taostats target ${targetStakedTao}τ)`);
  for (const [k, v] of Object.entries(residuals)) {
    console.error(`  ${pad(k, 28)} = ${fmtMTau(v)} mτ`);
  }
  console.error(`  raw pending emission sum   = ${(sumEmissionTau * 1000).toFixed(4)} mτ`);
  console.error(`  raw alpha-emission sum     = ${(sumAlphaEmissionTau * 1000).toFixed(4)} mτ`);

  return {
    wallet,
    anchorBlock,
    blockHash,
    targetStakedTao,
    m0, m1, m2, m3,
    sumEmissionTau,
    sumAlphaEmissionTau,
    residuals,
    pendingEntryCount: withPending.length,
    totalEntryCount: enriched.length,
  };
}

async function main() {
  const t0 = Date.now();

  // Lock shared anchor block from Jai subnets (same convention as iter 231).
  const jaiSubnetsTs = await taostatsHistory(WALLETS[0].coldkey);
  if (!Number.isFinite(jaiSubnetsTs.blockNumber)) {
    console.error('FATAL: Jai subnets has no Taostats block_number — cannot proceed');
    process.exit(2);
  }
  console.error(`\nShared anchor: block #${jaiSubnetsTs.blockNumber} (Jai subnets target ${jaiSubnetsTs.balance_staked}τ @ ${jaiSubnetsTs.timestamp})`);

  const results = [];
  for (let i = 0; i < WALLETS.length; i++) {
    const w = WALLETS[i];
    try {
      let target;
      if (i === 0) {
        target = jaiSubnetsTs.balance_staked;
      } else {
        const ts = await taostatsHistory(w.coldkey);
        target = ts.balance_staked;
      }
      w.targetStakedTao = target;
      results.push(await probeOne(w, { blockNumber: jaiSubnetsTs.blockNumber, targetStakedTao: target }));
      await sleep(150);
    } catch (e) {
      console.error(`ERR [${w.label}]: ${e.stack || e.message}`);
      results.push({ wallet: w, error: e.message });
    }
  }

  console.error(`\n========== SUMMARY (${((Date.now() - t0) / 1000).toFixed(1)}s) ==========`);
  console.error(pad('wallet', 14)
    + pad('M0 (stake)', 14)
    + pad('M1 (+em)', 14)
    + pad('M2 (+αem)', 14)
    + pad('M3 (+both)', 14)
    + 'best');
  console.error('-'.repeat(82));

  for (const r of results) {
    if (r.error) { console.error(pad(r.wallet.label, 14) + 'ERR ' + r.error); continue; }
    const models = ['M0_stake_only', 'M1_stake_plus_emission', 'M2_stake_plus_alpha_emission', 'M3_stake_plus_both'];
    let best = models[0], bestAbs = Math.abs(r.residuals[models[0]]);
    for (const m of models) {
      if (Math.abs(r.residuals[m]) < bestAbs) { best = m; bestAbs = Math.abs(r.residuals[m]); }
    }
    console.error(pad(r.wallet.label, 14)
      + pad(fmtMTau(r.residuals.M0_stake_only), 14)
      + pad(fmtMTau(r.residuals.M1_stake_plus_emission), 14)
      + pad(fmtMTau(r.residuals.M2_stake_plus_alpha_emission), 14)
      + pad(fmtMTau(r.residuals.M3_stake_plus_both), 14)
      + `${best} (|res|=${bestAbs.toFixed(3)} mτ)`);
  }

  // Global verdict.
  console.error(`\n========== VERDICT ==========`);
  const okResults = results.filter(r => !r.error);
  const models = ['M0_stake_only', 'M1_stake_plus_emission', 'M2_stake_plus_alpha_emission', 'M3_stake_plus_both'];
  for (const m of models) {
    const allUnder1 = okResults.every(r => Math.abs(r.residuals[m]) < 1.0);
    const allUnder10 = okResults.every(r => Math.abs(r.residuals[m]) < 10.0);
    const maxAbs = Math.max(...okResults.map(r => Math.abs(r.residuals[m])));
    console.error(`  ${pad(m, 28)} maxAbsResidual=${maxAbs.toFixed(3)} mτ  ${allUnder1 ? '✓ <1mτ ALL — CONFIRMED' : allUnder10 ? '~ <10mτ ALL — PARTIAL' : '✗ at least one >10mτ'}`);
  }

  // Pending-emission sanity check across the 3 wallets.
  const totalPendingMTau = okResults.reduce((s, r) => s + r.sumEmissionTau * 1000 + r.sumAlphaEmissionTau * 1000, 0);
  console.error(`\n  Total pending-emission across 3 wallets: ${totalPendingMTau.toFixed(4)} mτ`);
  if (totalPendingMTau < 0.001) {
    console.error('  ⚠ Pending emission is essentially zero at #8286210 — (c3-emission) BUSTED on this snapshot.');
    console.error('    Either: distribution had just occurred at the EOD snap, or emission lives in a different field.');
  }

  console.log(JSON.stringify({
    iter: 232,
    anchorBlock: jaiSubnetsTs.blockNumber,
    results: results.map(r => r.error ? r : {
      wallet: r.wallet.label,
      coldkey: r.wallet.coldkey,
      targetStakedTao: r.targetStakedTao,
      residuals: r.residuals,
      pendingEntryCount: r.pendingEntryCount,
      totalEntryCount: r.totalEntryCount,
      sumPendingEmissionMTau: r.sumEmissionTau * 1000,
      sumPendingAlphaEmissionMTau: r.sumAlphaEmissionTau * 1000,
    }),
  }, null, 2));
}

main().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
