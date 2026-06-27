// iter 225 stake-valuation parity research — per-subnet attribution probe.
//
// Iter 223 surfaced residual stake-leg drift (5-48 mRAO mixed signs) on all 4 monitored
// coldkeys AFTER iter 224 alignment-window fix collapsed the +7.33h offset. The residual
// is alpha-share → tao valuation parity between archive composer (per-subnet Σ alpha×price)
// and Taostats /api/account/history/v1 daily snapshot balance_staked.
//
// This probe localizes the drift source on ONE wallet (Jai mantat — smallest absolute
// drift +19 mRAO in iter 223 sweep). Hypotheses tested:
//   (a) per-subnet AMM pool block drift (archive vs Taostats sampling block)
//   (b) rounding asymmetry — Σ(alpha_i × price_i) computed Float64 vs Taostats internal
//   (c) sn0 (root) convention — included 1:1 by archive, excluded/handled-differently by Taostats
//   (d) staked-but-pending-unbond positions counted on one side only
//   (e) "stake" vs "alpha holdings" semantic split — archive uses StakeInfoRuntimeApi
//       (raw alpha-share atoms), Taostats may apply pending emission differently
//   (f) integer-division ordering — per-subnet round-then-sum vs sum-then-round
//
// Method:
//   1. Fetch Taostats /api/account/history/v1 → firstSnapshotDate EOD + balance_staked
//   2. Derive alignedSecondsAgo from firstSnapshotDate EOD (iter 224 alignment fix)
//   3. Fire archive getHistoricalColdkeyBalance(coldkey, alignedSecondsAgo) → byNetuid table
//   4. Surface per-subnet attribution:
//        - sn0 contribution (root, 1:1) isolated
//        - top-5 non-root subnets by absolute stakeTao
//        - per-subnet (stakeAlpha, price, stakeTao, rounding-RAO)
//        - cumulative sums: stakeTao_total, stakeTao_excl_sn0
//   5. Compare to Taostats balance_staked. Report:
//        - drift if sn0 included (current archive convention)
//        - drift if sn0 excluded (hypothesis c)
//        - per-subnet stakeTao differential needed to close residual (hypothesis a/b/d/e)
//   6. Cross-check archive per-subnet at CURRENT block vs Taostats
//        /api/dtao/stake_balance/latest/v1 — validates the per-subnet decode shape and
//        price formula independent of historical sampling questions.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-stake-attribution.mjs

import { getHistoricalColdkeyBalance, getColdkeyStakeTao } from '../lib/freeRpc.js';

const COLDKEY = '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn'; // Jai mantat
const LABEL = 'Jai mantat';
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
    balance_total_rao: best.balance_total,
    balance_staked_rao: best.balance_staked,
    rowCount: rows.length,
  };
}

async function taostatsLatestPerSubnet(coldkey) {
  // /api/dtao/stake_balance/latest/v1 exposes per-(hotkey,netuid) rows with balance (alpha-RAO)
  // and balance_as_tao (tao-RAO at current AMM price). Paginated, 50/page max.
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
    impliedPrice: r.balanceAlpha > 0n
      ? Number(r.balanceTaoRao) / Number(r.balanceAlpha)
      : null,
  })).sort((a, b) => a.netuid - b.netuid);
}

function fmtTao(n) { return (n >= 0 ? '+' : '') + n.toFixed(6); }
function pad(s, n) { return String(s).padEnd(n); }
function padR(s, n) { return String(s).padStart(n); }

async function main() {
  const tStart = Date.now();
  console.error(`[${LABEL}] ${COLDKEY}`);
  console.error('Step 1: Taostats /api/account/history/v1 (aligned-to-EOD anchor)');
  const ts = await taostatsHistory(COLDKEY);
  console.error(`  firstSnapshot ${ts.timestamp} balance_staked=${ts.balance_staked}τ balance_total=${ts.balance_total}τ`);

  // iter 224 alignment: derive alignedSecondsAgo from Taostats EOD timestamp
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedSecondsAgo = nowSec - Math.floor(ts.ts);
  console.error(`Step 2: Archive composer at aligned secondsAgo=${alignedSecondsAgo}s (${(alignedSecondsAgo / 86400).toFixed(2)}d)`);
  const arch = await getHistoricalColdkeyBalance(COLDKEY, alignedSecondsAgo);
  console.error(`  block #${arch.blockNumber} hash ${arch.blockHash.slice(0, 16)}…`);
  console.error(`  stakeTao=${arch.stakeTao.toFixed(9)}τ totalTao=${arch.totalTao.toFixed(9)}τ`);

  // Per-subnet attribution
  const byNetuid = arch.byNetuid || [];
  const sn0 = byNetuid.find(r => r.netuid === 0);
  const nonRoot = byNetuid.filter(r => r.netuid !== 0);
  const sn0StakeTao = sn0?.stakeTao || 0;
  const nonRootStakeTao = nonRoot.reduce((s, r) => s + r.stakeTao, 0);
  const sumCheck = sn0StakeTao + nonRootStakeTao;

  console.error('\nStep 3: archive byNetuid table (sn0 isolated, non-root sorted by |stakeTao|):');
  console.error(pad('  netuid', 9) + pad('stakeAlpha', 18) + pad('price τ/α', 14) + pad('stakeTao τ', 16) + 'hotkeyCount');
  console.error('  ' + '-'.repeat(70));
  if (sn0) {
    console.error('  ' + pad(`sn0 (root)`, 11) + pad(sn0.stakeAlpha.toFixed(6), 16) + pad('1.0', 14) + pad(sn0.stakeTao.toFixed(9), 16) + sn0.hotkeyCount);
  }
  nonRoot.sort((a, b) => Math.abs(b.stakeTao) - Math.abs(a.stakeTao));
  for (const r of nonRoot.slice(0, 12)) {
    console.error('  ' + padR(`sn${r.netuid}`, 9) + pad(r.stakeAlpha.toFixed(6), 16) + pad(r.price.toFixed(8), 14) + pad(r.stakeTao.toFixed(9), 16) + r.hotkeyCount);
  }
  if (nonRoot.length > 12) console.error(`  ... ${nonRoot.length - 12} more non-root subnets`);

  console.error('\nStep 4: drift attribution vs Taostats balance_staked');
  const driftInclSn0 = arch.stakeTao - ts.balance_staked;
  const driftExclSn0 = nonRootStakeTao - ts.balance_staked;
  console.error(`  archive stakeTao  (incl sn0): ${arch.stakeTao.toFixed(9)}τ`);
  console.error(`  archive stakeTao  (excl sn0): ${nonRootStakeTao.toFixed(9)}τ`);
  console.error(`  taostats balance_staked     : ${ts.balance_staked.toFixed(9)}τ`);
  console.error(`  drift incl sn0              : ${fmtTao(driftInclSn0 * 1)}τ  (${fmtTao(driftInclSn0 * 1000)} mRAO·1000)`);
  console.error(`  drift excl sn0              : ${fmtTao(driftExclSn0 * 1)}τ`);
  console.error(`  sn0 contribution            : ${sn0StakeTao.toFixed(9)}τ  (${(sn0StakeTao / arch.stakeTao * 100).toFixed(2)}% of stake)`);
  console.error(`  sn0 ≈ drift?                : ${Math.abs(sn0StakeTao - Math.abs(driftInclSn0)) < 0.001 ? 'YES — hypothesis (c) confirmed' : 'NO — sn0 not the cause'}`);

  // Step 5: cross-check at CURRENT block (validates per-subnet decode independent of historical Q)
  console.error('\nStep 5: current-block per-subnet cross-check (archive vs Taostats dtao/stake_balance/latest)');
  const [currentArch, currentTs] = await Promise.all([
    getColdkeyStakeTao(COLDKEY),
    taostatsLatestPerSubnet(COLDKEY),
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
      priceDrift: a?.price != null && t?.impliedPrice != null ? a.price - t.impliedPrice : null,
      archStakeTao: aTao,
      tsStakeTao: tTao,
      taoDrift: aTao - tTao,
    });
  }
  console.error(`  archive current total stakeTao : ${archCurTotal.toFixed(9)}τ`);
  console.error(`  taostats current total stakeTao: ${tsCurTotal.toFixed(9)}τ`);
  console.error(`  current drift (incl sn0)       : ${fmtTao(archCurTotal - tsCurTotal)}τ`);

  console.error('\n  per-subnet current cross-check (top by |taoDrift|):');
  console.error('  ' + pad('netuid', 8) + pad('archα', 16) + pad('tsα', 16) + pad('αdrift', 14) + pad('archP', 12) + pad('tsImpP', 12) + pad('Pdrift', 12) + pad('archτ', 14) + pad('tsτ', 14) + 'τdrift');
  perNuCmp.sort((a, b) => Math.abs(b.taoDrift) - Math.abs(a.taoDrift));
  for (const r of perNuCmp.slice(0, 12)) {
    console.error('  ' + pad(`sn${r.netuid}`, 8)
      + pad(r.archStakeAlpha.toFixed(6), 16)
      + pad(r.tsStakeAlpha.toFixed(6), 16)
      + pad(fmtTao(r.alphaDrift), 14)
      + pad(r.archPrice != null ? r.archPrice.toFixed(8) : '-', 12)
      + pad(r.tsImpliedPrice != null ? r.tsImpliedPrice.toFixed(8) : '-', 12)
      + pad(r.priceDrift != null ? fmtTao(r.priceDrift) : '-', 12)
      + pad(r.archStakeTao.toFixed(6), 14)
      + pad(r.tsStakeTao.toFixed(6), 14)
      + fmtTao(r.taoDrift));
  }

  // Hypothesis summary
  const driftConcentration = perNuCmp.slice(0, 3).reduce((s, r) => s + Math.abs(r.taoDrift), 0);
  const totalAbsDrift = perNuCmp.reduce((s, r) => s + Math.abs(r.taoDrift), 0);
  console.error('\nStep 6: hypothesis summary');
  console.error(`  total |τdrift| across subnets (current) : ${totalAbsDrift.toFixed(9)}τ`);
  console.error(`  top-3 subnets share of |τdrift| (current): ${totalAbsDrift > 0 ? (driftConcentration / totalAbsDrift * 100).toFixed(1) : '0'}%`);
  console.error(`  Hypothesis verdict (rough heuristic):`);
  if (Math.abs(sn0StakeTao - Math.abs(driftInclSn0)) < 0.001) {
    console.error('    (c) sn0 (root) convention asymmetry — CONFIRMED at historical anchor');
  } else if (totalAbsDrift > 0 && driftConcentration / totalAbsDrift > 0.7) {
    console.error('    (a) per-subnet AMM pool block drift OR (d) pending-unbond on a single dominant subnet — CONCENTRATED in top-3');
  } else {
    console.error('    (b) rounding asymmetry across many subnets OR (e) semantic split — DISTRIBUTED across all subnets');
  }

  const wallMs = Date.now() - tStart;
  console.error(`\n[probe done] wall=${wallMs}ms archive-latency=${arch.latencyMs.total}ms`);

  // Machine-readable JSON to stdout for capture by ITER_LOG
  process.stdout.write(JSON.stringify({
    coldkey: COLDKEY,
    label: LABEL,
    alignedSecondsAgo,
    archive: {
      blockNumber: arch.blockNumber,
      blockHash: arch.blockHash,
      freeTao: arch.freeTao,
      reservedTao: arch.reservedTao,
      stakeTao: arch.stakeTao,
      totalTao: arch.totalTao,
      byNetuid: arch.byNetuid,
      sn0StakeTao,
      nonRootStakeTao,
      sumCheck,
    },
    taostatsHistory: ts,
    driftInclSn0,
    driftExclSn0,
    currentCrossCheck: {
      archTotal: archCurTotal,
      tsTotal: tsCurTotal,
      drift: archCurTotal - tsCurTotal,
      perSubnet: perNuCmp,
    },
    wallMs,
  }, null, 2) + '\n');
}

main().catch(e => {
  console.error('ERR:', e.stack || e.message);
  process.exit(2);
});
