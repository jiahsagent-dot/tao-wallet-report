# iter 233 — (c5) Taostats per-subnet price-source asymmetry probe

**Anchor block:** #8286210 (Taostats `/api/account/history/v1.block_number` for 2026-05-28 EOD; chain timestamp 2026-05-28T23:59:48Z).

**Hypothesis (c5):** Taostats `balance_staked` at the EOD wallet snapshot is computed using a per-subnet price drawn from a DIFFERENT block than the StakeInfoRuntimeApi anchor block. With prices rising forward of #8286210 (iter 230 confirmed), a positive `Δ_subnet = taostats_price − archive_price` would scale linearly with AMM-subnet stakeα and produce the persistent negative residual on our side — AND collapse to noise on the sn0-heavy MATCH baseline.

**Method:**
- `archive_price[n] = SubnetTAO[n] / SubnetAlphaIn[n]` at block #8286210 (existing helper).
- `taostats_price[n] = pool/history/v1` snapshot closest to but ≤ #8286210 (silently drops `block_number=` per `lessons_taostats_silent_param_drop`; only `timestamp_start/end` are honoured — Taostats snapshots once/day at ~03:17 UTC; closest snapshot for our anchor is **block #8280000** (~21h before)).
- `predicted_residual_τ = Σ_n (stakeα[n] × Δ_subnet[n])` per wallet.

## Results

### Jai subnets (DRIFT, observed −5.975 mτ)

| netuid | stakeα | archive_p | taostats_p | Δprice | contrib mτ |
|---:|---:|---:|---:|---:|---:|
| 0   | 3.183  | 1.00000000 | 1.00000000 | 0          | 0      |
| 3   | 3.524  | 0.02508028 | 0.02512070 | +0.0000404 | +0.142 |
| 41  | 27.183 | 0.00591113 | 0.00605769 | +0.0001466 | +3.984 |
| 44  | 17.783 | 0.04434447 | 0.04512131 | +0.0007768 | +13.814 |
| 50  | 10.581 | 0.00699717 | 0.00704651 | +0.0000493 | +0.522 |
| 62  | 20.715 | 0.01694614 | 0.01684638 | −0.0000998 | −2.067 |
| 75  | 24.143 | 0.02145448 | 0.02187521 | +0.0004207 | +10.158 |
| **predicted (shadow)** | | | | | **−26.554** |

**Fit ratio (predicted/observed):** **4.44× OVERSHOOT.**

### Mum subnets (DRIFT, observed −4.415 mτ)

| netuid | stakeα | archive_p | taostats_p | Δprice | contrib mτ |
|---:|---:|---:|---:|---:|---:|
| 41 | 30.686 | 0.00591113 | 0.00605769 | +0.0001466 | +4.497 |
| 44 | 33.529 | 0.04434447 | 0.04512131 | +0.0007768 | +26.047 |
| 62 | 20.643 | 0.01694614 | 0.01684638 | −0.0000998 | −2.059 |
| 75 | 29.302 | 0.02145448 | 0.02187521 | +0.0004207 | +12.328 |
| **predicted (shadow)** | | | | | **−40.813** |

**Fit ratio:** **9.24× OVERSHOOT.**

### Jai mantat (MATCH baseline, observed +0.378 mτ)

| netuid count | predicted (shadow) | observed |
|---|---:|---:|
| 17 subnets (16 AMM + sn0) | **−51.525 mτ** | **+0.378 mτ** |

(Subnet table truncated for brevity — full list in probe log; top contributors sn64 +22.98, sn44 +15.45, sn68 −15.42, sn51 +12.34.)

**Fit ratio:** **−136× WRONG-SIGN OVERSHOOT.**

## Verdict — (c5-daily-snapshot) BUSTED

The MATCH-baseline kill is unambiguous:

- Jai mantat has the **MOST AMM-subnet exposure** (16 AMM subnets, ~265α total alpha-equivalent stake) of all three wallets.
- Under any per-AMM-subnet price-asymmetry model, mantat should swing the LARGEST.
- Observed mantat residual (+0.378 mτ) is the SMALLEST of the three by 10×+.
- The probe predicts −51.5 mτ on mantat (136× too large AND wrong sign).

The DRIFT-wallet 4-9× overshoot confirms: Taostats `balance_staked` at the wallet's anchor block is NOT valued using the daily pool snapshot at #8280000. The Taostats internal pricing for `balance_staked` is much closer to the same-block pool state than to a 21h-stale daily snapshot — likely they query the pool at the exact same block as the wallet snapshot.

## Hypothesis matrix update

| # | hypothesis | status | iter |
|---|---|---|---|
| (a) | concentrated outlier | ❌ REJECTED | 229 |
| (b) | Float64 round-then-sum noise | ❌ REJECTED | 229 |
| (c1) | sn0 root convention | ❌ REJECTED | 229 |
| (c2) | sub-block AMM drift | ❌ REJECTED | 230 |
| (c3-stake-base) | commission on full stake | ❌ REJECTED | 231 |
| (c3-emission) | commission on pending emission | ❌ REJECTED | 232 |
| **(c5-daily-snapshot)** | **daily pool snapshot asymmetry** | **❌ REJECTED iter 233** | |
| (c4) | StakeInfoRuntimeApi storage-version drift | ⏳ UNTESTED | |
| (c6) | balance_staked aggregation source (live vs runtime) | ⏳ NEW LEAN | |

## (c6) NEW LEAN — Taostats balance_staked aggregation source

The MATCH-baseline pattern (largest AMM exposure → smallest residual) is **inversely correlated with AMM exposure**. This rules out every per-subnet-price model and points at a **per-wallet aggregation difference**:

- Our archive read: `StakeInfoRuntimeApi.get_stake_info_for_coldkey` at the anchor block → SCALE-decoded → `Σ stakeα × archive_pool_price`.
- Taostats `balance_staked`: likely computed from a different source — possibly `stake_balance/latest/v1` rolled-up at the snapshot time (which iter 229 confirmed is RAO-exact for CURRENT block), but with intra-block-window aggregation drift, or from a different storage-pallet decode.

The inversely-correlated-with-AMM-count pattern fits a **per-hotkey iteration overhead** where Taostats either:
- Samples `stake_balance` per hotkey at slightly different sub-block boundaries during their aggregation pass (drift ~mτ per hotkey × N_hotkeys), OR
- Uses post-take-settled stake values from a different runtime API call (`get_stake_for_coldkey` vs `get_stake_info_for_coldkey`) which differ by per-validator commission-settlement timing.

## Decision

**HOLD on flag-flip persists.** `ARCHIVE_STARTING_SHADOW` stays opt-in.

After 15 iters and elimination of 7 hypotheses, the residual is bounded (all wallets <6 mτ at anchor) but its source is non-obvious. The pattern (inverse AMM-count correlation, consistent negative sign on DRIFT, near-zero on MATCH) is consistent with per-wallet aggregation noise that scales sub-linearly with stake complexity.

**iter 234 candidate paths:**

1. **(c4) probe** — fetch StakeInfo at #8286210 vs #8286210±day, decode-shape comparison.
2. **(c6) probe** — compare Taostats `/api/dtao/stake_balance/latest/v1` aggregate at recent block vs `/api/account/history/v1.balance_staked` for the same block, hunt the aggregation-source delta.
3. **Bounded-noise flag-flip** — graduate Priority #1 with badge tooltip "anchor: taostats-block-number-exact, ±10 mτ bounded multi-hotkey aggregation tolerance"; pivot to Priority #2 (AI knowledge base) and Priority #3 (more detailed report).

The bounded-noise path becomes increasingly attractive: all 3 wallets within ±6 mτ of parity is operationally good enough for a default-on shadow, and the diminishing returns on hypothesis elimination after 15 iters argues for graduation.
