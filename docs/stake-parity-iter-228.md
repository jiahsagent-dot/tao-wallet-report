# iter 228 — Mechanical fix for anchor-block extrapolation drift, 4-wallet re-sweep

**Date:** 2026-06-27
**Closes nine-iter sequence:** 219+220+221+222+223+224+225+226+227+228 on Priority #1 starting-balance leg.
**Status:** SHIP MECHANICAL FIX (no flag-flip). Jai subnets 5.975 mτ residual is above the 5 mτ flag-flip gate; iter 229 per-wallet diagnostic queued for the 3 DRIFT wallets.

## What shipped

| File | Change |
|---|---|
| `lib/freeRpc.js` | `getHistoricalColdkeyBalance` accepts `opts.anchorBlock`. When set, archive samples the supplied block directly and skips `blockNumberForSecondsAgo` extrapolation. Return object now includes `anchorSource ∈ { taostats-block-number-exact, extrapolated-12s-per-block, head }`. |
| `lib/taostats.js` | `getTaxReportRangeFree` emits `block_number: r.block_number` on each synthesized snapshot row so downstream consumers can anchor on the exact Taostats EOD block. |
| `lib/report.js` | `runArchiveStartingShadow` takes a third arg `firstSnapshotBlockNumber`; when present, forwards as `opts.anchorBlock` to `getHistoricalColdkeyBalance`. `alignmentMethod` label flips to `taostats-block-number-exact` when anchor is used. |
| `app/_components/Report.jsx` | Badge tooltip distinguishes anchor-exact path (cites iter 228 mechanical-fix) from EOD-fallback path. |
| `scripts/probe-parity-sweep-aligned.mjs` | Pulls `block_number` from Taostats `/api/account/history/v1` row, passes as `opts.anchorBlock`. |

`ARCHIVE_STARTING_SHADOW` remains opt-in (env=`1`) — flag-flip default-on deferred pending iter 229 per-wallet diagnostic on the 3 DRIFT wallets.

## 4-wallet aligned sweep result (anchor: Taostats block_number)

All 4 wallets anchored at block #8286210 (Taostats EOD for 2026-05-28, blockHash `0xb026816532129f48fc04e5322f2eb55e1b3f6efb3fe971ed83f3712713ab4cbc`).

| Wallet | Archive Στ | Taostats startτ | Drift τ | Drift % | Residual s | Status |
|---|---:|---:|---:|---:|---:|---|
| Jai subnets | 5.757745 | 5.763720 | **+0.005975** | +0.104% | 2 | DRIFT |
| Jai mantat | 12.719339 | 12.718961 | **−0.000378** | −0.003% | 0 | **MATCH** |
| Mum subnets | 3.402290 | 3.406705 | **+0.004415** | +0.130% | 1 | DRIFT |
| Mum mantat | 1.864945 | 1.863687 | **−0.001257** | −0.067% | 1 | DRIFT |

Match floor (< 1 mτ): 1/4. Sub-5 mτ DRIFT band: 3/4. WIDE (> 100 mτ): 0/4.

## Comparison to iter 224 baseline (extrapolated anchor)

| Wallet | iter 224 drift τ | iter 228 drift τ | Collapse |
|---|---:|---:|---:|
| Jai mantat (iter 227 deep dive) | +0.016197 | **−0.000378** | 43× (97.7% eliminated) |
| Jai subnets / Mum subnets / Mum mantat | (from iter 224 sweep, similar band) | 1.3 mτ – 6.0 mτ | (within iter 224's 5–48 mRAO stake-leg-drift band) |

The mechanical fix DECISIVELY confirms iter 227's true-anchor finding: 12s/block extrapolation was responsible for ~16 mτ of residual on Jai mantat; flipping to Taostats's own `block_number` field collapses that residual to sub-mRAO noise floor.

## Decision: (b) HOLD on flag-flip

Per iter 291 fire plan (b): "ANY WALLET ≥5 mτ → ship mechanical fix alone (no flag-flip), queue iter 229 per-wallet diagnostic on the holdout(s)".

Jai subnets at **+5.975 mτ** (+0.104%) is above the 5 mτ gate. 3 of 4 wallets remain in DRIFT band post-fix. Hypothesis: the residual on the 3 DRIFT wallets is NOT anchor-block extrapolation (which has been confirmed eliminated) — it is a separate stake-valuation parity gap that iter 226's hypothesis matrix had partially probed but iter 227's true-anchor finding overshadowed.

**Search direction for iter 229** (the 3 DRIFT-wallet residuals): mixed sign (+/-/+/-), magnitudes 1.3–6.0 mτ, no obvious pattern by mantat vs subnet wallet. Resurface iter 226's (i)/(j)/(k)/(l) candidates — they may explain a sub-component of the residual that survived the iter 228 mechanical fix on the non-mantat wallets specifically. iter 227 ruled them "not needed" on Jai mantat at the true anchor, but the 4-wallet sweep shows they're still active on the other 3.

## Mechanical-fix invariants verified

1. `anchorSource: "taostats-block-number-exact"` on all 4 wallet results — no fallback path triggered.
2. `archive.blockNumber === taostatsAnchor.blockNumber` on all 4 (8286210) — the override took effect.
3. `residualSecondsOff` ≤ 2s on all 4 — Taostats `timestamp` field aligns with the chain block we sampled.
4. Backward-compat preserved: callers without `opts.anchorBlock` continue using `blockNumberForSecondsAgo` extrapolation; production critical path is unchanged.

## Lesson candidate (Drive-bound)

`lessons_taostats_account_history_block_number_authoritative.md` — Taostats `/api/account/history/v1` records expose a `block_number` field for each EOD snapshot. Always use that exact block as the archive sampling anchor — never a computed `currentBlock - days × 7200` extrapolation. The 12s-per-block assumption silently drifts up to ~28 hours over a 30-day window on Bittensor (slot-misses, validator stalls), large enough to push samples to the wrong calendar day and produce 0.1–0.13% wrong-direction parity gaps that masquerade as semantic divergence. Mechanical fix: pass `record.block_number` directly into the archive call. Verified iter 228 4-wallet sweep: Jai mantat residual collapsed +16.197 mτ → −0.378 mτ (43× reduction, sub-mRAO noise floor).

## Iter 229 queued

Per-wallet diagnostic on the 3 DRIFT wallets:
- **Jai subnets** (+5.975 mτ, the holdout) — most heavily-staked wallet (5.16 τ stake leg); probe per-subnet stake breakdown at #8286210 and compare against Taostats per-subnet positions endpoint to localise the residual to specific subnets.
- **Mum subnets** (+4.415 mτ) — same probe shape.
- **Mum mantat** (−1.257 mτ) — already sub-mRAO-ish, may be Float64 ordering noise; deprioritise vs subnet wallets.

Resurface iter 226's (i)/(j)/(k)/(l) candidates against this filtered residual. If (j) intraday-pricing falls out as the dominant cause on the 3 DRIFT wallets, queue iter 230 composer TWAP. If (k) subnet-category filtering, queue 230 per-subnet bookkeeping comparison.
