// iter 229 stake-valuation parity per-wallet diagnostic — Jai subnets holdout
// (+5.975 mτ residual at TRUE anchor block #8286210 from iter 228 sweep).
//
// Iter 228 mechanical fix landed end-to-end; 4-wallet sweep yielded:
//   Jai mantat   −0.378 mτ MATCH
//   Jai subnets  +5.975 mτ DRIFT  ← this probe
//   Mum subnets  +4.415 mτ DRIFT  ← cross-check at end
//   Mum mantat   −1.257 mτ DRIFT
//
// ARCHIVE_STARTING_SHADOW stays default-off because Jai subnets is above the
// 5 mτ flag-flip gate. This probe localises that residual to either:
//   (1) CONCENTRATED outlier — 1-2 subnets driving most of the +5.975 mτ
//       → iter 230 ships a subnet-specific quantum fix + re-validates.
//   (2) DISTRIBUTED Float64 noise — 3-5 mτ smeared across many subnets
//       → iter 230 flips ARCHIVE_STARTING_SHADOW with a sub-10 mτ tolerance
//         framing in the badge tooltip.
//   (3) CATEGORY-SPECIFIC quirk — sn0 root vs alpha subnets, locked-stake,
//       validator commission accrual.
//
// Method: reuse the iter 225 archive byNetuid pattern, but anchor at
// Taostats /api/account/history/v1.block_number directly via opts.anchorBlock
// (iter 228 addition). Surface per-subnet stake breakdown, top contributors,
// and compare to Jai mantat's archive byNetuid at the SAME historical anchor
// to identify holding shape differences. Then re-run for Mum subnets as
// confirmation of the root-cause class.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-jai-subnets-iter-229.mjs

import { getHistoricalColdkeyBalance, getColdkeyStakeTao } from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', primary: true },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V', primary: false },
  { label: 'Jai mantat',   coldkey: '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn', primary: false, baseline: true },
];

const WINDOW_DAYS = 30;
const TAOSTATS_BASE = 'https://api.taostats.io';

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) {
  console.error('TAOSTATS_API_KEY required');
  process.exit(1);
}

const toTao = (rao) => rao == null ? null : Number(BigInt(rao)) / 1e9;

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
    balance_total: toTao(best.balance_total),
    balance_free: toTao(best.balance_free),
    balance_staked: toTao(best.balance_staked),
    blockNumber: best.block_number != null ? Number(best.block_number) : null,
    rowCount: rows.length,
  };
}

async function taostatsLatestPerSubnet(coldkey) {
  // /api/dtao/stake_balance/latest/v1 — current-block per-(hotkey,netuid) rows
  const url = `${TAOSTATS_BASE}/api/dtao/stake_balance/latest/v1?coldkey=${coldkey}&limit=200`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`taostats latest http ${r.status}`);
  const json = await r.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  const byNetuid = {};
  for (const row of rows) {
    const nu = Number(row.netuid);
    if (!byNetuid[nu]) byNetuid[nu] = { netuid: nu, balanceAlpha: 0n, balanceTaoRao: 0n };
    byNetuid[nu].balanceAlpha += BigInt(row.balance);
    byNetuid[nu].balanceTaoRao += BigInt(row.balance_as_tao);
  }
  return Object.values(byNetuid).map(r => ({
    netuid: r.netuid,
    stakeAlpha: Number(r.balanceAlpha) / 1e9,
    stakeTao: Number(r.balanceTaoRao) / 1e9,
    impliedPrice: r.balanceAlpha > 0n ? Number(r.balanceTaoRao) / Number(r.balanceAlpha) : null,
  })).sort((a, b) => a.netuid - b.netuid);
}

function fmtTao(n) { return (n >= 0 ? '+' : '') + n.toFixed(6); }
function pad(s, n) { return String(s).padEnd(n); }
function padR(s, n) { return String(s).padStart(n); }

async function probeOne(wallet) {
  console.error(`\n========== [${wallet.label}] ${wallet.coldkey} ==========`);

  const ts = await taostatsHistory(wallet.coldkey);
  console.error(`Step 1: Taostats /history → ${ts.timestamp} balance_staked=${ts.balance_staked}τ block_number=${ts.blockNumber}`);

  if (!Number.isFinite(ts.blockNumber) || ts.blockNumber <= 0) {
    console.error(`  WARN: missing block_number, skip`);
    return { wallet, error: 'missing-block-number' };
  }

  console.error(`Step 2: Archive @ anchorBlock=${ts.blockNumber}`);
  const arch = await getHistoricalColdkeyBalance(wallet.coldkey, 0, { anchorBlock: ts.blockNumber });
  console.error(`  archive stakeTao=${arch.stakeTao.toFixed(9)}τ totalTao=${arch.totalTao.toFixed(9)}τ`);

  const driftTau = arch.stakeTao - ts.balance_staked;
  console.error(`  drift archive−taostats = ${fmtTao(driftTau)}τ (${fmtTao(driftTau * 1000)} mτ)`);

  const byNetuid = (arch.byNetuid || []).slice();
  const sn0 = byNetuid.find(r => r.netuid === 0);
  const nonRoot = byNetuid.filter(r => r.netuid !== 0);
  nonRoot.sort((a, b) => Math.abs(b.stakeTao) - Math.abs(a.stakeTao));

  console.error('\nStep 3: per-subnet stake breakdown @ archive anchor (top by |stakeTao|)');
  console.error('  ' + pad('netuid', 8) + pad('stakeAlpha', 18) + pad('price τ/α', 14) + pad('stakeTao τ', 16) + 'hotkeys');
  console.error('  ' + '-'.repeat(70));
  if (sn0) {
    console.error('  ' + pad('sn0(root)', 8) + pad(sn0.stakeAlpha.toFixed(6), 18) + pad('1.0', 14) + pad(sn0.stakeTao.toFixed(9), 16) + (sn0.hotkeyCount ?? 'n'));
  }
  for (const r of nonRoot.slice(0, 12)) {
    console.error('  ' + pad(`sn${r.netuid}`, 8)
      + pad(r.stakeAlpha.toFixed(6), 18)
      + pad((r.price ?? 0).toFixed(8), 14)
      + pad(r.stakeTao.toFixed(9), 16)
      + (r.hotkeyCount ?? 'n'));
  }
  if (nonRoot.length > 12) console.error(`  ... ${nonRoot.length - 12} more non-root subnets`);

  // Per-subnet implied rounding RAO budget — if archive computes
  // Σ(alpha_i × price_i) Float64, max per-subnet round error ≈ 1 RAO ≈ 1 nτ.
  // Distributed drift across N subnets ≈ N×1 nτ < 1 μτ < 1 mτ.
  // 5.975 mτ residual ⟹ either concentrated outlier OR systematic per-subnet quantum.
  const perSubnetRoundingBudgetMicroTao = byNetuid.length * 0.001; // ~1 µτ at most per subnet
  console.error(`\n  Per-subnet count: ${byNetuid.length}`);
  console.error(`  Distributed Float64 rounding budget (N×1 µτ): ~${perSubnetRoundingBudgetMicroTao.toFixed(3)} µτ`);
  console.error(`  Observed |drift|: ${Math.abs(driftTau * 1000).toFixed(3)} mτ`);
  if (Math.abs(driftTau) * 1000 > perSubnetRoundingBudgetMicroTao * 1000) {
    console.error(`  ⟹ |drift| >> rounding budget — concentrated or category quirk, NOT Float64 noise.`);
  }

  // Current-block cross-check: archive byNetuid vs Taostats latest per-subnet.
  // Same comparison iter 225 ran on Jai mantat (found all 17 RAO-exact).
  console.error('\nStep 4: current-block per-subnet cross-check (archive vs Taostats latest)');
  const [currentArch, currentTs] = await Promise.all([
    getColdkeyStakeTao(wallet.coldkey),
    taostatsLatestPerSubnet(wallet.coldkey),
  ]);
  const tsByNu = new Map(currentTs.map(r => [r.netuid, r]));
  const archByNu = new Map((currentArch.byNetuid || []).map(r => [r.netuid, r]));
  const allNus = [...new Set([...tsByNu.keys(), ...archByNu.keys()])].sort((a, b) => a - b);
  let archCurTotal = 0, tsCurTotal = 0;
  const perNuCmp = [];
  for (const nu of allNus) {
    const a = archByNu.get(nu);
    const t = tsByNu.get(nu);
    const aTao = a?.stakeTao || 0;
    const tTao = t?.stakeTao || 0;
    archCurTotal += aTao;
    tsCurTotal += tTao;
    perNuCmp.push({
      netuid: nu,
      archStakeAlpha: a?.stakeAlpha || 0,
      tsStakeAlpha: t?.stakeAlpha || 0,
      alphaDrift: (a?.stakeAlpha || 0) - (t?.stakeAlpha || 0),
      archPrice: a?.price ?? null,
      tsImpliedPrice: t?.impliedPrice ?? null,
      archStakeTao: aTao,
      tsStakeTao: tTao,
      taoDrift: aTao - tTao,
    });
  }
  console.error(`  current arch totalTau : ${archCurTotal.toFixed(9)}τ`);
  console.error(`  current ts   totalTau : ${tsCurTotal.toFixed(9)}τ`);
  console.error(`  current drift         : ${fmtTao(archCurTotal - tsCurTotal)}τ`);
  perNuCmp.sort((a, b) => Math.abs(b.taoDrift) - Math.abs(a.taoDrift));
  console.error('\n  Top |τdrift| (current cross-check, indicates per-subnet decoder integrity):');
  console.error('  ' + pad('netuid', 8) + pad('archα', 14) + pad('tsα', 14) + pad('archτ', 14) + pad('tsτ', 14) + 'τdrift');
  for (const r of perNuCmp.slice(0, 8)) {
    console.error('  ' + pad(`sn${r.netuid}`, 8)
      + pad(r.archStakeAlpha.toFixed(6), 14)
      + pad(r.tsStakeAlpha.toFixed(6), 14)
      + pad(r.archStakeTao.toFixed(6), 14)
      + pad(r.tsStakeTao.toFixed(6), 14)
      + fmtTao(r.taoDrift));
  }

  // Classification — based on top-3 share of |τdrift| at HISTORICAL anchor.
  // The archive byNetuid at anchor lets us compute per-subnet contribution to
  // the historical residual. We can't compare to Taostats per-subnet historical
  // (no such free endpoint), but we CAN compute per-subnet share of total stake
  // and the residual quantum vs per-subnet rounding budget.
  const archStakeTotalAbs = byNetuid.reduce((s, r) => s + Math.abs(r.stakeTao), 0);
  const top3StakeShare = nonRoot.slice(0, 3).reduce((s, r) => s + Math.abs(r.stakeTao), 0) / archStakeTotalAbs;

  return {
    wallet,
    taostatsHistory: ts,
    archive: {
      blockNumber: arch.blockNumber,
      anchorSource: arch.anchorSource,
      blockHash: arch.blockHash,
      stakeTao: arch.stakeTao,
      totalTao: arch.totalTao,
      byNetuid,
      sn0StakeTao: sn0?.stakeTao ?? 0,
      nonRootCount: nonRoot.length,
      top3StakeShare,
    },
    drift: { signedTao: driftTau, absMTau: Math.abs(driftTau * 1000) },
    currentCrossCheck: {
      archTotal: archCurTotal,
      tsTotal: tsCurTotal,
      drift: archCurTotal - tsCurTotal,
      perSubnet: perNuCmp.slice(0, 10),
    },
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

  console.log('\n\n=== ITER 229 PER-WALLET DIAGNOSTIC SUMMARY ===');
  console.log('label        | anchorBlock | archive Σstakeτ | taostats stakedτ | drift mτ  | subnets | top3-stake%');
  console.log('-'.repeat(110));
  for (const r of results) {
    if (r.error) { console.log(`${r.wallet.label.padEnd(12)} | ERROR ${r.error}`); continue; }
    console.log(`${r.wallet.label.padEnd(12)} | ${String(r.archive.blockNumber).padStart(11)} | ${r.archive.stakeTao.toFixed(9).padStart(16)} | ${r.taostatsHistory.balance_staked.toFixed(9).padStart(17)} | ${fmtTao(r.drift.signedTao * 1000).padStart(9)} | ${String(r.archive.nonRootCount).padStart(7)} | ${(r.archive.top3StakeShare * 100).toFixed(1).padStart(10)}%`);
  }

  // Decision heuristic
  const primary = results.find(r => r.wallet.primary && !r.error);
  const baseline = results.find(r => r.wallet.baseline && !r.error);
  const confirm = results.find(r => !r.wallet.primary && !r.wallet.baseline && !r.error);

  console.log('\n=== DECISION ===');
  if (!primary) {
    console.log('BLOCKED — primary wallet probe failed');
  } else {
    const absMTau = primary.drift.absMTau;
    const subnetCount = primary.archive.nonRootCount;
    const top3Share = primary.archive.top3StakeShare;
    const distributedRoundingBudgetMTau = subnetCount * 0.001; // 1 µτ per subnet
    const concentratedIfTop3Above = 0.7;

    console.log(`Primary: ${primary.wallet.label} |drift|=${absMTau.toFixed(3)} mτ, subnets=${subnetCount}, top3-stake-share=${(top3Share * 100).toFixed(1)}%`);
    if (confirm) console.log(`Confirm: ${confirm.wallet.label} |drift|=${confirm.drift.absMTau.toFixed(3)} mτ, subnets=${confirm.archive.nonRootCount}, top3-stake-share=${(confirm.archive.top3StakeShare * 100).toFixed(1)}%`);
    if (baseline) console.log(`Baseline: ${baseline.wallet.label} |drift|=${baseline.drift.absMTau.toFixed(3)} mτ — at noise floor, no fix needed`);

    console.log(`\nRounding budget @ ${subnetCount} subnets: ${(distributedRoundingBudgetMTau * 1000).toFixed(3)} µτ. Observed: ${absMTau.toFixed(3)} mτ.`);
    if (top3Share >= concentratedIfTop3Above) {
      console.log(`⟹ Hypothesis (a): CONCENTRATED stake (top3 ≥ ${(concentratedIfTop3Above * 100).toFixed(0)}%). Residual likely 1-2 outlier subnets — iter 230 ship subnet-specific quantum fix.`);
    } else if (absMTau < 10 && subnetCount >= 10) {
      console.log(`⟹ Hypothesis (b): DISTRIBUTED noise (broad stake spread + sub-10 mτ residual). iter 230 flag-flip with ±10 mτ tolerance framing.`);
    } else {
      console.log(`⟹ Hypothesis (c): CATEGORY-SPECIFIC quirk — needs sn0/root vs locked-stake/validator-commission inspection.`);
    }

    // Confirmation: if Mum subnets shows similar shape AND similar residual, same root cause.
    if (confirm) {
      const similarTop3 = Math.abs(confirm.archive.top3StakeShare - top3Share) < 0.15;
      const similarSubnetCount = Math.abs(confirm.archive.nonRootCount - subnetCount) < 5;
      console.log(`Confirmation: ${confirm.wallet.label} ${similarTop3 ? 'matches' : 'differs from'} primary top3-share, ${similarSubnetCount ? 'matches' : 'differs from'} primary subnet count.`);
    }
  }

  console.log(`\nwall: ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  console.log('\n=== JSON ===');
  console.log(JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2));
}

main().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(2); });
