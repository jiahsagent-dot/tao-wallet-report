// iter 231 stake-valuation parity per-hotkey commission probe — tests (c3)
// validator commission accrual as explanation for the +5.975 mτ Jai subnets
// and +4.415 mτ Mum subnets residuals at TRUE anchor block #8286210.
//
// Hypothesis matrix after iter 219-230:
//   (a) concentrated outlier         REJECTED iter 229 — magnitude/concentration mismatch
//   (b) Float64 round-then-sum noise REJECTED iter 229 — 1000× too large
//   (c1) sn0 root convention quirk   REJECTED iter 229 — Jai mantat heavy sn0 has no bias
//   (c2) AMM sub-block drift         REJECTED iter 230 — residual persistent at anchor, swing 0.017/0.032 mτ << bias 5.975/4.415 mτ
//   (c3) validator commission accrual UNTESTED ← this probe
//   (c4) StakeInfoRuntimeApi storage-version drift queued
//
// (c3) intuition: Taostats balance_staked may include the per-validator
// commission/"take" accrual on undistributed emission earmarked for the
// nominator at the anchor block, while archive StakeInfoRuntimeApi reads
// the post-commission settled stakeα. If true, archive < taostats by
// Σ(stakeAlpha × price × commission_rate × accrual_window_fraction). The
// shape "consistent negative sign + scales with concentration index" matches
// what concentration on commission-charging validators would produce.
//
// Method:
//   1. For each DRIFT wallet at #8286210, decode StakeInfoRuntimeApi entries
//      → unique (hotkey, netuid) set with stakeAlpha + price.
//   2. For each unique hotkey, fetch Taostats /api/validator/latest/v1?hotkey=...
//      Extract take (commission rate). Normalise units: Bittensor stores take
//      as u16 (0..65535) ≡ fraction (0..1). Taostats may surface as basis
//      points, fraction, or percent — inspect raw payload first.
//   3. Compute STAKE-BASE PROXY: per (hotkey, netuid) ⇒
//        commission_tau ≈ stakeAlpha × price × take_fraction
//      Sum per coldkey. Compare against residual.
//   4. Decision branches:
//      (a) commission ≈ residual (±20%) → (c3) CONFIRMED → iter 232 mechanical fix
//      (b) commission ≪ residual (<30%) → (c3) BUSTED → iter 232 (c4) probe
//      (c) commission ≫ residual (>200%) → commission charged on emission only, not stake-base → iter 232 refine model
//      (d) split — one wallet matches, the other doesn't → per-validator deep dive
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-commission-iter-231.mjs

import {
  getHistoricalColdkeyStakeTao,
  getArchiveFinalizedHead,
  getArchiveBlockHash,
} from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', expectedResidualMTau: -5.975 },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V', expectedResidualMTau: -4.415 },
  { label: 'Jai mantat',   coldkey: '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn', expectedResidualMTau: +0.378, baseline: true },
];

const WINDOW_DAYS = 30;
const TAOSTATS_BASE = 'https://api.taostats.io';
const HOTKEY_CALL_DELAY_MS = 220;

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

// Cache validator metadata per-hotkey across wallets (the same validator is
// often staked-to from multiple coldkeys).
const VALIDATOR_CACHE = new Map();
let firstPayloadLogged = false;

async function taostatsValidator(hotkey) {
  if (VALIDATOR_CACHE.has(hotkey)) return VALIDATOR_CACHE.get(hotkey);
  const url = `${TAOSTATS_BASE}/api/validator/latest/v1?hotkey=${hotkey}`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' } });
  if (!r.ok) {
    VALIDATOR_CACHE.set(hotkey, { hotkey, error: `http ${r.status}` });
    return VALIDATOR_CACHE.get(hotkey);
  }
  const json = await r.json();
  if (!firstPayloadLogged) {
    console.error('\n[debug] FIRST validator payload shape:');
    console.error(JSON.stringify(json, null, 2).slice(0, 1200));
    firstPayloadLogged = true;
  }
  const rows = Array.isArray(json?.data) ? json.data : (json?.data ? [json.data] : []);
  // Find the entry whose hotkey matches (silent-param-drop guard from
  // lessons_taostats_silent_param_drop).
  const match = rows.find(r => (r.hotkey || r.address || r.coldkey) === hotkey) || rows[0];
  if (!match) {
    VALIDATOR_CACHE.set(hotkey, { hotkey, error: 'no-row' });
    return VALIDATOR_CACHE.get(hotkey);
  }
  // Probe a handful of plausible field names. Bittensor on-chain `take` is
  // u16 (0..65535) — fraction = u16/65535. Taostats often pre-normalises to
  // fraction (0..1) or percent (0..100).
  const candidates = {
    take: match.take,
    commission: match.commission,
    commission_rate: match.commission_rate,
    take_percent: match.take_percent,
    delegate_take: match.delegate_take,
    validator_take: match.validator_take,
    nominator_take: match.nominator_take,
  };
  // Pick first finite candidate, normalise to fraction (0..1).
  let rawTake = null;
  let rawTakeField = null;
  for (const [k, v] of Object.entries(candidates)) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) { rawTake = n; rawTakeField = k; break; }
  }
  let takeFraction = null;
  let takeNormalisationNote = '';
  if (rawTake != null) {
    if (rawTake > 1000) {
      takeFraction = rawTake / 65535;
      takeNormalisationNote = 'u16 (0..65535)';
    } else if (rawTake > 1) {
      takeFraction = rawTake / 100;
      takeNormalisationNote = 'percent (0..100)';
    } else {
      takeFraction = rawTake;
      takeNormalisationNote = 'fraction (0..1)';
    }
  }
  const entry = {
    hotkey,
    name: match.name || match.validator_name || null,
    rawTake,
    rawTakeField,
    takeFraction,
    takeNormalisationNote,
    rowsReturned: rows.length,
  };
  VALIDATOR_CACHE.set(hotkey, entry);
  return entry;
}

function fmtTao(n) { return (n >= 0 ? '+' : '') + n.toFixed(6); }
function pad(s, n) { return String(s).padEnd(n); }
function padR(s, n) { return String(s).padStart(n); }

async function probeOne(wallet, sharedAnchorBlock = null) {
  console.error(`\n========== [${wallet.label}] ${wallet.coldkey} ==========`);

  let anchorBlock;
  let targetStakedTao;
  if (sharedAnchorBlock != null) {
    anchorBlock = sharedAnchorBlock.blockNumber;
    targetStakedTao = sharedAnchorBlock.targetStakedTao;
    console.error(`Step 1: shared anchor block=${anchorBlock} target=${targetStakedTao}τ`);
  } else {
    const ts = await taostatsHistory(wallet.coldkey);
    if (!Number.isFinite(ts.blockNumber)) return { wallet, error: 'no-block-number' };
    anchorBlock = ts.blockNumber;
    targetStakedTao = ts.balance_staked;
    console.error(`Step 1: Taostats /history → ${ts.timestamp} balance_staked=${ts.balance_staked}τ block_number=${anchorBlock}`);
  }

  const blockHash = await getArchiveBlockHash(anchorBlock);
  console.error(`Step 2: archive blockHash=${blockHash}`);

  const stake = await getHistoricalColdkeyStakeTao(wallet.coldkey, blockHash);
  console.error(`Step 3: StakeInfoRuntimeApi decoded ${stake.entries.length} (hotkey,netuid) entries → Σstakeτ=${stake.totalStakeTao.toFixed(9)}`);
  const residualTau = stake.totalStakeTao - targetStakedTao;
  console.error(`        residual = archive − taostats = ${fmtTao(residualTau)}τ (${fmtTao(residualTau * 1000)} mτ)`);

  // Step 4: per-hotkey commission lookup
  const uniqueHotkeys = [...new Set(stake.entries.map(e => e.hotkey))];
  console.error(`\nStep 4: fetching validator metadata for ${uniqueHotkeys.length} unique hotkey(s)`);
  const validators = [];
  for (const hk of uniqueHotkeys) {
    const v = await taostatsValidator(hk);
    validators.push(v);
    await sleep(HOTKEY_CALL_DELAY_MS);
  }
  const validatorByHotkey = Object.fromEntries(validators.map(v => [v.hotkey, v]));

  // Step 5: compute STAKE-BASE PROXY commission per (hotkey, netuid).
  let totalStakeBaseCommissionTau = 0;
  const perEntry = [];
  for (const e of stake.entries) {
    const v = validatorByHotkey[e.hotkey];
    const takeF = v?.takeFraction ?? null;
    const commTau = (Number.isFinite(takeF) ? e.stakeTao * takeF : null);
    if (Number.isFinite(commTau)) totalStakeBaseCommissionTau += commTau;
    perEntry.push({
      hotkey: e.hotkey,
      hotkeyShort: e.hotkey.slice(0, 8) + '…' + e.hotkey.slice(-4),
      netuid: e.netuid,
      stakeAlpha: e.stakeAlpha,
      price: e.price,
      stakeTao: e.stakeTao,
      takeFraction: takeF,
      takeNoteRaw: v?.rawTake,
      takeNoteField: v?.rawTakeField,
      commissionTau: commTau,
      validatorName: v?.name,
      validatorError: v?.error,
    });
  }
  perEntry.sort((a, b) => (Math.abs(b.commissionTau ?? 0)) - Math.abs(a.commissionTau ?? 0));

  // Step 6: report
  console.error(`\nStep 5: per (hotkey, netuid) entries with commission proxy`);
  console.error('  ' + pad('hotkey', 16) + pad('sn', 6) + pad('stakeα', 14) + pad('priceτ/α', 12) + pad('stakeτ', 14) + pad('take', 10) + 'commτ');
  console.error('  ' + '-'.repeat(96));
  for (const e of perEntry) {
    const takeS = e.takeFraction != null ? (e.takeFraction * 100).toFixed(2) + '%' : 'n/a';
    const commS = e.commissionTau != null ? e.commissionTau.toFixed(9) : 'n/a';
    console.error('  '
      + pad(e.hotkeyShort, 16)
      + pad(`sn${e.netuid}`, 6)
      + pad(e.stakeAlpha.toFixed(6), 14)
      + pad((e.price ?? 0).toFixed(6), 12)
      + pad(e.stakeTao.toFixed(9), 14)
      + pad(takeS, 10)
      + commS);
  }

  // Step 7: aggregate per-hotkey
  const byHotkey = {};
  for (const e of perEntry) {
    if (!byHotkey[e.hotkey]) byHotkey[e.hotkey] = {
      hotkey: e.hotkey,
      hotkeyShort: e.hotkeyShort,
      validatorName: e.validatorName,
      takeFraction: e.takeFraction,
      stakeTaoSum: 0,
      commissionTauSum: 0,
      subnets: 0,
    };
    byHotkey[e.hotkey].stakeTaoSum += e.stakeTao;
    if (Number.isFinite(e.commissionTau)) byHotkey[e.hotkey].commissionTauSum += e.commissionTau;
    byHotkey[e.hotkey].subnets += 1;
  }
  const hotkeyAgg = Object.values(byHotkey).sort((a, b) => b.commissionTauSum - a.commissionTauSum);
  console.error(`\nStep 6: per-hotkey aggregate (sorted by stake-base commission)`);
  console.error('  ' + pad('hotkey', 16) + pad('subnets', 10) + pad('stakeτ', 14) + pad('take', 10) + 'commτ');
  console.error('  ' + '-'.repeat(72));
  for (const h of hotkeyAgg) {
    const takeS = h.takeFraction != null ? (h.takeFraction * 100).toFixed(2) + '%' : 'n/a';
    console.error('  '
      + pad(h.hotkeyShort, 16)
      + pad(String(h.subnets), 10)
      + pad(h.stakeTaoSum.toFixed(9), 14)
      + pad(takeS, 10)
      + h.commissionTauSum.toFixed(9));
  }

  // Step 8: verdict for THIS wallet (full classification done in main summary)
  const residualMTau = residualTau * 1000;
  const commMTau = totalStakeBaseCommissionTau * 1000;
  // residual is negative (archive UNDER taostats); for "commission accrual on
  // taostats side" hypothesis we compare |residual| vs commission magnitude.
  const absRes = Math.abs(residualMTau);
  const ratio = commMTau > 0 ? commMTau / absRes : null;
  console.error(`\nStep 7: VERDICT for ${wallet.label}`);
  console.error(`  residual              = ${fmtTao(residualMTau)} mτ (|res|=${absRes.toFixed(3)})`);
  console.error(`  stake-base commission = ${commMTau.toFixed(3)} mτ`);
  console.error(`  ratio comm/|res|      = ${ratio == null ? 'n/a' : ratio.toFixed(3)}`);

  return {
    wallet,
    anchorBlock,
    blockHash,
    targetStakedTao,
    archiveTotalStakeTao: stake.totalStakeTao,
    residualTau,
    residualMTau,
    totalStakeBaseCommissionTau,
    commissionMTau: commMTau,
    ratio,
    perEntry,
    hotkeyAgg,
  };
}

async function main() {
  const t0 = Date.now();

  // Use Jai subnets to lock in shared anchor block #8286210, then re-use
  // the same block for Mum subnets + Jai mantat so all 3 reference the same
  // chain state (commission rates barely change at sub-day scale anyway).
  const jaiSubnetsTs = await taostatsHistory(WALLETS[0].coldkey);
  if (!Number.isFinite(jaiSubnetsTs.blockNumber)) {
    console.error('FATAL: Jai subnets has no Taostats block_number — cannot proceed');
    process.exit(2);
  }
  const sharedAnchorBlock = { blockNumber: jaiSubnetsTs.blockNumber, targetStakedTao: jaiSubnetsTs.balance_staked };
  console.error(`\nShared anchor: block #${sharedAnchorBlock.blockNumber} (Jai subnets target ${sharedAnchorBlock.targetStakedTao}τ)`);

  const results = [];
  // Jai subnets uses its own target (already in shared); the other two need
  // wallet-specific targets — re-fetch their own /history at the same anchor.
  for (let i = 0; i < WALLETS.length; i++) {
    const w = WALLETS[i];
    try {
      if (i === 0) {
        results.push(await probeOne(w, sharedAnchorBlock));
      } else {
        const ts = await taostatsHistory(w.coldkey);
        results.push(await probeOne(w, {
          blockNumber: sharedAnchorBlock.blockNumber,
          targetStakedTao: ts.balance_staked,
        }));
      }
    } catch (e) {
      console.error(`ERR [${w.label}]: ${e.stack || e.message}`);
      results.push({ wallet: w, error: e.message });
    }
  }

  console.error(`\n========== SUMMARY (${((Date.now() - t0) / 1000).toFixed(1)}s) ==========`);
  console.error(pad('wallet', 14) + pad('residual mτ', 14) + pad('commission mτ', 16) + pad('ratio', 10) + 'verdict');
  console.error('-'.repeat(80));
  for (const r of results) {
    if (r.error) {
      console.error(pad(r.wallet.label, 14) + 'ERR ' + r.error);
      continue;
    }
    const absRes = Math.abs(r.residualMTau);
    let v;
    if (r.commissionMTau == null) v = 'no-commission-data';
    else if (r.commissionMTau >= 0.8 * absRes && r.commissionMTau <= 1.2 * absRes) v = 'c3-CONFIRMED';
    else if (r.commissionMTau < 0.3 * absRes) v = 'c3-BUSTED';
    else if (r.commissionMTau > 2.0 * absRes) v = 'c3-OVERSHOOTS';
    else v = 'c3-PARTIAL';
    console.error(pad(r.wallet.label, 14)
      + pad(fmtTao(r.residualMTau), 14)
      + pad(r.commissionMTau.toFixed(3), 16)
      + pad(r.ratio == null ? 'n/a' : r.ratio.toFixed(3), 10)
      + v);
  }

  console.log(JSON.stringify({
    iter: 231,
    anchorBlock: sharedAnchorBlock.blockNumber,
    results: results.map(r => r.error ? r : {
      wallet: r.wallet.label,
      coldkey: r.wallet.coldkey,
      residualMTau: r.residualMTau,
      commissionMTau: r.commissionMTau,
      ratio: r.ratio,
      uniqueHotkeys: r.hotkeyAgg?.length ?? 0,
      hotkeyTopRows: r.hotkeyAgg?.slice(0, 5).map(h => ({
        hotkey: h.hotkeyShort,
        take: h.takeFraction,
        stakeTao: h.stakeTaoSum,
        commTau: h.commissionTauSum,
      })),
    }),
  }, null, 2));
}

main().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
