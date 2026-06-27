// iter 227 stake-valuation parity — price-source hypothesis test (j refined).
//
// iter 226 ruled out (g) sub-12s block skew + (h) emission inclusion and surfaced
// the residual is wrong-direction (Taostats balance_staked SMALLER than archive
// raw Σ(α × price) by 16.197 mτ / 0.130% on Jai mantat).
//
// API DISCOVERY (this iter):
//   Taostats /api/dtao/pool/history/v1 only exposes DAILY-granularity snapshots
//   at ~03:17:48 UTC each day (~7200 blocks apart). Not intraday. So the
//   "intraday timing" hypothesis (j) reframes as: "which DAILY snapshot does
//   Taostats use to price balance_staked for a given EOD?"
//
// CANDIDATES TESTED (per top-3 stakeτ subnets sn64+sn4+sn120):
//   PA = archive EOD anchor block ~8294725 (2026-05-28T23:59:48Z) — current composer
//   PS = same-day snapshot block ~8280000 (2026-05-28T03:17:48Z)
//   PP = previous-day snapshot ~8272800 (2026-05-27T03:17:48Z)
//   PN = next-day snapshot ~8287200 (2026-05-29T03:17:48Z)
//
// For each subnet × candidate, fetch the pool state at that snapshot block
// and compute price = total_tao / alpha_in_pool (or use the .price field).
// Then for each candidate, compute Σ(top3.stakeα × price_candidate) and compare
// against the archive Σ contribution to derive expected basket delta.
//
// If any single candidate's basket delta matches the residual sign + magnitude
// (~-16.2 mτ across the full basket, ~-1.3 mτ-per-1τ ≈ -0.13%), (j) confirmed
// with that timing convention.
//
// Courteous: 100ms sleep between Taostats API calls.
//
// Run: TAOSTATS_API_KEY=... node scripts/probe-price-source-iter-227.mjs

const TAOSTATS_BASE = 'https://api.taostats.io';
const TAOSTATS_KEY = process.env.TAOSTATS_API_KEY;
if (!TAOSTATS_KEY) { console.error('TAOSTATS_API_KEY required'); process.exit(1); }

// Per-subnet stakeα captured at iter 225/226 anchor block #8294725 (constant within ±5 blocks).
// Source: docs/stake-parity-iter-226.md emission table.
const ANCHOR_STAKE_ALPHA = {
  64:  20.258999,
  4:   20.299009,
  120: 20.355551,
  62:  20.035866,
  44:  19.900265,
  51:  20.687562,
  9:   20.261129,
  5:   15.824271,
  56:  20.497707,
  8:   20.390304,
};
const ANCHOR_PRICE = {
  64:  0.07024,
  4:   0.05623,
  120: 0.06328,
  62:  0.01702,
  44:  0.04344,
  51:  0.05141,
  9:   0.02972,
  5:   0.01860,
  56:  0.02058,
  8:   0.03072,
};

// Aligned anchor metadata
const ANCHOR_BLOCK = 8294725;
const ANCHOR_TS_S = 1779062388;     // 2026-05-28T23:59:48Z
const TAOSTATS_BALANCE_STAKED = 12.427705976;
const ARCHIVE_RAW_STAKE_TOTAL = 12.443902840;
const RESIDUAL_T = ARCHIVE_RAW_STAKE_TOTAL - TAOSTATS_BALANCE_STAKED; // +0.016197

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPoolNearTimestamp(netuid, tsStart, tsEnd) {
  const url = `${TAOSTATS_BASE}/api/dtao/pool/history/v1?netuid=${netuid}&timestamp_start=${tsStart}&timestamp_end=${tsEnd}&limit=5`;
  const r = await fetch(url, { headers: { Authorization: TAOSTATS_KEY } });
  if (!r.ok) throw new Error(`Taostats ${r.status} ${url}`);
  const j = await r.json();
  return j.data || [];
}

async function main() {
  console.log(`# iter 227 — price-source hypothesis test (j refined)\n`);
  console.log(`Anchor block #${ANCHOR_BLOCK} @ 2026-05-28T23:59:48Z`);
  console.log(`Archive raw  Στ = ${ARCHIVE_RAW_STAKE_TOTAL} τ`);
  console.log(`Taostats     Στ = ${TAOSTATS_BALANCE_STAKED} τ`);
  console.log(`Residual        = +${(RESIDUAL_T * 1000).toFixed(3)} mτ (+${(RESIDUAL_T / ARCHIVE_RAW_STAKE_TOTAL * 100).toFixed(4)}%)\n`);

  // Sample snapshot windows: 24h centered at anchor, prev-day, next-day.
  // Each Taostats query needs unix-seconds bounds, and returns DAILY snapshots within.
  const windows = {
    sameDayEarly:  [ANCHOR_TS_S - 22*3600,  ANCHOR_TS_S - 18*3600],  // ~02:00–05:59 anchor-day
    prevDay:       [ANCHOR_TS_S - 46*3600,  ANCHOR_TS_S - 42*3600],  // ~02:00–05:59 prev-day
    nextDay:       [ANCHOR_TS_S +  2*3600,  ANCHOR_TS_S +  6*3600],  // ~02:00–05:59 next-day
  };

  const candidates = Object.keys(windows);
  const TOP3 = [64, 4, 120];
  const ALL_PROBED = Object.keys(ANCHOR_STAKE_ALPHA).map(Number);

  // Fetch pool snapshots for top10 monitored subnets at each candidate window.
  const snapshotsByCandidate = {};
  for (const cand of candidates) {
    const [s, e] = windows[cand];
    snapshotsByCandidate[cand] = {};
    for (const netuid of ALL_PROBED) {
      const data = await fetchPoolNearTimestamp(netuid, s, e);
      if (data.length === 0) {
        console.log(`  ${cand} sn${netuid}: NO DATA in window ${s}..${e}`);
      } else {
        // Pick first (most recent in window).
        const rec = data[0];
        snapshotsByCandidate[cand][netuid] = {
          block: rec.block_number,
          ts: rec.timestamp,
          price: parseFloat(rec.price),
        };
      }
      await sleep(100);
    }
  }

  // Display table per subnet × candidate.
  console.log(`\n## Per-subnet pool prices at candidate snapshot windows\n`);
  console.log(`| sn | anchorPrice (block #${ANCHOR_BLOCK}) | sameDayEarly | prevDay | nextDay |`);
  console.log(`|---:|---:|---:|---:|---:|`);
  for (const netuid of ALL_PROBED) {
    const a = ANCHOR_PRICE[netuid];
    const sde = snapshotsByCandidate.sameDayEarly[netuid]?.price ?? null;
    const pd = snapshotsByCandidate.prevDay[netuid]?.price ?? null;
    const nd = snapshotsByCandidate.nextDay[netuid]?.price ?? null;
    const fmt = (v) => v === null ? 'NO_DATA' : v.toFixed(8);
    console.log(`| ${netuid} | ${a.toFixed(8)} | ${fmt(sde)} | ${fmt(pd)} | ${fmt(nd)} |`);
  }

  // For each candidate, compute Σ(stakeα × price_candidate) across all probed subnets.
  // Compare against archive Σ contribution to those subnets.
  console.log(`\n## Basket Στ contribution at each candidate timing\n`);
  console.log(`| candidate | Στ (probed subset) | Δ vs anchor | Δ (mτ) | Δ residual? |`);
  console.log(`|---|---:|---:|---:|---|`);

  let archiveSubsetT = 0;
  for (const n of ALL_PROBED) archiveSubsetT += ANCHOR_STAKE_ALPHA[n] * ANCHOR_PRICE[n];

  console.log(`| **anchor (current composer)** | ${archiveSubsetT.toFixed(8)} | 0 | 0 | — |`);

  for (const cand of candidates) {
    let total = 0;
    let fullCoverage = true;
    for (const n of ALL_PROBED) {
      const snap = snapshotsByCandidate[cand][n];
      if (!snap) { fullCoverage = false; continue; }
      total += ANCHOR_STAKE_ALPHA[n] * snap.price;
    }
    const delta = total - archiveSubsetT;
    const deltaM = delta * 1000;
    // Naive scale: if subset captures X% of full basket, full residual at this timing would be delta / X * 100.
    // For now, report subset delta directly + flag direction match.
    const dirMatch = (delta < 0) ? '✓ wrong-direction matches' : '✗ wrong direction';
    const note = fullCoverage ? dirMatch : `(partial coverage)`;
    console.log(`| ${cand} | ${total.toFixed(8)} | ${delta.toFixed(8)} | ${deltaM.toFixed(3)} | ${note} |`);
  }

  // Top-3 only (cleaner signal).
  console.log(`\n## Top-3 subset (sn64+sn4+sn120 — strongest signal)\n`);
  console.log(`| candidate | Στ (top3) | Δ vs anchor | Δ (mτ) |`);
  console.log(`|---|---:|---:|---:|`);
  let top3Anchor = 0;
  for (const n of TOP3) top3Anchor += ANCHOR_STAKE_ALPHA[n] * ANCHOR_PRICE[n];
  console.log(`| anchor | ${top3Anchor.toFixed(8)} | 0 | 0 |`);
  for (const cand of candidates) {
    let total = 0;
    let ok = true;
    for (const n of TOP3) {
      const snap = snapshotsByCandidate[cand][n];
      if (!snap) { ok = false; break; }
      total += ANCHOR_STAKE_ALPHA[n] * snap.price;
    }
    if (!ok) { console.log(`| ${cand} | NO_DATA | — | — |`); continue; }
    const delta = total - top3Anchor;
    console.log(`| ${cand} | ${total.toFixed(8)} | ${delta.toFixed(8)} | ${(delta*1000).toFixed(3)} |`);
  }

  // Save raw snapshot data for posterity.
  console.log(`\n## Raw snapshot blocks per candidate\n`);
  for (const cand of candidates) {
    console.log(`### ${cand}`);
    for (const n of ALL_PROBED) {
      const s = snapshotsByCandidate[cand][n];
      if (s) console.log(`  sn${n}: block #${s.block} @ ${s.ts} price=${s.price}`);
    }
  }

  console.log(`\n## Verdict logic\n`);
  console.log(`Residual = +16.197 mτ (archive larger).`);
  console.log(`If a candidate's basket Στ is SMALLER than archive by ≈ -16.197 mτ across ALL 17 subnets, (j) is confirmed for that timing.`);
  console.log(`This probe covers 10 of 17 subnets (~70-80% of basket value). Linear-extrapolate the subset delta to full basket: full_delta ≈ subset_delta × (full_basket / subset_basket).`);
}

main().catch(e => { console.error(e); process.exit(1); });
