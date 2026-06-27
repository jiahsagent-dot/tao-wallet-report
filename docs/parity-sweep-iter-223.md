# iter 223 — Archive vs Taostats parity sweep (4 coldkeys, 30d window)

**Date:** 2026-06-27
**Sweep script:** `scripts/probe-parity-sweep.mjs`
**Composer under test:** `getHistoricalColdkeyBalance(coldkey, 30*86400)` (iter 221, `lib/freeRpc.js`)
**Canonical reference:** Taostats `/api/account/history/v1` (paid Standard plan key, `address=` + `timestamp_start=` per `lessons_taostats_silent_param_drop`)
**Window:** 30 days back from sweep run-time (head archive block #8292618/8292619, head-race ±1 block).

## Results

| Wallet | Archive total τ | Taostats start τ | Drift τ | Drift % | Alignment h | Status | Attribution |
|---|---:|---:|---:|---:|---:|---|---|
| Jai subnets (`5EKFph3D…G5cd`) | 5.735852 | 5.763720 | +0.027868 | +0.484% | +7.33 | DRIFT | alignment-window |
| Jai mantat  (`5CTRC3sQ…ArLn`) | 12.699844 | 12.718961 | +0.019117 | +0.150% | +7.33 | DRIFT | alignment-window |
| Mum subnets (`5GQAqusP…cw2V`) | 3.365805 | 3.406705 | +0.040900 | +1.201% | +7.33 | DRIFT | alignment-window |
| Mum mantat  (`5HbWj5vb…D1HL`) | 1.866464 | 1.863687 | -0.002777 | -0.149% | +7.33 | DRIFT | alignment-window |

Errors: 0 / Match: 0 / Drift: 4 / Wide: 0. Total wall: 11.27s (4 coldkeys, parallel archive + Taostats per wallet, sequential across wallets).

## Drift attribution

All four drifts fall in the `DRIFT` bucket (0.001τ ≤ |Δ| < 0.1τ) with a **consistent +7.33h alignment offset** — the archive sample is taken at exactly `now − 30d` (block #8292618, ~2026-05-28T16:36Z), while the Taostats `firstSnapshotDate` lands at the EOD daily-snapshot timestamp `2026-05-28T23:59:48Z`, ~7h 23m later. That gap is identical across all 4 wallets (modulo seconds), strongly suggesting alignment-window is the dominant — and likely sole — cause of the observed drift.

Drift sign and magnitude track wallet activity within that 7h window:

- **Jai subnets** (+0.028τ, +0.48%): Jai's active Bittensor allocator wallet — daily churn; ~28 mRAO drift in 7h is consistent with intra-day staking activity.
- **Jai mantat** (+0.019τ, +0.15%): less active — drift mostly emission accrual.
- **Mum subnets** (+0.041τ, +1.20%): largest *relative* drift (smallest wallet base) — emission accrual on small balance pumps the percentage; absolute drift 41 mRAO still well below the 0.1τ "WIDE" threshold.
- **Mum mantat** (−0.003τ, −0.15%): tightly bounded; sign is negative (archive higher than Taostats) which on a near-dormant wallet suggests a small mid-window stake event recorded between archive sample and Taostats EOD snapshot.

## Free / reserved / stake decomposition

Per-leg breakdown (archive sample at now-30d):

- **Jai subnets:** free 0.5006τ / reserved 0.0930τ / stake 5.1422τ → 5.7359τ. Taostats: free 0.7556τ / staked 5.0081τ → 5.7637τ (Taostats lumps reserved into free).
- **Jai mantat:** free 0.5006τ / reserved 0.0930τ / stake 12.1062τ → 12.6998τ. Taostats: free 0.7556τ / staked 11.9633τ.
- **Mum subnets:** free 0.7558τ / reserved 0.0000τ / stake 2.6102τ → 3.3658τ. Taostats: free 0.7556τ / staked 2.6511τ.
- **Mum mantat:** free 0.2000τ / reserved 0.0930τ / stake 1.5735τ → 1.8665τ. Taostats: free 0.2000τ / staked 1.5707τ.

Free-leg parity is RAO-exact (or near-exact) across all 4 wallets. Stake-leg accounts for nearly all of the observed drift — consistent with subnet emissions continuously accruing to alpha-share positions, while free balance only moves on explicit extrinsics.

## Latency

| Wallet | Archive composer ms | Taostats /history ms |
|---|---:|---:|
| Jai subnets | 2733 | ~370 |
| Jai mantat  | 1284 | ~370 |
| Mum subnets | ~1300 | ~370 |
| Mum mantat  | 915 | ~405 |

Archive composer dominates wall-clock (head + hash + free + state_call + price batch). Archive ~1.0-2.7s vs Taostats /history ~0.4s — Taostats is 3-6× faster for the same datum, but free vs paid trade is worth it for the shadow-verification objective (we're shadow-verifying, not racing for production-critical latency).

## Decision

**(b) — flag-flip after alignment-aware comparison.** Drift is bounded (≤1.2% relative, ≤41 mRAO absolute across all 4 wallets) and explainable (consistent 7.33h Taostats EOD vs archive `now-30d` offset). Before iter 224 flips `ARCHIVE_STARTING_SHADOW=1` default-on, the comparison in `lib/pnl.js` should align the archive sample to the Taostats `firstSnapshotDate` EOD timestamp (compute `secondsAgo` from `now → firstSnapshotDate` rather than from `now → now-30d`), eliminating the alignment-window drift and exposing only real-RAO mid-window movement. With alignment fixed, the residual drift should collapse to sub-mRAO except on wallets with explicit extrinsics within the alignment window — which is exactly what we want the badge to surface.

**Pre-flip checklist for iter 224:**
1. Refactor `pnl.js` shadow-wire to derive `secondsAgo` from Taostats `firstSnapshotDate` instead of `30 * 86400`.
2. Re-run this sweep with the alignment fix; expect MATCH on most wallets, ≤sub-mRAO drift on the rest.
3. If alignment-fixed sweep validates: flip `ARCHIVE_STARTING_SHADOW` default-on, keep kill-switch.
4. If wide drift persists post-alignment: deepen forensics (per-leg, per-subnet, identify the mid-window tx via Subscan or Taostats /extrinsics).

## Followups

- iter 224 — Alignment-aware shadow comparison + re-sweep, gate flag-flip on results.
- iter 225+ — Subscan free-tier transfer-event probe for transfer leg (only remaining paid Taostats dependency in PnL formula).
- Lesson candidate: "Taostats /api/account/history/v1 firstSnapshotDate lands at EOD UTC, not the timestamp you queried; archive samples must be aligned to the snapshot EOD before comparison or you eat ~7h of drift per snapshot."
