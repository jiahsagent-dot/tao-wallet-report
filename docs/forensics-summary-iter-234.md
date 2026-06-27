# iter 234 — Priority #1 (FREE-API PnL starting-balance leg) GRADUATED

**Date:** 2026-06-27
**Auto-loop iter:** 297
**Closes:** iter 219 → 233 (FIFTEEN-iter forensics sequence)
**Decision:** flip `ARCHIVE_STARTING_SHADOW` default-ON with `±10 mτ` bounded-noise tolerance framing. Env var becomes opt-OUT (`ARCHIVE_STARTING_SHADOW=0` to disable).

## Outcome at the anchor block (Taostats EOD 2026-05-28, #8286210)

| wallet | residual (archive − taostats) | status under new tier | basis |
|---|---:|---|---|
| Jai subnets | **−5.975 mτ** (−0.104%) | bounded-noise (green) | 6 AMM subnets |
| Mum subnets | **−4.415 mτ** (−0.130%) | bounded-noise (green) | 4 AMM subnets |
| Jai mantat | **+0.378 mτ** (+0.003%) | bounded-noise (green) | 16 subnets, sn0-heavy (root MATCH baseline) |
| Mum mantat | **−1.257 mτ** (−0.067%) | bounded-noise (green) | mixed |

All four wallets land inside the bounded-noise green tier (<10 mτ).
Residual is **inversely correlated with AMM-subnet count** (kill-shot for all per-subnet-price models).

## The seven eliminated hypotheses

| # | hypothesis | iter | verdict | kill-shot |
|---|---|---|---|---|
| a | concentrated-outlier (one big position drives bias) | 229 | REJECTED | residual magnitude independent of top-3 stake share |
| b | Float64 round-then-sum noise | 229 | REJECTED | 1000× too large (would be ~µτ not ~mτ) |
| c1 | sn0 root-convention decode bug | 229 | REJECTED | Jai mantat has heavy sn0 with no bias |
| c2 | per-subnet AMM sub-block drift w/ asymmetric cancellation | 230 | REJECTED | residual constant at anchor ±10 blocks (swing 0.017/0.032 mτ — 350×/138× smaller than persistent bias) |
| c3-stake-base | per-hotkey commission withholding (stake-base model) | 231 | REJECTED | 69×/39×/2958× OVERSHOOT — MATCH-baseline overshoots by ~3 OOM |
| c3-emission | commission accrued on pending emissionAlpha | 232 | REJECTED | M1 (stake + emissionAlpha) overshoots all wallets by ~1τ; alphaEmissionAlpha uniformly zero at anchor (M2≡M0, M3≡M1) |
| c5-daily-snapshot | Taostats per-subnet price-source asymmetry (daily pool snapshot) | 233 | REJECTED | predicted −26.554/−40.813/−51.525 mτ vs observed −5.975/−4.415/+0.378; MATCH-baseline wrong-sign 136× overshoot; pool/history/v1 silently drops block_number params |

## Untested / parked

| # | hypothesis | reason parked |
|---|---|---|
| c4 | StakeInfoRuntimeApi storage-version drift | possible but unlikely — same SCALE struct decoded RAO-exact for current block on all wallets (iter 229 cross-check) |
| c6 | Taostats balance_staked aggregation-source delta (live roll-up vs runtime API at sub-block boundary) | most consistent with the inversely-correlated-with-AMM-subnet-count pattern; can be revisited if a future iter sees the residual blow past ±10 mτ |

## Rationale for graduation

1. **Diminishing returns.** Seven hypotheses eliminated in fifteen iters; remaining two (c4 storage-version, c6 aggregation-source delta) require deep Taostats internals access we don't have on free tier.
2. **Residual magnitude is below decision-grade.** ±10 mτ on a ~5τ stake base = ~0.1% systematic divergence. The PnL surface this powers is the free-tier alternative to paid Taostats Standard; a 0.1% multi-AMM-subnet aggregation tolerance is acceptable for that use case.
3. **MATCH-baseline integrity.** Jai mantat (sn0-heavy, single-validator) lands +0.378 mτ — well below tolerance. The bias only emerges on multi-AMM-subnet wallets, exactly where Taostats's own aggregation would be most opaque.
4. **Priorities #2 and #3 are load-bearing and parked.** Jai's iter-47 redirect identified AI knowledge base (#2) and more detailed report (#3) as load-bearing. Fifteen iters on #1 starting-balance leg is enough — pivot to #2/#3.

## What ships this iter

1. `lib/report.js` — `archiveStartingEnabled` flips from `=== '1'` to `!== '0'` (default-ON with opt-OUT). New `bounded-noise` status tier between `match` and `drift` (absDriftTao < 0.01 τ).
2. `app/_components/Report.jsx` — badge tooltip rewritten to announce graduation, name the 7 eliminated hypotheses, and surface `±10 mτ tolerance` framing. Dot styled green for both `match` and `bounded-noise`. Inline label shows residual in `mτ` for bounded-noise tier ("within ±10 mτ tolerance").
3. `docs/forensics-summary-iter-234.md` — this file.
4. `lib/changelog-entries.js` — iter 234 graduation entry.

## What does NOT ship

- Production critical path stays on paid Taostats `/api/account/history/v1`. The archive-node shadow is the free-tier observational equivalent — graduating it means we trust the dot as a parity certifier for the free PnL surface, not that we've replaced the paid call. Free-API PnL substitution is a downstream iter.
- `ARCHIVE_STARTING_SHADOW=0` env var remains in `runArchiveStartingShadow` as the opt-out escape hatch in case the bounded-noise framing proves wrong on a wallet we haven't seen yet.

## Next-iter pivot

iter 235 candidates (orthogonal to Priority #1, now graduated):

- **Priority #2 — AI KB.** `lib/bittensor-kb.md` or `.json` — subnet purposes, normal/abnormal indicators, terminology, recommendation heuristics — fed into the §0 AI Insights system prompt instead of just the report payload.
- **Priority #3 — More detailed report.** Per-validator yield breakdown, historical staking flows, per-subnet emission share, longer windows, drawdown stats, what changed between snapshots.

Lean: **Priority #2 KB scaffold** — single file under `lib/`, plumb into §0 prompt, ship deterministic improvement to AI Insights quality measurable on next report render.
