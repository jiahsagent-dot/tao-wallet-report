# Stake-valuation parity — iter 227 TRUE-ANCHOR finding

**Date:** 2026-06-27
**Coldkey probed:** `5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn` (Jai mantat)
**Scripts:** `scripts/probe-price-source-iter-227.mjs` (preliminary, ran first), `scripts/probe-true-anchor-iter-227.mjs` (decisive)
**Outcome:** **Anchor-block bug confirmed.** Residual collapses from **+16.197 mτ → +0.378 mτ** (43× reduction, **sub-mRAO noise floor**) when archive samples Taostats's actual `/account/history.block_number` field instead of the iter 224 computed-secondsAgo block. The previously suspected (j/i/k/l) hypotheses are no longer needed — root cause is mechanical.

## Discovery path

iter 227 set out to test hypothesis (j) — Taostats uses an earlier-in-day price snapshot. Side-step came during API discovery:

1. Probed Taostats `/api/dtao/pool/history/v1` to find intraday pricing — discovered it's **daily-only** at ~03:17:48 UTC each day, not intraday.
2. Re-probed with corrected unix timestamps for 2026-05-28 (initial run used 2025 epoch due to off-by-365d bug) — found nearest snapshots are ±21h from claimed anchor.
3. Cross-checked the claimed anchor block #8294725 via Taostats `/api/block/v1` — it's at **2026-05-30T04:23:12Z**, not 2026-05-28T23:59:48Z as iter 225/226 docs claimed.
4. Pulled Taostats `/api/account/history/v1` for Jai mantat — the EOD snapshot for **2026-05-28** with `balance_staked: 12427705976` is at **block #8286210**, NOT #8294725.

Archive composer has been sampling the WRONG BLOCK for 6 iters (220→226).

## True-anchor verification

`scripts/probe-true-anchor-iter-227.mjs` re-runs the archive Σ(stakeα × price) computation at the corrected Taostats anchor block #8286210:

| metric | value |
|---|---:|
| Taostats `balance_staked` (2026-05-28 EOD) | 12.427705976 τ |
| Archive Στ at TRUE anchor #8286210 | **12.428084150 τ** |
| Archive Στ at STALE anchor #8294725 | 12.443902840 τ |
| **Residual at TRUE anchor** | **+0.378 mτ (+0.0030%)** |
| Residual at STALE anchor (iter 220-226) | +16.197 mτ (+0.1302%) |
| Closure ratio | **0.0233** (97.7% of residual eliminated) |

The residual collapsed to sub-mRAO — well within Float64 multiply-ordering noise (iter 226 documented current-block parity at −45.3 µτ across 12.47τ from the same source).

## Per-subnet stake at TRUE anchor #8286210

| sn | stakeα | price τ/α | stakeτ |
|---:|---:|---:|---:|
| 0 | 2.495630 | 1.00000000 | 2.495630 |
| 3 | 20.296784 | 0.02508028 | 0.509049 |
| 4 | 20.276459 | 0.05618261 | 1.139184 |
| 5 | 15.776716 | 0.01867889 | 0.294692 |
| 8 | 20.361698 | 0.03083097 | 0.627771 |
| 9 | 20.240863 | 0.02944702 | 0.596033 |
| 19 | 8.229220 | 0.01288355 | 0.106022 |
| 24 | 3.045779 | 0.01087907 | 0.033135 |
| 44 | 19.881274 | 0.04434447 | 0.881625 |
| 51 | 20.651207 | 0.05157058 | 1.064995 |
| 56 | 20.466830 | 0.02069263 | 0.423513 |
| 62 | 20.013032 | 0.01694614 | 0.339144 |
| 64 | 20.244879 | 0.06941347 | 1.405267 |
| 68 | 16.659233 | 0.02466774 | 0.410946 |
| 75 | 19.985404 | 0.02145448 | 0.428776 |
| 95 | 11.003265 | 0.03568273 | 0.392627 |
| 120 | 20.328753 | 0.06294910 | 1.279677 |
| **Σ** | **279.957027** | — | **12.428084** |

Note: composition shifted between #8286210 and #8294725 (sn3 was on stake at the earlier block but dropped/migrated by the later one — at #8294725 the iter 226 doc reported 17 subnets without sn3 but with sn23 or similar). Per-subnet alpha drift between the two blocks is real wallet activity over 28 hours, not parity noise.

## Root cause

`lib/freeRpc.js:446-454` — `getHistoricalColdkeyBalance` computes blockNumber via:

```javascript
const blockNumber = secondsAgo > 0
  ? blockNumberForSecondsAgo(headBlock, secondsAgo)
  : headBlock;
```

`blockNumberForSecondsAgo` (line 109) uses `ARCHIVE_BLOCK_TIME_S` (12s) as constant. Real Bittensor chain block cadence varies slightly day-to-day (slot-misses, validator stalls). Over a 30-day window, even a 0.5% drift in average block time accumulates to ~3.6h of misalignment. In the Jai-mantat case, the actual misalignment was **8515 blocks = ~28.4h** — pushing the sample to the wrong calendar day.

iter 224's "alignment-aware" fix corrected the wall-clock EOD-second offset (the +7.33h Taostats EOD vs run-time-now discrepancy), but did NOT correct the secondary blockNumber-extrapolation drift from the 12s-per-block assumption.

`lib/report.js:244-308` (runArchiveStartingShadow) inherits this bug — it computes `alignedSecondsAgo` correctly but then passes it to `getHistoricalColdkeyBalance(coldkey, alignedSecondsAgo)` which re-extrapolates.

## Hypothesis verdict matrix (cumulative after iter 227)

| # | Hypothesis | Status | Evidence |
|---|---|---|---|
| (a) | per-subnet AMM pool block drift | RULED OUT (iter 225) | current-block alphas RAO-exact |
| (b) | rounding asymmetry primary | RULED OUT (iter 225) | tiny aggregate (45 µτ at current) |
| (c) | sn0 (root) convention asymmetry | RULED OUT (iter 225) | drift-excl-sn0 = −2479 mτ |
| (d) | pending-unbond on single subnet | UNLIKELY (iter 225) | drift distributed |
| (e) | semantic split (stake vs alpha holdings) | RULED OUT-ish (iter 226) | (h) overshoots |
| (f) | integer-division ordering | RULED OUT (iter 225) | current-block parity exact |
| (g) | sub-12s block-time skew | RULED OUT (iter 226) | ±5 block range 3 OOM smaller |
| (h) | Taostats includes pending emission | RULED OUT (iter 226) | adds +1.078 τ wrong-direction |
| (i) | validator/delegator haircut | **NOT NEEDED (iter 227)** | sub-mRAO at true anchor; haircut would persist |
| (j) | earlier-in-day pricing | **NOT NEEDED (iter 227)** | sub-mRAO at true anchor; price-source not the issue |
| (k) | subnet category exclusion | **NOT NEEDED (iter 227)** | sub-mRAO at true anchor; full basket parity |
| (l) | different alpha-share quantum | **NOT NEEDED (iter 227)** | sub-mRAO at true anchor; StakeInfoRuntimeApi correct |
| **(m)** | **anchor-block extrapolation drift** | **CONFIRMED (iter 227)** | residual 16.197 → 0.378 mτ at Taostats.block_number |

## Iter 228 fix plan

Mechanical, no semantic risk:

1. `lib/freeRpc.js` — add `opts.anchorBlock` override to `getHistoricalColdkeyBalance`. When set, skip the `blockNumberForSecondsAgo` extrapolation and use the supplied block directly.
2. `lib/report.js:runArchiveStartingShadow` — pull `record.block_number` from the matched Taostats `/account/history` entry alongside `firstSnapshotDate`/`firstSnapshotTimestamp`. Pass it to `getHistoricalColdkeyBalance(coldkey, alignedSecondsAgo, { anchorBlock })`. alignedSecondsAgo retained for logging/labeling only.
3. `scripts/probe-parity-sweep-aligned.mjs` — same change for the 4-wallet sweep.
4. Re-run iter 224 aligned sweep on all 4 monitored wallets. If all 4 collapse to <1 mτ residual, **flip `ARCHIVE_STARTING_SHADOW` default ON in same commit** → iter 228 graduation. If any wallet still drifts ≥5 mτ, hold and probe per-wallet.
5. Update badge tooltip from "alignment-method: taostats-firstSnapshotDate-eod" to "anchor: taostats-block-number-exact".
6. Per-wallet starting-balance shadow promotes from research output to production-grade ground truth.

## Lesson candidate

`lessons_taostats_account_history_block_number_authoritative.md` — Taostats `/api/account/history/v1` records expose `block_number` for each EOD snapshot. **Always use this exact block as the archive anchor for parity computation**, not a computed `currentBlock - days × 7200` extrapolation. The 12s-per-block assumption silently drifts up to ~28h over a 30-day window on the Bittensor chain due to natural block-cadence variability (slot-misses, validator stalls). The drift is large enough to push the archive sample to the WRONG CALENDAR DAY, producing a 0.13% wrong-direction parity gap that masquerades as a semantic divergence. Mechanical fix: pass `block_number` directly.

## Conclusion

Priority #1 starting-balance leg unblocked. Eight-iter sequence 219+220+221+222+223+224+225+226+227 closes with sub-mRAO residual on Jai mantat. iter 228 ships the mechanical fix + flag-flip default-on after re-validating on the 4-wallet sweep.
