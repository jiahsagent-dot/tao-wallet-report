// iter 233 stake-valuation parity TAOSTATS PER-SUBNET PRICE-SOURCE ASYMMETRY
// probe — tests (c5) as explanation for the residuals at TRUE anchor block
// #8286210 after the (c3) family was BUSTED by iter 231 and iter 232.
//
// (c5) intuition: Taostats balance_staked at the EOD snapshot may value
// each subnet's stakeAlpha at a price drawn from a slightly different
// block than the StakeInfoRuntimeApi anchor block (e.g., a daily pool
// snapshot at ~03:17 UTC vs the wallet's EOD snapshot block). With
// monotonically rising prices forward of #8286210 (iter 230 confirmed),
// a positive Δ_subnet on each AMM subnet would scale linearly with
// AMM-subnet stakeAlpha and produce the consistent negative residual we
// observe — AND collapse to noise on the sn0-heavy MATCH baseline
// (sn0 has fixed 1τ/α, no AMM, Δ_sn0 ≡ 0).
//
// Models tested:
//   archive_price[n]   = SubnetTAO[n] / SubnetAlphaIn[n] at #8286210
//   taostats_price[n]  = pool/history/v1 closest snapshot at/before #8286210
//   Δ[n]               = taostats_price[n] − archive_price[n]
//   predicted_residual = Σ_n (stakeAlpha[n] × Δ[n])
//
// Match criterion: predicted_residual ≈ −observed_residual on all 3
// wallets within ±20%. (sign flip because shadow path computes
// archive − taostats; if taostats values higher, observed residual is
// negative on our side, prediction should be the positive correction.)
//
// Cross-check on MATCH baseline (Jai mantat): sn0-heavy, prediction
// must collapse to ~observed (+0.378 mτ noise floor) — sn0 contributes
// zero by construction.
//
// Decision branches:
//   (a) predicted ≈ observed ±20% on all 3 → (c5) CONFIRMED → iter 234
//       mechanical fix in lib/freeRpc.js getHistoricalSubnetPrices:
//       prefer Taostats pool snapshot price when available → re-sweep
//       → flag-flip ARCHIVE_STARTING_SHADOW default-on → Priority #1
//       graduation.
//   (b) predicted ≪ observed → (c5) BUSTED → iter 234 (c4)
//       storage-version drift OR bounded-noise flag-flip with
//       ±10 mτ tolerance.
//   (c) predicted ≫ observed → price-anchor model wrong; refine
//       (try later snapshots, different timestamp interpolation).
//   (d) split — fits one wallet not the other → per-subnet basis.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-price-source-asymmetry-iter-233.mjs

import {
  getArchiveBlockHash,
  getHistoricalColdkeyStakeAlpha,
  getHistoricalSubnetPrices,
} from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', observedResidualMTau: -5.975 },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V', observedResidualMTau: -4.415 },
  { label: 'Jai mantat',   coldkey: '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn', observedResidualMTau: +0.378, baseline: true },
];

const ANCHOR_BLOCK = 8286210; // canonical anchor from iter 227+ (Taostats /api/account/history/v1.block_number for 2026-05-28 EOD)
const TAOSTATS_BASE = 'https://api.taostats.io';

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) { console.error('TAOSTATS_API_KEY required'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmtMTau = (n) => (n >= 0 ? '+' : '') + n.toFixed(3);
const pad = (s, n) => String(s).padEnd(n);

// Fetch Taostats pool/history/v1 snapshot for a subnet at/before targetBlock.
// pool/history/v1 silently drops block_number=, block_start_from=, block_end_to=
// — only timestamp-based filters are honoured. Snapshots are once per day at
// ~03:17 UTC. We anchor by timestamp window around the chain-block timestamp
// and pick the snapshot whose block_number is ≤ targetBlock (largest such).
async function taostatsPoolPrice(netuid, targetBlock, targetTimestampSecs) {
  // 36h window centred slightly before the target ts to catch the EOD snapshot at/before targetBlock
  const tStart = targetTimestampSecs - 48 * 3600;
  const tEnd   = targetTimestampSecs + 12 * 3600;
  const url = `${TAOSTATS_BASE}/api/dtao/pool/history/v1?netuid=${netuid}&timestamp_start=${tStart}&timestamp_end=${tEnd}&limit=10&order=block_number_desc`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`taostats pool/history http ${r.status} netuid=${netuid}`);
  const json = await r.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  if (rows.length === 0) return null;
  // Largest block_number ≤ targetBlock
  let best = null;
  for (const row of rows) {
    const bn = Number(row.block_number);
    if (bn <= targetBlock && (!best || bn > Number(best.block_number))) best = row;
  }
  // Fallback: if no row ≤ target, pick the smallest block_number > target (next-day snapshot)
  if (!best) {
    best = rows.reduce((a, b) => Number(a.block_number) < Number(b.block_number) ? a : b);
  }
  return {
    netuid,
    block_number: Number(best.block_number),
    timestamp: best.timestamp,
    price: Number(best.price),
    pickedBeforeAnchor: Number(best.block_number) <= targetBlock,
  };
}

// Fetch the chain timestamp at a block via Substrate Timestamp.now() storage.
// Cheaper: use Taostats /api/block/v1?block_number=... if available, else compute from chain.
async function anchorBlockTimestamp(anchorBlock) {
  // Taostats /api/block/v1 lookup
  const url = `${TAOSTATS_BASE}/api/block/v1?block_number=${anchorBlock}&limit=1`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' } });
  if (r.ok) {
    const json = await r.json();
    const row = json?.data?.[0];
    if (row?.timestamp) return Math.floor(Date.parse(row.timestamp) / 1000);
  }
  // fallback: chain ~12s/block, infer from known anchor (#8280000 ↔ 2026-05-28T03:17:48Z)
  const ANCHOR_KNOWN_BLOCK = 8280000;
  const ANCHOR_KNOWN_TS = Math.floor(Date.parse('2026-05-28T03:17:48Z') / 1000);
  return ANCHOR_KNOWN_TS + (anchorBlock - ANCHOR_KNOWN_BLOCK) * 12;
}

async function probeWallet(wallet, blockHash, anchorTs) {
  const stake = await getHistoricalColdkeyStakeAlpha(wallet.coldkey, blockHash);
  // Aggregate stakeAlpha by netuid (sum across hotkeys)
  const byNetuid = new Map();
  for (const e of stake.entries) {
    const cur = byNetuid.get(e.netuid) || { netuid: e.netuid, stakeAlpha: 0, hotkeyCount: 0 };
    cur.stakeAlpha += e.stakeAlpha;
    cur.hotkeyCount += 1;
    byNetuid.set(e.netuid, cur);
  }
  const subnets = [...byNetuid.values()].sort((a, b) => a.netuid - b.netuid);

  // Archive prices
  const netuids = subnets.map(s => s.netuid);
  const { prices: archivePrices } = await getHistoricalSubnetPrices(netuids, blockHash);

  // Taostats prices per AMM subnet
  const rows = [];
  let predictedResidualTau = 0;
  for (const s of subnets) {
    if (s.netuid === 0) {
      // sn0 root: fixed 1τ/α convention — no AMM, no asymmetry possible
      rows.push({
        netuid: 0,
        stakeAlpha: s.stakeAlpha,
        archivePrice: 1.0,
        taostatsPrice: 1.0,
        deltaPrice: 0,
        contributionTau: 0,
        snapshotBlock: null,
        snapshotTs: null,
        note: 'sn0 root: 1τ/α convention, Δ≡0',
      });
      continue;
    }
    let snap = null;
    try { snap = await taostatsPoolPrice(s.netuid, ANCHOR_BLOCK, anchorTs); } catch (e) { snap = { error: String(e.message || e) }; }
    await sleep(120); // gentle pacing per lessons_taostats_key2_exhausted
    const ap = archivePrices[s.netuid] ?? 0;
    const tp = snap && Number.isFinite(snap.price) ? snap.price : null;
    const dp = tp != null ? tp - ap : null;
    const contrib = dp != null ? s.stakeAlpha * dp : 0;
    predictedResidualTau += contrib;
    rows.push({
      netuid: s.netuid,
      stakeAlpha: s.stakeAlpha,
      archivePrice: ap,
      taostatsPrice: tp,
      deltaPrice: dp,
      contributionTau: contrib,
      snapshotBlock: snap?.block_number ?? null,
      snapshotTs: snap?.timestamp ?? null,
      note: snap?.error ? `snap_err:${snap.error}` : (snap?.pickedBeforeAnchor === false ? 'fallback>anchor' : ''),
    });
  }

  return {
    wallet,
    rows,
    predictedResidualMTau: predictedResidualTau * 1000,
    observedResidualMTau: wallet.observedResidualMTau,
  };
}

async function main() {
  console.log(`# iter 233 (c5) Taostats per-subnet price-source asymmetry probe @ block #${ANCHOR_BLOCK}\n`);
  const blockHash = await getArchiveBlockHash(ANCHOR_BLOCK);
  const anchorTs = await anchorBlockTimestamp(ANCHOR_BLOCK);
  console.log(`anchor blockHash=${blockHash}  ts=${new Date(anchorTs * 1000).toISOString()}\n`);

  const results = [];
  for (const w of WALLETS) {
    console.log(`\n## ${w.label} (${w.coldkey.slice(0,8)}…)`);
    const res = await probeWallet(w, blockHash, anchorTs);
    results.push(res);
    console.log(`${pad('netuid', 8)}${pad('stakeα', 14)}${pad('archive_p', 14)}${pad('taostats_p', 14)}${pad('Δprice', 14)}${pad('contrib_mτ', 14)}${pad('snap_block', 12)}`);
    for (const r of res.rows) {
      console.log(
        `${pad(r.netuid, 8)}${pad(r.stakeAlpha.toFixed(6), 14)}${pad(r.archivePrice.toFixed(8), 14)}` +
        `${pad(r.taostatsPrice != null ? r.taostatsPrice.toFixed(8) : 'null', 14)}` +
        `${pad(r.deltaPrice != null ? r.deltaPrice.toFixed(8) : 'null', 14)}` +
        `${pad((r.contributionTau * 1000).toFixed(3), 14)}` +
        `${pad(r.snapshotBlock ?? '-', 12)}  ${r.note}`
      );
    }
    console.log(`predicted residual: ${fmtMTau(res.predictedResidualMTau)} mτ`);
    console.log(`observed residual:  ${fmtMTau(res.observedResidualMTau)} mτ (taostats − archive convention; shadow is archive − taostats)`);
    // For comparison: prediction is Σ(α × (taostats − archive)) which is the AMOUNT taostats is HIGHER by.
    // Shadow path: residual_mtau_in_shadow = archive_total − taostats_total = − prediction.
    const expectedShadowMTau = -res.predictedResidualMTau;
    console.log(`prediction in shadow convention: ${fmtMTau(expectedShadowMTau)} mτ (compare to observed ${fmtMTau(res.observedResidualMTau)} mτ)`);
    const fitRatio = res.observedResidualMTau !== 0 ? expectedShadowMTau / res.observedResidualMTau : 0;
    console.log(`fit ratio (predicted/observed): ${fitRatio.toFixed(2)}×`);
  }

  console.log('\n# Verdict matrix\n');
  for (const r of results) {
    const expectedShadow = -r.predictedResidualMTau;
    const fitRatio = r.observedResidualMTau !== 0 ? expectedShadow / r.observedResidualMTau : 0;
    let verdict;
    if (Math.abs(fitRatio - 1) <= 0.20) verdict = '(c5) CONFIRMED ±20%';
    else if (Math.abs(expectedShadow) < 0.5 * Math.abs(r.observedResidualMTau)) verdict = '(c5) UNDERSHOOTS (BUSTED candidate)';
    else if (Math.abs(expectedShadow) > 2.0 * Math.abs(r.observedResidualMTau)) verdict = '(c5) OVERSHOOTS (model-refinement candidate)';
    else verdict = '(c5) PARTIAL';
    console.log(`${pad(r.wallet.label, 14)}  observed=${fmtMTau(r.observedResidualMTau)} mτ  predicted_shadow=${fmtMTau(expectedShadow)} mτ  ratio=${fitRatio.toFixed(2)}×  →  ${verdict}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
