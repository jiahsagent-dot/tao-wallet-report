// iter 228 mechanical-fix re-sweep — same 4 coldkeys as iter 223/224, but
// archive sample point now anchors to Taostats /api/account/history/v1.block_number
// directly via getHistoricalColdkeyBalance opts.anchorBlock (iter 228 addition)
// instead of secondsAgo→block extrapolation. Validates iter 227's true-anchor
// finding (Jai mantat residual collapsed +16.197 mτ → +0.378 mτ) on the full
// 4-wallet basket.
//
// Decision: if all 4 wallets MATCH (drift < 0.001τ), flip ARCHIVE_STARTING_SHADOW
// default-on in iter 228 commit → Priority #1 starting-balance leg graduation.
// If any wallet ≥5 mτ, ship the fix WITHOUT flag-flip and queue iter 229
// per-wallet diagnostic.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-parity-sweep-aligned.mjs

import { getHistoricalColdkeyBalance } from '../lib/freeRpc.js';

const WALLETS = [
  { label: 'Jai subnets',  coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd' },
  { label: 'Jai mantat',   coldkey: '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn' },
  { label: 'Mum subnets',  coldkey: '5GQAqusPNfe7qbtzXdpv6PcbgxQDG7K3nVwzmLPQKap5cw2V' },
  { label: 'Mum mantat',   coldkey: '5HbWj5vbDnvs4F4v78wktrNcQnXZL5udsB9qDZmRxyEjD1HL' },
];

const WINDOW_DAYS = 30;
const SECONDS = WINDOW_DAYS * 86400;
const TAOSTATS_BASE = 'https://api.taostats.io';
// Iter 223 finding: Taostats /api/account/history/v1 daily-snapshot rows
// land at this UTC time within each `date` day. Iter 224 aligns the archive
// blockHash sample to this exact moment.
const EOD_OFFSET_S = 23 * 3600 + 59 * 60 + 48;

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) {
  console.error('TAOSTATS_API_KEY required (env)');
  process.exit(1);
}

async function taostatsHistory(coldkey) {
  const tEnd = Math.floor(Date.now() / 1000);
  const tStart = tEnd - SECONDS - 86400;
  const url = `${TAOSTATS_BASE}/api/account/history/v1?address=${coldkey}&timestamp_start=${tStart}&timestamp_end=${tEnd}&order=timestamp_asc&limit=100`;
  const t0 = Date.now();
  const r = await fetch(url, {
    headers: { Authorization: TAOSTATS_KEY, Accept: 'application/json' },
  });
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`taostats http ${r.status}`);
  const json = await r.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  if (!rows.length) return { rows: [], firstSnapshot: null, ms };
  const targetTs = Date.now() / 1000 - SECONDS;
  let best = rows[0];
  let bestDelta = Math.abs(Date.parse(best.timestamp) / 1000 - targetTs);
  for (const row of rows) {
    const delta = Math.abs(Date.parse(row.timestamp) / 1000 - targetTs);
    if (delta < bestDelta) { best = row; bestDelta = delta; }
  }
  const toTao = (rao) => rao == null ? null : Number(BigInt(rao)) / 1e9;
  return {
    rows,
    firstSnapshot: {
      timestamp: best.timestamp,
      ts: Date.parse(best.timestamp) / 1000,
      balance_total: toTao(best.balance_total),
      balance_free: toTao(best.balance_free),
      balance_staked: toTao(best.balance_staked),
      blockNumber: best.block_number != null ? Number(best.block_number) : null,
      raw: best,
    },
    ms,
  };
}

function classify(absDrift) {
  if (absDrift < 0.001) return 'MATCH';
  if (absDrift < 0.1) return 'DRIFT';
  return 'WIDE';
}

async function sweepOne(wallet) {
  const tStart = Date.now();
  console.error(`\n[${wallet.label}] ${wallet.coldkey}`);

  // 1. Fetch Taostats /history first to learn firstSnapshotDate.
  let taostats;
  try {
    taostats = await taostatsHistory(wallet.coldkey);
  } catch (e) {
    return { wallet, error: `taostats: ${e.message}`, wallClockMs: Date.now() - tStart };
  }
  const ts = taostats.firstSnapshot;
  if (!ts) {
    return { wallet, taostats, error: 'no taostats rows in window', wallClockMs: Date.now() - tStart };
  }

  // 2. Derive aligned secondsAgo from firstSnapshotDate EOD (kept for logging).
  // Taostats `timestamp` field is the actual EOD instant; use as-is.
  const alignedSampleTsS = Math.floor(ts.ts);
  const alignedSecondsAgo = Math.floor(Date.now() / 1000) - alignedSampleTsS;

  // 3. iter 228 — anchor archive at Taostats's own block_number from the
  //    /account/history row instead of extrapolating from secondsAgo. Closes
  //    the iter 227 ~28h drift caused by the 12s/block constant assumption.
  const anchorBlock = ts.blockNumber;
  if (!Number.isFinite(anchorBlock) || anchorBlock <= 0) {
    return { wallet, taostats, error: `taostats row missing block_number`, alignedSecondsAgo, wallClockMs: Date.now() - tStart };
  }
  let archive;
  try {
    archive = await getHistoricalColdkeyBalance(wallet.coldkey, alignedSecondsAgo, { anchorBlock });
  } catch (e) {
    return { wallet, taostats, error: `archive: ${e.message}`, alignedSecondsAgo, anchorBlock, wallClockMs: Date.now() - tStart };
  }

  // 4. Drift attribution.
  const drift = ts.balance_total - archive.totalTao;
  const absDrift = Math.abs(drift);
  const driftPct = ts.balance_total > 0 ? (drift / ts.balance_total) * 100 : 0;
  const status = classify(absDrift);
  // Sanity: residual alignment offset = archive sample point vs Taostats EOD
  const archiveSampleTs = Math.floor(Date.now() / 1000) - (archive.secondsAgo || alignedSecondsAgo);
  const residualSecondsOff = archiveSampleTs - alignedSampleTsS;

  return {
    wallet,
    archive: {
      totalTao: archive.totalTao,
      freeTao: archive.freeTao,
      reservedTao: archive.reservedTao,
      stakeTao: archive.stakeTao,
      blockNumber: archive.blockNumber,
      anchorSource: archive.anchorSource,
      blockHash: archive.blockHash,
      secondsAgo: archive.secondsAgo,
      latencyMs: archive.latencyMs?.total ?? null,
    },
    taostatsAnchor: { blockNumber: anchorBlock },
    taostats: {
      startingBalanceTao: ts.balance_total,
      free: ts.balance_free,
      staked: ts.balance_staked,
      snapshotTs: ts.timestamp,
      rowsInWindow: taostats.rows.length,
      latencyMs: taostats.ms,
    },
    alignment: {
      alignedSecondsAgo,
      residualSecondsOff,
      residualSecondsAbs: Math.abs(residualSecondsOff),
    },
    drift: { absTao: absDrift, signedTao: drift, pct: driftPct, status },
    wallClockMs: Date.now() - tStart,
  };
}

async function main() {
  console.error(`anchored parity sweep (iter 228): ${WALLETS.length} coldkeys × ${WINDOW_DAYS}d window`);
  console.error(`anchor: archive blockHash @ Taostats /api/account/history/v1.block_number (exact, via opts.anchorBlock)`);
  console.error(`alignment fallback (logging only): firstSnapshot.timestamp (EOD UTC ~${EOD_OFFSET_S}s into day)`);

  const t0 = Date.now();
  const results = [];
  for (const w of WALLETS) {
    results.push(await sweepOne(w));
  }
  const totalMs = Date.now() - t0;

  console.log('\n=== ALIGNED PARITY SWEEP TABLE ===');
  console.log('label        | archive totalτ | taostats startτ | drift τ      | drift % | residual s | status');
  console.log('-'.repeat(120));
  for (const r of results) {
    if (r.error) { console.log(`${r.wallet.label.padEnd(12)} | ERROR: ${r.error}`); continue; }
    const a = r.archive.totalTao.toFixed(6);
    const tt = r.taostats.startingBalanceTao.toFixed(6);
    const d = (r.drift.signedTao >= 0 ? '+' : '') + r.drift.signedTao.toFixed(6);
    const p = (r.drift.pct >= 0 ? '+' : '') + r.drift.pct.toFixed(3) + '%';
    const rs = String(r.alignment.residualSecondsOff);
    console.log(`${r.wallet.label.padEnd(12)} | ${a.padStart(14)} | ${tt.padStart(15)} | ${d.padStart(12)} | ${p.padStart(7)} | ${rs.padStart(10)} | ${r.drift.status}`);
  }
  console.log('-'.repeat(120));
  console.log(`total wall: ${(totalMs / 1000).toFixed(2)}s`);

  const errs = results.filter(r => r.error).length;
  const matches = results.filter(r => !r.error && r.drift.status === 'MATCH').length;
  const drifts = results.filter(r => !r.error && r.drift.status === 'DRIFT').length;
  const wides = results.filter(r => !r.error && r.drift.status === 'WIDE').length;

  console.log(`\n=== DECISION ===`);
  console.log(`errors: ${errs} / match: ${matches} / drift: ${drifts} / wide: ${wides}`);
  let decision;
  if (errs > 0) decision = 'BLOCKED — sweep errors, fix before flag-flip';
  else if (matches >= 3 && wides === 0) decision = 'FLIP — alignment fix validated, flip ARCHIVE_STARTING_SHADOW default-on';
  else if (matches < 3 && wides === 0) decision = 'HOLD — alignment helps but residual mid-window drift on >=2 wallets, ship fix WITHOUT flag-flip';
  else decision = 'BLOCKED — WIDE drift on >=1 wallet, deepen forensics';
  console.log(decision);

  console.log('\n=== JSON ===');
  console.log(JSON.stringify({ results, decision, totalMs }, null, 2));
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
