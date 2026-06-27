// iter 227 stake-valuation parity — TRUE-ANCHOR probe.
//
// FINDING (Taostats /api/block/v1 + /api/account/history/v1 cross-check):
//   iter 225/226 docs claim "aligned anchor 2026-05-28T23:59:48Z, archive block
//   #8294725". But Taostats says block #8294725 is at 2026-05-30T04:23:12Z, and
//   the actual Taostats EOD snapshot block FOR 2026-05-28T23:59:48Z is #8286210
//   (per /api/account/history/v1 record `block_number: 8286210` with
//    `balance_staked: 12427705976`).
//
//   Archive composer has been sampling the WRONG BLOCK — ~1.4 days late.
//   The 16.197 mτ residual may be entirely an anchor-block bug, not a price-
//   source issue. If iter 224 alignment logic uses (currentBlock - WINDOW_DAYS*
//   86400/12) instead of Taostats's actual EOD block_number field, it will
//   drift by the discrepancy between assumed 12s/block and actual block cadence.
//
// THIS PROBE:
//   1. Re-compute archive Σ(stakeα × price) at TRUE anchor block #8286210
//      (Taostats EOD block_number for 2026-05-28 firstSnapshot).
//   2. Compare to Taostats balance_staked 12.427705976τ at the same block.
//   3. If residual collapses to sub-mRAO → iter 224 alignment is the bug;
//      iter 228 amends pnlGroundTruth to use Taostats block_number directly.
//   4. If residual persists → real semantic divergence; iter 228 probes (i)
//      validator haircut / (k) position-set filtering.
//
// Courteous-RPC: 50ms sleep between archive calls.

import {
  getHistoricalColdkeyStakeAlpha,
  getHistoricalSubnetPrices,
  getArchiveBlockHash,
} from '../lib/freeRpc.js';

const COLDKEY = '5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn';
const TAOSTATS_BASE = 'https://api.taostats.io';
const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;

if (!TAOSTATS_KEY) { console.error('TAOSTATS_API_KEY required'); process.exit(1); }

// True anchor from Taostats /api/account/history/v1
const TRUE_ANCHOR_BLOCK = 8286210;
const TAOSTATS_BAL_STAKED_T = 12.427705976;

// Stale anchor used by iter 225/226 (per docs)
const STALE_ANCHOR_BLOCK = 8294725;
const ITER226_ARCHIVE_TOTAL = 12.443902840;

async function main() {
  console.log(`# iter 227 — TRUE-ANCHOR probe`);
  console.log(`\nStale anchor (iter 225/226):    block #${STALE_ANCHOR_BLOCK}`);
  console.log(`True anchor (Taostats EOD):     block #${TRUE_ANCHOR_BLOCK}`);
  console.log(`Block delta:                    ${STALE_ANCHOR_BLOCK - TRUE_ANCHOR_BLOCK} blocks (~${((STALE_ANCHOR_BLOCK - TRUE_ANCHOR_BLOCK) * 12 / 3600).toFixed(2)}h)\n`);

  console.log(`Fetching archive blockHash for #${TRUE_ANCHOR_BLOCK}...`);
  const trueHash = await getArchiveBlockHash(TRUE_ANCHOR_BLOCK);
  console.log(`  trueHash = ${trueHash}`);

  console.log(`\nFetching coldkey stake α at true anchor...`);
  const stake = await getHistoricalColdkeyStakeAlpha(COLDKEY, trueHash);
  const netuids = [...new Set(stake.entries.map(e => e.netuid))].sort((a, b) => a - b);
  console.log(`  ${stake.entries.length} entries across ${netuids.length} subnets`);

  console.log(`\nFetching subnet prices at true anchor...`);
  const { prices } = await getHistoricalSubnetPrices(netuids, trueHash);

  // Sum Σ(stakeα × price) per subnet.
  const perSubnet = {};
  for (const e of stake.entries) {
    const p = prices[e.netuid] ?? 0;
    const t = e.stakeAlpha * p;
    if (!perSubnet[e.netuid]) perSubnet[e.netuid] = { alpha: 0, tao: 0, price: p };
    perSubnet[e.netuid].alpha += e.stakeAlpha;
    perSubnet[e.netuid].tao += t;
  }

  let total = 0;
  let totalAlpha = 0;
  console.log(`\n## Per-subnet stake at TRUE anchor #${TRUE_ANCHOR_BLOCK}\n`);
  console.log(`| sn | stakeα | price τ/α | stakeτ |`);
  console.log(`|---:|---:|---:|---:|`);
  for (const n of netuids) {
    const x = perSubnet[n];
    console.log(`| ${n} | ${x.alpha.toFixed(6)} | ${x.price.toFixed(8)} | ${x.tao.toFixed(6)} |`);
    total += x.tao;
    totalAlpha += x.alpha;
  }
  console.log(`| **Σ** | **${totalAlpha.toFixed(6)}** | — | **${total.toFixed(6)}** |\n`);

  const residualTrue = total - TAOSTATS_BAL_STAKED_T;
  const residualStale = ITER226_ARCHIVE_TOTAL - TAOSTATS_BAL_STAKED_T;

  console.log(`## Result\n`);
  console.log(`| metric | value |`);
  console.log(`|---|---:|`);
  console.log(`| Taostats balance_staked         | ${TAOSTATS_BAL_STAKED_T} τ |`);
  console.log(`| Archive Στ at TRUE anchor       | ${total.toFixed(8)} τ |`);
  console.log(`| Archive Στ at STALE anchor      | ${ITER226_ARCHIVE_TOTAL} τ |`);
  console.log(`| **Residual at TRUE anchor**     | **${(residualTrue * 1000).toFixed(3)} mτ (${(residualTrue / TAOSTATS_BAL_STAKED_T * 100).toFixed(4)}%)** |`);
  console.log(`| Residual at STALE anchor        | ${(residualStale * 1000).toFixed(3)} mτ |`);
  console.log(`| Closure ratio (true/stale)      | ${(residualTrue / residualStale).toFixed(4)} |\n`);

  if (Math.abs(residualTrue) < 0.001) {
    console.log(`## VERDICT: anchor-block bug CONFIRMED — residual collapses to <1 mτ at true anchor.`);
    console.log(`Root cause: iter 224 alignment uses computed blockNumber, NOT Taostats.block_number from /account/history.`);
    console.log(`Iter 228 fix: amend pnlGroundTruth/probe-parity-sweep to use the Taostats record's own block_number field.`);
  } else if (Math.abs(residualTrue) < Math.abs(residualStale) * 0.3) {
    console.log(`## VERDICT: anchor-block bug PARTIAL — residual reduced but not closed. Mixed cause.`);
  } else {
    console.log(`## VERDICT: anchor-block bug NOT confirmed — residual persists at true anchor. Real semantic divergence remains.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
