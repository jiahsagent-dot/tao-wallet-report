// iter 223 parity sweep — archive.chain.opentensor.ai composer vs paid Taostats
// /api/account/history/v1 starting-balance snapshot on 4 monitored coldkeys.
//
// Goal: validate getHistoricalColdkeyBalance (iter 221 composer) against
// Taostats startingBalanceTao for the 30d window on Jai subnets / Jai mantat /
// Mum subnets / Mum mantat. Output per-coldkey table with archive totalTao,
// Taostats startingBalanceTao, drift τ, drift %, alignment offset hours, and
// status (match<0.001τ / drift<0.1τ / wide≥0.1τ). Attribute drift to alignment
// vs real-RAO drift. Gates iter 224 flag-flip default-on.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-parity-sweep.mjs

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

const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) {
  console.error('TAOSTATS_API_KEY required (env)');
  process.exit(1);
}

async function taostatsHistory(coldkey) {
  // Per lessons_taostats_silent_param_drop: address= not coldkey=, timestamp_start= not block_start_from=.
  const tEnd = Math.floor(Date.now() / 1000);
  const tStart = tEnd - SECONDS - 86400; // pad 24h on early side so window-start snapshot is included
  const url = `${TAOSTATS_BASE}/api/account/history/v1?address=${coldkey}&timestamp_start=${tStart}&timestamp_end=${tEnd}&order=timestamp_asc&limit=100`;
  const t0 = Date.now();
  const r = await fetch(url, {
    headers: {
      Authorization: TAOSTATS_KEY,
      Accept: 'application/json',
    },
  });
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`taostats http ${r.status}`);
  const json = await r.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  if (!rows.length) return { rows: [], firstSnapshot: null, ms };
  // pick the snapshot closest to (now - 30d)
  const targetTs = Date.now() / 1000 - SECONDS;
  let best = rows[0];
  let bestDelta = Math.abs(Date.parse(best.timestamp) / 1000 - targetTs);
  for (const row of rows) {
    const delta = Math.abs(Date.parse(row.timestamp) / 1000 - targetTs);
    if (delta < bestDelta) { best = row; bestDelta = delta; }
  }
  // Taostats balance fields: balance_total/balance_free/balance_staked in RAO string
  const toTao = (rao) => rao == null ? null : Number(BigInt(rao)) / 1e9;
  return {
    rows,
    firstSnapshot: {
      timestamp: best.timestamp,
      ts: Date.parse(best.timestamp) / 1000,
      balance_total: toTao(best.balance_total),
      balance_free: toTao(best.balance_free),
      balance_staked: toTao(best.balance_staked),
      raw: best,
    },
    ms,
  };
}

function classifyDrift(absDrift) {
  if (absDrift < 0.001) return 'MATCH';
  if (absDrift < 0.1) return 'DRIFT';
  return 'WIDE';
}

function attributeDrift(absDrift, alignmentHours) {
  // Heuristic: < 0.001τ explained by RAO rounding, > 0.1τ likely real mid-window movement,
  // otherwise sub-block / alignment is the most parsimonious explanation
  if (absDrift < 0.001) return 'rao-rounding';
  if (absDrift < 0.1 && Math.abs(alignmentHours) > 1) return 'alignment-window';
  if (absDrift > 0.1) return 'real-rao-drift (mid-window tx)';
  return 'sub-block';
}

async function sweepOne(wallet) {
  const tStart = Date.now();
  console.error(`\n[${wallet.label}] ${wallet.coldkey}`);
  let archive, taostats, err = null;
  try {
    [archive, taostats] = await Promise.all([
      getHistoricalColdkeyBalance(wallet.coldkey, SECONDS),
      taostatsHistory(wallet.coldkey),
    ]);
  } catch (e) {
    err = e.message;
    return { wallet, error: err, wallClockMs: Date.now() - tStart };
  }

  const ts = taostats.firstSnapshot;
  if (!ts) {
    return { wallet, archive, taostats, error: 'no taostats rows in window', wallClockMs: Date.now() - tStart };
  }

  // Archive blockTs = head - secondsAgo (approx, since blockNumberForSecondsAgo uses sPerBlock)
  const archiveBlockTs = Math.floor(Date.now() / 1000) - SECONDS;
  const alignmentSecondsOff = ts.ts - archiveBlockTs;
  const alignmentHours = alignmentSecondsOff / 3600;

  const drift = ts.balance_total - archive.totalTao;
  const absDrift = Math.abs(drift);
  const driftPct = ts.balance_total > 0 ? (drift / ts.balance_total) * 100 : 0;
  const status = classifyDrift(absDrift);
  const attribution = attributeDrift(absDrift, alignmentHours);

  return {
    wallet,
    archive: {
      totalTao: archive.totalTao,
      freeTao: archive.freeTao,
      reservedTao: archive.reservedTao,
      stakeTao: archive.stakeTao,
      blockNumber: archive.blockNumber,
      blockHash: archive.blockHash,
      latencyMs: archive.latencyMs.total,
    },
    taostats: {
      startingBalanceTao: ts.balance_total,
      free: ts.balance_free,
      staked: ts.balance_staked,
      snapshotTs: ts.timestamp,
      rowsInWindow: taostats.rows.length,
      latencyMs: taostats.ms,
    },
    drift: { absTao: absDrift, signedTao: drift, pct: driftPct, status, attribution, alignmentHours },
    wallClockMs: Date.now() - tStart,
  };
}

async function main() {
  console.error(`parity sweep: ${WALLETS.length} coldkeys × ${WINDOW_DAYS}d window`);
  console.error(`archive endpoint: archive.chain.opentensor.ai`);
  console.error(`taostats endpoint: api.taostats.io/api/account/history/v1`);

  const t0 = Date.now();
  const results = [];
  for (const w of WALLETS) {
    const r = await sweepOne(w);
    results.push(r);
  }
  const totalMs = Date.now() - t0;

  console.log('\n=== PARITY SWEEP TABLE ===');
  console.log('label        | archive totalτ | taostats startτ | drift τ      | drift % | align h | status | attribution');
  console.log('-'.repeat(140));
  for (const r of results) {
    if (r.error) {
      console.log(`${r.wallet.label.padEnd(12)} | ERROR: ${r.error}`);
      continue;
    }
    const a = r.archive.totalTao.toFixed(6);
    const t = r.taostats.startingBalanceTao.toFixed(6);
    const d = (r.drift.signedTao >= 0 ? '+' : '') + r.drift.signedTao.toFixed(6);
    const p = (r.drift.pct >= 0 ? '+' : '') + r.drift.pct.toFixed(3) + '%';
    const h = (r.drift.alignmentHours >= 0 ? '+' : '') + r.drift.alignmentHours.toFixed(2);
    console.log(`${r.wallet.label.padEnd(12)} | ${a.padStart(14)} | ${t.padStart(15)} | ${d.padStart(12)} | ${p.padStart(7)} | ${h.padStart(7)} | ${r.drift.status.padEnd(6)} | ${r.drift.attribution}`);
  }
  console.log('-'.repeat(140));
  console.log(`total wall: ${(totalMs / 1000).toFixed(2)}s`);

  // Decision
  const errs = results.filter(r => r.error).length;
  const matches = results.filter(r => !r.error && r.drift.status === 'MATCH').length;
  const drifts = results.filter(r => !r.error && r.drift.status === 'DRIFT').length;
  const wides = results.filter(r => !r.error && r.drift.status === 'WIDE').length;

  console.log(`\n=== DECISION ===`);
  console.log(`errors: ${errs} / match: ${matches} / drift: ${drifts} / wide: ${wides}`);
  let decision;
  if (errs > 0) decision = 'BLOCKED — errors on sweep, fix before flag-flip';
  else if (matches === WALLETS.length) decision = '(a) flag-flip default-on — clean parity across all 4';
  else if (wides === 0) decision = '(b) flag-flip after alignment-aware comparison — drift bounded';
  else decision = '(c) deepen forensics — wide drift on at least one wallet';
  console.log(decision);

  console.log('\n=== JSON ===');
  console.log(JSON.stringify({ results, decision, totalMs }, null, 2));
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
