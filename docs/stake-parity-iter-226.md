# Stake-valuation parity — iter 226 two-part hypothesis test

**Date:** 2026-06-27
**Coldkey probed:** `5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn` (Jai mantat)
**Script:** `scripts/probe-stake-hypothesis-test.mjs`
**Outcome:** **both hypotheses busted** — neither (g) sub-12s block-time skew nor (h) Taostats balance_staked includes pending alpha emission explains the residual. Decision (c): queue iter 227 deeper forensics in new directions.

## Setup

Iter 225 isolated the +16.197 mτ historical residual (Jai mantat, aligned anchor 2026-05-28T23:59:48Z, archive block #8294725) to one of:

- **(g)** Sub-12s block-time skew — archive nearest-block lookup vs Taostats EOD snapshot block
- **(h)** Taostats `balance_staked` includes pending alpha emission while archive reads only raw at-block `SubstakeShares`

The StakeInfo decoder already exposes `entry.emissionAlpha` + `entry.alphaEmissionAlpha` (lib/freeRpc.js:202-203) — `getColdkeyStakeAlpha` just sums `stakeAlpha` only. So (h) is testable inline by re-aggregating the existing decode.

## (g) Block-sensitivity sweep — stakeTao at target ± [-100,-5,-1,0,+1,+5,+100] blocks

| Δ blocks | Block # | stakeTao τ | Σα α |
|---:|---:|---:|---:|
| −100 | 8294623 | 12.442417303 | 280.330324 |
| −5 | 8294719 | 12.443871994 | 280.343927 |
| −1 | 8294723 | 12.443899031 | 280.343927 |
| **0** | **8294725** | **12.443902840** | **280.343927** |
| +1 | 8294725 | 12.443902840 | 280.343927 |
| +5 | 8294729 | 12.443910177 | 280.343927 |
| +100 | 8294824 | 12.439744198 | 280.343927 |

(Note: `+1` lands on same archive block as `Δ=0` — archive block-hash lookup is monotonic by `secondsAgo`, not strictly 1-to-1 with block ±1.)

**Sensitivity stats:**

| Metric | Value |
|---|---:|
| target stakeTao | 12.443902840 τ |
| Taostats balance_staked | 12.427705976 τ |
| **residual at target** | **+0.016197 τ (16.197 mτ)** |
| ±5 block window range | 0.000038 τ (**0.038 mτ**) |
| ±100 block range | 0.004166 τ (4.166 mτ) |

**Verdict (g): INSUFFICIENT.** ±5 block window only spans 0.038 mτ — three orders of magnitude smaller than the residual. ±100 blocks (~21 min) spans 4.166 mτ — still 4× too small. To explain a 16.197 mτ residual via block-time skew alone would require >400 blocks (~83 min) of separation, vastly outside normal alignment noise. Σα is constant across ±5 blocks (stake quantum unchanged within the window) — the small price drift comes purely from AMM pool reserve evolution.

## (h) Emission-inclusive decode at target blockHash `0x75210e85…`

Re-aggregate per-entry `stakeAlpha`, `emissionAlpha`, `alphaEmissionAlpha` against the same per-subnet prices:

| Variant | Σα α | Στ τ | Drift vs Taostats |
|---|---:|---:|---:|
| **rawStake** (current composer) | 280.343927 | **12.443902840** | **+0.016197 τ** |
| stakePlusEmission | 309.760435 | 13.505774699 | +1.078069 τ |
| stakePlusAlphaEmission | 280.343927 | 12.443902840 | +0.016197 τ |
| stakePlusBoth | 309.760435 | 13.505774699 | +1.078069 τ |

`alphaEmissionAlpha` is **0.0 on every entry** at this block — appears unpopulated for delegators in current Bittensor runtime, so it's a no-op addition. `emissionAlpha` is real (~1.078 τ aggregated across all subnets) but adding it overshoots Taostats by +66× the residual.

### Per-subnet pending emission (top 10 by `emissionAlpha + alphaEmissionAlpha`)

| sn | stakeα | emα | αemα | price τ/α | rawτ | emτ |
|---:|---:|---:|---:|---:|---:|---:|
| 62 | 20.035866 | 6.146280 | 0 | 0.01702 | 0.340943 | 0.104589 |
| 44 | 19.900265 | 2.512200 | 0 | 0.04344 | 0.864495 | 0.109133 |
| 4 | 20.299009 | 2.488590 | 0 | 0.05623 | 1.141329 | 0.139923 |
| 120 | 20.355551 | 2.407011 | 0 | 0.06328 | 1.288042 | 0.152309 |
| 51 | 20.687562 | 2.391637 | 0 | 0.05141 | 1.063453 | 0.122943 |
| 64 | 20.258999 | 2.203207 | 0 | 0.07024 | 1.422940 | 0.154748 |
| 9 | 20.261129 | 2.129133 | 0 | 0.02972 | 0.602136 | 0.063275 |
| 5 | 15.824271 | 1.797499 | 0 | 0.01860 | 0.294261 | 0.033425 |
| 56 | 20.497707 | 1.270737 | 0 | 0.02058 | 0.421881 | 0.026154 |
| 8 | 20.390304 | 1.242613 | 0 | 0.03072 | 0.626451 | 0.038177 |

**Verdict (h): NOT CONFIRMED.** Best variant is `rawStake` (smallest drift +16.197 mτ). Taostats `balance_staked` is **smaller** than archive raw stake — adding any pending-emission component widens the gap. The wrong-direction is itself evidence: Taostats is not inclusive of pending emissions, so amending the composer to sum them would *worsen* parity by 66×.

## Hypothesis verdict matrix (cumulative after iter 226)

| # | Hypothesis | Status | Evidence |
|---|---|---|---|
| (a) | per-subnet AMM pool block drift | RULED OUT | iter 225 current-block alphas RAO-exact |
| (b) | rounding asymmetry primary | RULED OUT | iter 225 distributed but tiny (45 µτ aggregate at current) |
| (c) | sn0 (root) convention asymmetry | RULED OUT | drift-excl-sn0 = −2479 mτ; Taostats clearly includes sn0 |
| (d) | pending-unbond on single subnet | UNLIKELY | drift distributed across all subnets in iter 225 |
| (e) | semantic split (stake vs alpha holdings) | RULED OUT-ish | covered by (h) — emission inclusion overshoots |
| (f) | integer-division ordering | RULED OUT | iter 225 current-block parity exact |
| **(g)** | **sub-12s block-time skew** | **RULED OUT (iter 226)** | ±5 block range 0.038 mτ vs 16.197 mτ residual; ±100 only 4 mτ |
| **(h)** | **Taostats includes pending emission** | **RULED OUT (iter 226)** | adding emissionAlpha overshoots by +1.078 τ (66× wrong-sign) |

## New hypotheses surfaced for iter 227

The fact that Taostats is **smaller** than archive by 16 mτ (rather than larger) flips the search direction:

- **(i)** Taostats applies a validator/delegator haircut (commission, slashing reserve, withhold) before summing — would yield a consistent percentage shortfall.
- **(j)** Taostats uses an earlier-in-day block (e.g., 00:00:00Z block instead of 23:59:48Z) for per-subnet pricing. To explain a 16 mτ price drift over ~24h would require ~0.13% average AMM price drift across the stake-weighted subnet basket, which is plausible.
- **(k)** Taostats excludes a subnet category — e.g., positions on registered hotkeys only, or non-root only with sn0 baseline subtraction.
- **(l)** Taostats sums at a different alpha-share quantum — e.g., uses `SubtensorModule.Alpha` storage map directly (per-subnet aggregated) rather than `StakeInfoRuntimeApi` (per-hotkey). Possible storage-layer divergence.

## Decision

**(c) HOLD on flag-flip persists.** Iter 227 cannot proceed to graduation without identifying the +16 mτ source.

Recommended iter 227 plan:
1. **Test (j) first** — fetch Taostats `/api/dtao/pool/history` for a representative subnet (e.g., sn64 — largest stakeτ contribution at +1.42 τ) for the snapshot day; sample its prices at 00:00 / 06:00 / 12:00 / 18:00 / 23:59 UTC. Compute Σ(stakeα × price) at each price snapshot vs archive Σ(stakeα × price) at the EOD block. If the 16 mτ residual closes when using an early-day price snapshot, (j) is confirmed.
2. **If (j) negative**: probe Taostats `/api/dtao/coldkey/positions` history endpoints for per-position data at the snapshot day — compare alpha quantum directly to archive `StakeInfoRuntimeApi` decode. Tests (k) + (l).
3. **Capture data, document, but don't ship code changes** until a hypothesis closes.

## Lesson candidates

- `lessons_taostats_balance_staked_smaller_than_archive.md` — Taostats `/api/account/history/v1.balance_staked` is **smaller** than archive raw-stake Σ(stakeα × price) at the same block, by ~0.1–0.2% on dTAO-era wallets. The gap is **not** pending alpha emission (overshoots 66×) and **not** sub-12s block-time skew (±5 block range is 3 orders of magnitude smaller). Likely candidates: intraday price snapshot timing, validator/delegator haircut, or position-set filtering. Use `/api/dtao/stake_balance/latest/v1` for current-block parity (RAO-exact).
- `lessons_stakeinfo_alpha_emission_unpopulated.md` — `StakeInfoRuntimeApi_get_stake_info_for_coldkey` returns per-entry `alpha_emission` field as 0 for delegator-only coldkeys in current Bittensor runtime (block ~8.3M, Jun 2026). Field is decoded but unused in valuation. `emission` field is populated and represents pending alpha emission (substantial — ~1 τ aggregate on a 12 τ stake), but Taostats `balance_staked` does **not** include it.
