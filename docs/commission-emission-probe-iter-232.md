# iter 232 — commission-on-emission probe (c3-emission BUSTED)

**Anchor:** archive block #8286210 (Taostats `/api/account/history/v1.block_number` for 2026-05-28 EOD on Jai subnets).

**Probe approach:** test multiple emission-inclusion models against `balance_staked` purely from on-chain StakeInfoRuntimeApi. The SCALE struct already carries `emissionAlpha` (pending alpha emission) and `alphaEmissionAlpha` (separate alpha-emission field) per (hotkey, netuid) — no external API calls needed.

## Models

| ID | Formula |
|----|---|
| M0 | Σ stakeAlpha × price (current model) |
| M1 | Σ (stakeAlpha + emissionAlpha) × price |
| M2 | Σ (stakeAlpha + alphaEmissionAlpha) × price |
| M3 | Σ (stakeAlpha + emissionAlpha + alphaEmissionAlpha) × price |

## Results (mτ residual vs Taostats `balance_staked` target)

| wallet | M0 (stake) | M1 (+em) | M2 (+αem) | M3 (+both) |
|---|---:|---:|---:|---:|
| Jai subnets | **−5.975** | +1631.590 | −5.975 | +1631.590 |
| Mum subnets | **−4.415** | +1295.464 | −4.415 | +1295.464 |
| Jai mantat (MATCH baseline) | **+0.378** | +992.876 | +0.378 | +992.876 |

## On-chain pending emission magnitudes

| wallet | entries w/ pending | Σ emissionτ (mτ) | Σ alphaEmissionτ (mτ) |
|---|---:|---:|---:|
| Jai subnets | 8/9 | 1637.565 | 0.000 |
| Mum subnets | 5/5 | 1299.879 | 0.000 |
| Jai mantat | 16/17 | 992.498 | 0.000 |

The on-chain pending emission is **large (1τ-scale per wallet)** but the `alphaEmissionAlpha` field is **always zero** at this block. The non-zero pending lives entirely in `emissionAlpha`.

## Verdict

**(c3-emission) BUSTED.** Including pending `emissionAlpha` in the archive stakeτ sum **overshoots** by ~1τ on all 3 wallets — three orders of magnitude beyond the observed residuals. Taostats `balance_staked` evidently does NOT include the pending alpha emission credited to the delegator at the snap block. M0 (stake-only) remains the closest model on all 3 wallets.

The MATCH-baseline test confirms: Jai mantat's residual is +0.378 mτ under M0 (already at noise floor) and +992.876 mτ under M1 (catastrophically wrong). The same direction of error appears on the DRIFT wallets — the bias is **not** about pending emission inclusion.

## Hypothesis matrix (after iter 232)

| # | hypothesis | status |
|---|---|---|
| (a) | concentrated outlier | ❌ iter 229 |
| (b) | Float64 round-then-sum noise | ❌ iter 229 |
| (c1) | sn0 root convention quirk | ❌ iter 229 |
| (c2) | per-subnet AMM sub-block drift with asymmetric cancellation | ❌ iter 230 |
| (c3-stake-base) | validator commission on full stake base | ❌ iter 231 |
| **(c3-emission)** | **validator commission on pending emission** | **❌ iter 232** |
| (c4) | StakeInfoRuntimeApi storage-version drift | ⏳ queued |
| (c5) | Taostats per-subnet price-source asymmetry | ⏳ queued (new) |

## New hypothesis (c5) candidate — price-source asymmetry

Sub-block AMM drift in iter 230 showed residual **narrows monotonically** as we move forward in time from #8286210 (−5.990 mτ at Δ−10 → −5.973 mτ at Δ+10 for Jai subnets). The drift direction implies subnet pool prices were **rising** in that window. If Taostats values stake-alpha using a **later-block** price snapshot than #8286210 (e.g. the next tempo-boundary block, or a daily-aggregated price) while archive RPC uses the exact-block price, the same alpha quantity would be valued slightly higher on the Taostats side → archive UNDER taostats → consistent negative residuals on multi-AMM-subnet wallets.

This also fits the concentration index pattern:
- Jai mantat is heavily concentrated on sn0 (root, fixed 1τ/α — no AMM, no price drift)
- Jai subnets / Mum subnets stake lives entirely on AMM subnets where price drift accumulates

## Decision

**HOLD on flag-flip.** `ARCHIVE_STARTING_SHADOW` stays opt-in. iter 233 candidates ranked by mechanical-fix probability:

1. **(c5) price-source asymmetry probe** — fetch Taostats per-subnet price at #8286210 via `/api/dtao/subnet/latest/v1` or `/api/dtao/pool/v1` and compare against `getHistoricalSubnetPrices` at the same block. If Taostats prices differ systematically by the residual magnitude on multi-AMM-subnet wallets, (c5) CONFIRMED → mechanical fix is to use Taostats prices for the stake leg, or graduate with bounded-noise framing acknowledging the price-source split.
2. **(c4) StakeInfoRuntimeApi storage-version probe** — compare SCALE decode at #8286210 vs much-earlier block to test version drift.
3. **Bounded-noise flag-flip** — accept the ≤10 mτ noise floor with tooltip framing ("anchor: taostats-block-number-exact, ±10 mτ multi-AMM-subnet price-source tolerance") and graduate Priority #1.

**Lean:** (c5) probe first — fastest mechanical test; if confirmed, fix-or-frame; if busted, graduate via bounded-noise.

## Closes

iter 219+220+...+232 — **FOURTEEN-iter sequence on Priority #1 starting-balance leg in c3-emission-busted state.**

Production critical path unchanged — observational shadow only.
