# iter 231 — per-hotkey validator commission probe (c3 on stake-base model)

**Date:** 2026-06-27
**Status:** RESEARCH, no production code touched. (c3) on stake-base model
BUSTED on all 3 wallets. ARCHIVE_STARTING_SHADOW stays opt-in.

## Hypothesis under test

(c3) Taostats `balance_staked` may include per-validator commission ("take")
accrual on undistributed emission earmarked for the nominator at the anchor
block, while archive `StakeInfoRuntimeApi` reads the post-commission settled
`stakeα`. Residuals (archive UNDER taostats) have **consistent negative sign**
and **scale with concentration index** (16-subnet 0.4 / 6-subnet 6 / 4-subnet
4.4 mτ) — exactly what concentration on commission-charging validators
predicts.

This iter tests the **STAKE-BASE PROXY** model:
`commission_tau ≈ Σ(stakeAlpha × price × take_fraction)`
across every (hotkey, netuid) entry. If commission accrues on the full stake
base each settlement window, this should ≈ residual.

## Method

1. Anchor at Taostats `/api/account/history/v1.block_number = #8286210`
   (iter 227-228 anchor). All 3 wallets at the same block.
2. Decode `StakeInfoRuntimeApi_get_stake_info_for_coldkey` at the matching
   archive blockHash → `(hotkey, netuid, stakeAlpha, price, stakeTao)`
   entries.
3. For each unique hotkey, fetch `/api/validator/latest/v1?hotkey=<hex>` and
   extract `take` (Taostats returns as fraction 0..1).
4. Compute `Σ(stakeTao × take)` per coldkey. Compare against residual.

## Results @ anchor block #8286210

### Per-wallet summary

| wallet | residual mτ | stake-base commission mτ | ratio comm/\|res\| | verdict |
|---|---:|---:|---:|---|
| Jai subnets | **−5.975** | 414.492 | 69.4× | c3-OVERSHOOTS |
| Mum subnets | **−4.415** | 172.453 | 39.1× | c3-OVERSHOOTS |
| Jai mantat (baseline) | +0.378 | 1118.499 | 2957.6× | c3-OVERSHOOTS |

### Per-hotkey aggregate

**Jai subnets** (4 hotkeys, 9 entries, Σstakeτ = 5.164)
| hotkey | subnets | stakeτ | take | comm mτ |
|---|---:|---:|---:|---:|
| 0xbc0e6b…6b26 | 5 | 4.606 | 9.00% | 414.49 |
| 0xbefb4b…163c | 2 | 0.162 | 0.00% | 0.00 |
| 0x3a8189…912e | 1 | 0.063 | n/a | 0.00 |
| 0x3ad6d4…9e71 | 1 | 0.333 | n/a | 0.00 |

**Mum subnets** (4 hotkeys, 5 entries, Σstakeτ = 2.647)
| hotkey | subnets | stakeτ | take | comm mτ |
|---|---:|---:|---:|---:|
| 0xbc0e6b…6b26 | 2 | 1.916 | 9.00% | 172.45 |
| 0x3a8189…912e | 1 | 0.181 | n/a | 0.00 |
| 0x74c261…b216 | 1 | 0.350 | n/a | 0.00 |
| 0x3ad6d4…9e71 | 1 | 0.199 | n/a | 0.00 |

**Jai mantat baseline** (1 hotkey, 17 entries, Σstakeτ = 12.428)
| hotkey | subnets | stakeτ | take | comm mτ |
|---|---:|---:|---:|---:|
| 0x587632…e403 | 17 | 12.428 | 9.00% | 1118.50 |

## Verdict

**(c3) BUSTED on stake-base model.**

The stake-base proxy overshoots residual by 39-69× on the DRIFT wallets and
**2958× on the MATCH baseline** — if commission on the full stake base drove
the residual, Jai mantat (1118 mτ predicted) would diverge by ~1τ not by
0.378 mτ. The basis is wrong, not the hypothesis.

The right commission model is **emission accrual**, not stake base:
`commission_tau ≈ Σ(per-validator emission accrued since last distribution × take)`.
Per-block emission per validator is orders of magnitude smaller than stake
base — on dynamic subnets total emission is ~7200 alpha/day per subnet split
across N validators by stake weight, so a validator with say 1% network
stake earns ~72 alpha/day × subnet_price × 9% take ≈ 0.06 τ/day commission.
That divided across an undistributed window of N blocks gives mτ-scale
numbers, the right order of magnitude.

## Side observations

1. **Three of four DRIFT-wallet hotkeys returned `n/a` take.** `0x3a8189…912e`,
   `0x74c261…b216`, `0x3ad6d4…9e71` all returned no `take` field via
   `/api/validator/latest/v1?hotkey=…`. Either (a) endpoint returned empty
   data for those hotkeys, (b) they're not Taostats-indexed validators (e.g.
   newly registered hotkeys), or (c) silent param drop returning global data
   that happens to lack `take`. Even if they had 9% take, projected
   commission would be ~50 mτ on Jai subnets — still 8× the residual.
2. **`0xbefb4b…163c` had 0% take** (`take: "0"` in Taostats payload). Either
   a self-stake validator or a delegate-fee-waived setup. Doesn't help
   explain the residual either way.
3. **Hotkey `0xbc0e6b…6b26` is shared across Jai subnets and Mum subnets**
   (both have stake on it). Jai subnets has 5 subnets on it (4.606τ), Mum
   subnets has 2 subnets on it (1.916τ). Ratio 2.4×. Compare residual ratio
   5.975/4.415 = 1.35×. Doesn't match — if this single shared validator
   drove the bias the residuals should scale 2.4×.

## Hypothesis matrix update

| hyp | status |
|---|---|
| (a) concentrated outlier | REJECTED iter 229 |
| (b) Float64 round-then-sum noise | REJECTED iter 229 |
| (c1) sn0 root convention quirk | REJECTED iter 229 |
| (c2) AMM sub-block drift | REJECTED iter 230 |
| **(c3) commission on stake base** | **REJECTED iter 231** |
| (c3-emission) commission on emission accrual | UNTESTED |
| (c4) StakeInfoRuntimeApi storage-version drift | UNTESTED |
| (c5) Taostats balance_staked includes pending unstaked alpha in cooldown | UNTESTED |

## Decision

**HOLD on flag-flip.** `ARCHIVE_STARTING_SHADOW` stays opt-in.

**iter 232 candidates:**
- **(c3-emission)** Per-validator emission accrual probe. For each hotkey at
  #8286210, fetch (a) Taostats `/api/validator/latest/v1` for emission rate +
  take, (b) on-chain `SubtensorModule.LastUpdate` or `BlocksSinceLastStep` to
  estimate undistributed window. Compute `Σ(emission_rate × window × take)`.
  Order of magnitude check vs 5.975 / 4.415 mτ residuals.
- **(c4)** StakeInfoRuntimeApi storage-version probe — does the archive
  endpoint speak the same runtime version as the head endpoint at #8286210?
  Could be a subtle shape change between alpha-share representations.
- **(c5)** Pending-unstake / cooldown alpha probe. Taostats may include
  stake that's been requested-unstaked but is still in the n-block cooldown
  before withdrawal lands in free balance. Archive `StakeInfo` may or may
  not include those entries depending on convention.
- **Flag-flip with bounded-noise tolerance** — graduate Priority #1 with
  `±10 mτ` tolerance framing in badge tooltip + multi-subnet wallet asterisk.
  The 5-6 mτ bias on 5τ stake base = ~0.1% systematic divergence; in a
  free-tier PnL the difference is below any decision-grade threshold.

Lean: **(c3-emission)** first — same probe topology, mechanically simple,
either confirms commission family in mτ regime or rules out commission
entirely and we promote (c5) or flag-flip-with-tolerance.
