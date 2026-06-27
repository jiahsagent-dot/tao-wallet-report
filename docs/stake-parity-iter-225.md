# Stake-valuation parity research — iter 225

**Date:** 2026-06-27
**Coldkey probed:** `5CTRC3sQUTnPB6snh7LFAMCcWv6caMeFVmBhd78giH21ArLn` (Jai mantat — smallest absolute drift in iter 223 sweep, lowest baseline noise wallet)
**Script:** `scripts/probe-stake-attribution.mjs`

## Goal

Iter 223 sweep + iter 224 alignment fix collapsed the +7.33h alignment-window drift on archive ↔ Taostats starting-balance comparison from ~26,000s to 1–2s on all 4 monitored coldkeys. A residual stake-leg drift of 5–48 mRAO with **mixed signs** survived. This research iter localizes the source of that residual on one wallet — verdict gates iter 226 (alignment-aware fix, deeper data, or document-asymmetry-and-flip).

## Method

1. Fetch Taostats `/api/account/history/v1` snapshot at ~30d → `firstSnapshotDate` EOD instant + `balance_staked` aggregate.
2. Derive `alignedSecondsAgo` from the Taostats EOD timestamp (iter 224 fix).
3. Fire archive `getHistoricalColdkeyBalance(coldkey, alignedSecondsAgo)` → per-subnet `byNetuid` table.
4. Cross-check at **current** block: archive `getColdkeyStakeTao` vs Taostats `/api/dtao/stake_balance/latest/v1` — validates per-subnet decode + price formula independent of historical sampling.
5. Score 6 hypotheses (a) AMM block drift / (b) rounding asymmetry / (c) sn0 convention / (d) pending unbonds / (e) stake-vs-alpha semantic split / (f) integer-division ordering against the observed data.

## Results

### Historical anchor (Jai mantat at aligned 30d)

| Metric | Value |
| --- | --- |
| Taostats firstSnapshot | 2026-05-28T23:59:48Z |
| Aligned secondsAgo | 2,571,344 (29.76 d) |
| Archive block | #8,294,725 (hash `0x75210e85…`) |
| Archive freeTao | 0.291255τ (RAO-exact match) |
| Archive reservedTao | 0.000000τ (RAO-exact match) |
| Archive stakeTao | **12.443903τ** |
| Taostats balance_staked | **12.427706τ** |
| **Drift (incl sn0)** | **+16.197 mτ (+0.13%)** |
| Drift (excl sn0) | −2,479.4 mτ |
| sn0 contribution | 2.495630τ (20.06% of stake) |

### Archive byNetuid table at the anchor (top 12 non-root by |stakeTao|)

```
sn0 (root)   stakeα= 2.495630  price=1.000000  stakeτ= 2.495630
sn64         stakeα=20.258999  price=0.070237  stakeτ= 1.422940
sn120        stakeα=20.355551  price=0.063277  stakeτ= 1.288042
sn4          stakeα=20.299009  price=0.056226  stakeτ= 1.141329
sn51         stakeα=20.687562  price=0.051405  stakeτ= 1.063453
sn44         stakeα=19.900265  price=0.043441  stakeτ= 0.864495
sn8          stakeα=20.390304  price=0.030723  stakeτ= 0.626451
sn9          stakeα=20.261129  price=0.029719  stakeτ= 0.602136
sn3          stakeα=20.331438  price=0.024932  stakeτ= 0.506896
sn56         stakeα=20.497707  price=0.020582  stakeτ= 0.421881
sn75         stakeα=20.007246  price=0.020944  stakeτ= 0.419028
sn68         stakeα=16.677622  price=0.024973  stakeτ= 0.416494
sn95         stakeα=11.028097  price=0.036413  stakeτ= 0.401567
... 4 more subnets
```

### Current-block cross-check (archive ↔ Taostats `/dtao/stake_balance/latest`)

| Metric | Value |
| --- | --- |
| Archive total stakeTao | 12.470309τ |
| Taostats total stakeTao | 12.470354τ |
| **Current drift (incl sn0)** | **−45.3 µτ (−0.00036%)** |

Per-subnet alpha-shares: **RAO-EXACT** across all 17 subnets (alphaDrift = 0 everywhere).
Per-subnet implied prices (Taostats `balance_as_tao` / `balance`) vs archive prices: drift ≤ 1 µτ/α per subnet, total stakeτ drift distributed across many subnets (top-3 share 51% of the |drift|).

## Hypothesis verdict

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| (a) | Per-subnet AMM pool block drift (archive vs Taostats sampling block) | **RULED OUT** | Current-block alphas RAO-exact and stakeτ drift only 45 µτ — block sampling parity is essentially perfect when both sides read the same head |
| (b) | Rounding asymmetry (Float64 multiply ordering, sum-then-round vs round-then-sum) | **RULED OUT as primary cause** | Same mechanism applies at current block and produces only 45 µτ — 360× smaller than the 16.2 mτ historical residual on the same wallet |
| (c) | sn0 (root) convention — archive includes 1:1, Taostats excludes | **RULED OUT** | Excluding sn0 from archive drops drift from +16 mτ to −2,479 mτ. Taostats `balance_staked` clearly INCLUDES sn0 |
| (d) | Staked-but-pending-unbond positions counted on one side only | **PLAUSIBLE — UNTESTED** | Would require enumerating `Pending` storage at the historical block; not exposed by Taostats |
| (e) | "Stake" vs "alpha holdings" semantic split — emission/locked fields treated differently | **PLAUSIBLE — UNTESTED** | StakeInfoRuntimeApi returns separate `stake` + `emission` + `alpha_emission` fields; archive composer sums only `stake`. Taostats `balance_staked` may include pending emission |
| (f) | Integer-division ordering | **RULED OUT** | Same as (b) — would be visible at current block, isn't |

### Two new hypotheses surfaced by the data

| # | Hypothesis | Verdict | Notes |
|---|---|---|---|
| (g) | Taostats daily snapshot computes at a sub-12s-different block than the archive's nearest-block lookup | **PLAUSIBLE** | Archive samples at the floor(now - secondsAgo / 12.545) block; Taostats snapshot is at "some" block within the EOD second. Sub-12s skew × live AMM pool movement could produce mτ-scale drift on active wallets |
| (h) | Taostats daily snapshot applies pending alpha emission accrued during the snapshot day to `balance_staked` while archive reads only the at-block raw shares | **PLAUSIBLE** | Would explain mixed-sign drift: positive when net emission is accruing, negative when emissions were re-staked into different subnets between archive sample and Taostats snapshot |

## Decision

**(b) AMBIGUOUS — queue iter 226 deeper data capture.** Iter 223 hypotheses (a/b/c/f) are ruled out by the current-block cross-check (essentially perfect parity proves the archive decode + price formula are correct). The residual 16.2 mτ at 30d is consistent with EITHER (d) pending-unbond drift, (e) emission-field handling, (g) sub-block sampling skew, or (h) mid-day emission accrual on the Taostats side. None of these is testable from this probe alone.

Iter 226 should:

1. **Spike archive at blockHash ± 1 / ± 5 / ± 100** around the firstSnapshot timestamp and chart `stakeTao` sensitivity — if the 16.2 mτ residual falls cleanly inside the natural variability of a 12-block window, hypothesis (g) is sufficient and we can flip the flag under a "drift bounded by block-time ± emission, expected" framing.
2. **Re-decode StakeInfo at the anchor block including `emission` + `alpha_emission` fields** (currently `decodeStakeInfo` parses them but `getColdkeyStakeAlpha` ignores them). Test if `Σ(stakeAlpha + emissionAlpha + alphaEmissionAlpha) × price` closes the residual on any wallet — if yes, hypothesis (e) confirmed and the composer can be amended to match Taostats's "balance_staked = staked + pending" semantic.
3. **Defer flag-flip to iter 227.** Either (1) or (2) should give us a clean unblocker; (1) lets us flip with documented bounds, (2) lets us flip with the parity actually closed.

## Lesson candidate

`lessons_taostats_balance_staked_decomposition.md` — Taostats `/api/account/history/v1.balance_staked` is NOT the sum of `StakeInfo.stake` per (hotkey, netuid) × pool price at the same block. It includes some combination of pending alpha emission and possibly mid-day-aggregated state. For ground-truth historical stake comparisons, use either (a) Taostats `/api/dtao/stake_balance/latest/v1` per-subnet rollup (current-block only — RAO-exact parity with archive), or (b) archive `StakeInfoRuntimeApi.get_stake_info_for_coldkey` decoded to include `stake + emission + alpha_emission` (untested as of iter 225).

## Followups (forward plan)

- **iter 226**: archive block-sensitivity spike + StakeInfo emission-field re-decode
- **iter 227**: flag-flip default-on with whichever of (g)/(e) closes the residual
- **iter 228**: replace paid Taostats `/api/account/history/v1` entirely (graduation)
- **iter 229+**: Subscan free-tier transfer-event probe for `/api/accounting/tax/v1` transfer leg (only remaining paid dependency)

## JSON capture

Full probe output captured at `/tmp/probe.stdout` (machine-readable JSON dump of per-subnet attribution + current cross-check) for iter 226 re-analysis without re-running.
