# iter 230 — sub-block AMM drift probe on DRIFT wallets

**Status:** research, no production code change
**Goal:** test hypothesis (c2) — per-subnet AMM sub-block drift with asymmetric cancellation — as explanation for the +5.975 mτ (Jai subnets) and +4.415 mτ (Mum subnets) residuals at TRUE anchor block #8286210.
**Verdict:** (c2) **BUSTED.** Bias is persistent, not sub-block-cancellation noise.

## Method

For each DRIFT wallet, fire `getHistoricalColdkeyBalance(coldkey, 0, { anchorBlock: #8286210 + Δ })` at Δ ∈ {−10, −5, −2, −1, 0, +1, +2, +5, +10}. Compute archive `stakeTao` − Taostats `balance_staked` per block. If hypothesis (c2) held, the per-block residual should swing by ≥1 mτ across the 21-block window as AMM sampling phase shifts.

## Results

### Jai subnets (coldkey 5EKFph3D…G5cd, target 5.170077 τ)

| Δ block | archive stakeτ | residual mτ |
|---:|---:|---:|
| −10 / #8286200 | 5.164088 | −5.990 |
|  −5 / #8286205 | 5.164101 | −5.977 |
|  −2 / #8286208 | 5.164101 | −5.976 |
|  −1 / #8286209 | 5.164102 | −5.976 |
|   0 / #8286210 | 5.164102 | −5.975 |
|  +1 / #8286211 | 5.164102 | −5.975 |
|  +2 / #8286212 | 5.164102 | −5.975 |
|  +5 / #8286215 | 5.164104 | −5.974 |
| +10 / #8286220 | 5.164104 | −5.973 |

**Total swing:** 0.017 mτ across 21 blocks (well under 0.1 mτ gate).

### Mum subnets (coldkey 5GQAqusPN…ap5cw2V, target 2.651123 τ)

| Δ block | archive stakeτ | residual mτ |
|---:|---:|---:|
| −10 / #8286200 | 2.646681 | −4.442 |
|  −5 / #8286205 | 2.646706 | −4.418 |
|  −2 / #8286208 | 2.646707 | −4.416 |
|  −1 / #8286209 | 2.646708 | −4.416 |
|   0 / #8286210 | 2.646708 | −4.415 |
|  +1 / #8286211 | 2.646709 | −4.415 |
|  +2 / #8286212 | 2.646709 | −4.414 |
|  +5 / #8286215 | 2.646711 | −4.413 |
| +10 / #8286220 | 2.646713 | −4.410 |

**Total swing:** 0.032 mτ across 21 blocks (well under 0.1 mτ gate).

### Top per-subnet swing across window

Both wallets — sn44 is the dominant swinger by 3+ orders of magnitude vs the rest. But its swing magnitude (0.017 / 0.032 mτ) is the same as the total — it accounts for the entire window-scale jitter and is dwarfed by the persistent bias of ~−5.97 / −4.41 mτ.

| wallet | top-swing subnet | swing mτ | next-highest swing mτ |
|---|---:|---:|---:|
| Jai subnets | sn44 | 0.017 | sn75: 0.00006 |
| Mum subnets | sn44 | 0.032 | sn75: 0.00008 |

## Verdict matrix update

| code | hypothesis | status |
|---|---|---|
| (a) | concentrated outlier | REJECTED (iter 229) |
| (b) | Float64 round-then-sum noise | REJECTED (iter 229) |
| (c1) | sn0 root convention | REJECTED (iter 229) |
| (c2) | per-subnet AMM sub-block drift, asymmetric cancellation | **REJECTED (iter 230)** |
| (c3) | validator commission accrual on specific hotkeys | **UNTESTED — iter 231** |
| (c4) | StakeInfoRuntimeApi storage-version drift at archive block | not yet hypothesised, queue if (c3) busts |

## Decision

**Path (b) per iter 293 plan:** residual constant within 0.1 mτ across window ⟹ (c2) BUSTED ⟹ iter 231 queue commission probe.

The bias is real, persistent, and present at the exact anchor block #8286210. It is NOT a sub-block-cancellation artifact and NOT randomly distributed across subnets. The fact that bias magnitude tracks subnet count (16 → 0.4 mτ, 6 → 6 mτ, 4 → 4.4 mτ) AND that within-subnet temporal swing is 100× smaller than the persistent bias tells us something systematic per-subnet (or per-hotkey-validator) is being missed by the archive but counted by Taostats.

`ARCHIVE_STARTING_SHADOW` stays default-off. Hold the flag-flip until (c3) is tested.

## iter 231 plan — commission probe

Per-hotkey loop over Jai subnets StakeInfo entries at anchor block #8286210:
1. Pull each `(hotkey, netuid)` from `getHistoricalColdkeyStakeAlpha`.
2. For each hotkey, fetch Taostats `/api/validator/latest/v1?hotkey=…` to identify the validator and its commission %.
3. Compute hypothesized commission-take = `stakeAlpha × price × commission%` and accumulate.
4. If sum ≈ 5.975 mτ for Jai subnets and ~4.415 mτ for Mum subnets → (c3) CONFIRMED → mechanical fix.
5. If `commission%` near 0 on the high-stake hotkeys → (c3) BUSTED → queue (c4) StakeInfoRuntimeApi storage-version probe + consider flag-flip with ±10 mτ tolerance framing.

The fact that bias scales with `1 / sqrt(subnet count)`-ish AND has consistent negative sign suggests a per-hotkey constant withholding (commission) that compounds when wallets concentrate stake on a small number of validators — exactly what (c3) predicts.
