# iter 229 — Jai subnets per-wallet diagnostic on +5.975 mτ holdout

## Summary

iter 228 sweep flagged three DRIFT wallets after the anchor-block fix:

| wallet | drift (taostats − archive) | subnets | top-3 stake share |
|---|---:|---:|---:|
| Jai mantat | +0.378 mτ MATCH | 16 | 30.8% |
| Jai subnets | **+5.975 mτ** DRIFT | 6 | 32.1% |
| Mum subnets | **+4.415 mτ** DRIFT | 4 | 93.1% |
| Mum mantat | −1.257 mτ DRIFT | (not probed) | — |

This iter localises the +5.975 mτ residual on Jai subnets and cross-checks with Mum subnets (similar shape — small subnet count, mτ-scale residual).

## Method

`scripts/probe-jai-subnets-iter-229.mjs` — for each wallet:

1. Pull Taostats `/api/account/history/v1` matched record at `2026-05-28T23:59:48Z` (block #8286210 — the TRUE anchor confirmed in iter 227).
2. Run `getHistoricalColdkeyBalance(coldkey, 0, { anchorBlock: 8286210 })` — archive composer at exact taostats-block-number anchor (iter 228 plumbing).
3. Surface per-subnet stakeTao breakdown from `arch.byNetuid` table.
4. Current-block cross-check via `getColdkeyStakeTao` + Taostats `/api/dtao/stake_balance/latest/v1` — validates per-subnet decoder integrity.

## Results

### Jai subnets @ block #8286210

- archive Σ stakeTao = 5.164102 τ
- taostats balance_staked = 5.170077 τ
- **residual = archive UNDER taostats by 5.975 mτ**

Per-subnet stake breakdown (6 non-root subnets + sn0):

| netuid | stakeα | price τ/α | stakeTao τ |
|---|---:|---:|---:|
| sn0 (root) | 2.495630 | 1.0 | 2.495630 |
| sn64 | 20.245 | 0.06941 | 1.405 |
| sn120 | 20.329 | 0.06295 | 1.280 |
| sn56 | 20.467 | 0.02069 | 0.424 |
| sn75 | 19.985 | 0.02145 | 0.429 |
| sn68 | 16.659 | 0.02467 | 0.411 |
| sn95 | 11.003 | 0.03568 | 0.393 |
| sn62 | 20.013 | 0.01695 | 0.339 |

Note: ~half the stake is sn0 (root, 1:1 valued). Non-root spread across 6 subnets, top-3 = 32.1% stake share (NOT concentrated).

### Mum subnets @ block #8286210 (confirmation)

- archive Σ stakeTao = 2.647 τ
- taostats balance_staked = 2.651 τ
- **residual = archive UNDER taostats by 4.415 mτ**
- 4 non-root subnets, top-3 = 93.1% stake share (CONCENTRATED on 1-2 subnets)

### Jai mantat @ block #8286210 (baseline — re-confirmed)

- residual = +0.378 mτ (sub-mRAO noise floor)
- 16 non-root subnets, top-3 = 30.8% stake share

### Current-block cross-check (all wallets)

`archive.byNetuid` vs Taostats `/api/dtao/stake_balance/latest/v1`:
- Alpha drift: **0** across all subnets (RAO-exact decoder match)
- Price drift: sub-µτ (Float64 division rounding, e.g. sn120: 5.6 × 10⁻⁸ τ/α)
- Total stake drift: 3.2 µτ (sub-mτ — current decoder is sound)

## Verdict matrix

| hypothesis | evidence | verdict |
|---|---|---|
| (a) Concentrated 1-2 outlier subnets | Jai subnets top-3 stake = 32.1% (broad), Mum subnets = 93.1% (concentrated). Both drift ~5 mτ. | **Rejected** — drift magnitude independent of concentration. |
| (b) Distributed Float64 round-then-sum noise | Per-subnet rounding budget ≈ 1 µτ × N → 6 µτ for Jai subnets. Observed: 5.975 mτ (1000× too large). | **Rejected** — wrong scale. |
| (c1) Category-specific (sn0 root vs alpha) | Jai mantat has heavy sn0 too — would show same bias if root convention diverged. | **Rejected** — sn0 not the cause. |
| (c2) Per-subnet AMM sub-block drift, asymmetric cancellation by subnet count | Drift direction **consistent across both wallets** (archive UNDER taostats). Jai mantat (16 subnets) cancels to noise; Jai subnets (6 subnets) and Mum subnets (4 subnets) accumulate to mτ. If random ±0.5 mτ per subnet, expected stdev ≈ 0.5×√N: predicts ±2 mτ on Jai mantat (obs 0.4 ✓), ±1.2 mτ on Jai subnets (obs 5.975 — **4σ outlier**), ±1 mτ on Mum subnets (obs 4.4 — **4σ outlier**). | **Partial** — consistent direction supports SYSTEMATIC bias, magnitude > random noise. |
| (c3) Validator commission accrual on specific hotkeys | Jai subnets + Mum subnets stake on validator hotkeys; Jai mantat stakes on non-validator hotkeys. Commission accrues between snapshot blocks and the StakeInfo block. | **Untested** — requires per-hotkey + commission rate probe. |

## Decision: HOLD on flag-flip, queue iter 230 deeper probe.

Per-subnet decoder is sound (current-block RAO-exact). Anchor block is exact (iter 227+228). The remaining 4-6 mτ residual on multi-subnet/multi-hotkey wallets has a SYSTEMATIC component (consistent sign) that is not pure Float64 noise.

iter 230 plan:
1. Probe sub-block AMM drift — sample archive at anchorBlock±1 and anchorBlock±2, compute per-subnet stakeTao at each. If residual swings by mτ across 5-block window, that confirms AMM-block-sampling asymmetry vs Taostats.
2. Per-hotkey + commission probe — for each (coldkey, hotkey, netuid) on Jai subnets, fetch validator commission rate + accrued commission delta. If commission accrual explains the systematic UNDER-bias, that's the root cause.
3. If neither: flip the flag with a sub-10 mτ tolerance framing + a noisy-multi-subnet-wallet asterisk in the badge tooltip.

## Files

- `scripts/probe-jai-subnets-iter-229.mjs` — diagnostic probe
- `docs/jai-subnets-residual-iter-229.md` — this file
- `lib/changelog-entries.js` — iter 229 entry

No production code touched. `ARCHIVE_STARTING_SHADOW` remains opt-in.
