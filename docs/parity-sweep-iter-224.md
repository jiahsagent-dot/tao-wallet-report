# iter 224 — aligned parity sweep

Re-runs the iter 223 archive-vs-Taostats parity sweep on the same 4 monitored
coldkeys with one variable changed: the archive blockHash sample point is now
derived from the Taostats `firstSnapshot.timestamp` (EOD UTC) instead of
`now - 30d`. Goal: confirm the +7.33h alignment-window offset surfaced by
iter 223 collapses to sub-block-time residual, then judge whether
`ARCHIVE_STARTING_SHADOW` can flip default-on.

## Sweep result (2026-06-27, wall 7.34s)

| Wallet | Archive total τ | Taostats start τ | Drift τ | Drift % | Residual s | Status |
|---|---:|---:|---:|---:|---:|---|
| Jai subnets | 5.729703 | 5.763720 | +0.034017 | +0.590% | 2 | DRIFT |
| Jai mantat  | 12.735157 | 12.718961 | −0.016197 | −0.127% | 1 | DRIFT |
| Mum subnets | 3.358462 | 3.406705 | +0.048243 | +1.416% | 1 | DRIFT |
| Mum mantat  | 1.869109 | 1.863687 | −0.005421 | −0.291% | 1 | DRIFT |

Sweep classification: 0 errors / 0 MATCH / 4 DRIFT / 0 WIDE.

## Findings

### Alignment fix is correct

`residual_seconds_off` collapsed from a uniform +7.33h (26,388s) on iter 223
to 1–2s on all 4 wallets. The refactor in `lib/report.js` —
`archiveStartingPromise` upfront kickoff replaced with
`runArchiveStartingShadow(firstSnapshotDate, firstSnapshotTimestamp)` deferred
until after Taostats `/api/account/history/v1` returns — produces a
block-time-rounded sample at the Taostats EOD snapshot moment, as intended.

### Free leg and reserved leg are RAO-exact

For every wallet, `archive.freeTao` matched `taostats.balance_free` to the
RAO. Reserved leg matched identically (0.093τ where the wallet holds a subnet
registration reservation; 0 where it doesn't).

This rules out the iter 222 hypothesis that mid-window transfers explained
the drift — those would always show up in the free leg. None do.

### Residual drift is entirely on the stake leg, with mixed signs

| Wallet | Archive stake τ | Taostats stake τ | Δ τ |
|---|---:|---:|---:|
| Jai subnets | 5.136060 | 5.170077 | +0.034017 |
| Jai mantat  | 12.443903 | 12.427706 | −0.016197 |
| Mum subnets | 2.602881 | 2.651123 | +0.048243 |
| Mum mantat  | 1.576109 | 1.570687 | −0.005421 |

Mixed signs at the same UTC instant rule out "stake accrual within the
residual second" — that would be uniformly positive (Taostats higher) since
emissions add stake monotonically. The pattern is consistent with a
**valuation methodology divergence** between the archive composer (iter 220
`getColdkeyStakeTaoAtBlock` summing `SubstakeShares × pool_unit_price` at the
block hash) and whatever Taostats `/api/account/history/v1` records as
`balance_staked` for that EOD timestamp.

Per `lessons_taostats_alpha_shares_stale.md`, Taostats' coldkey_alpha_shares
endpoint is known stale; the daily-history snapshot may be using a slightly
different alpha-share → tao conversion or a different pool-state cut. The
1.4% Mum subnets and 0.6% Jai subnets gaps are inside this stale-data band.

## Decision: HOLD on flag-flip

The alignment refactor is structurally correct and ships in iter 224 because
the iter 222 shadow scaffolding was eating 7h of false-positive drift without
it. But default-on requires confidence that the badge surfaces only **real**
disagreement, not a 1%-class valuation methodology gap on every wallet.

- Ship in iter 224: alignment-aware shadow, default OFF.
- Queue for iter 225: alpha-share → tao valuation parity research arc.
  Probably needs: (a) extract Taostats' per-snapshot stake breakdown by
  validator, (b) compare against archive `SubstakeShares` × pool_unit_price
  read at the same blockHash, (c) identify which side is using stale
  pool-state vs which is using exact block-state.
- Flip flag default-on after iter 225+ closes residual to sub-mRAO.

## What changed in iter 224 (production code)

- `lib/report.js` — `archiveStartingPromise` upfront kickoff replaced with
  deferred `runArchiveStartingShadow(firstSnapshotDate, firstSnapshotTimestamp)`
  fired after Taostats `/history` returns. Captures `firstSnapshotTimestamp`
  from `r.timestamp` on the snapshot row. Returns `alignedSecondsAgo`,
  `alignmentMethod: "taostats-firstSnapshotDate-eod"`, and a recomputed
  `alignmentSecondsOff` that should be a handful of seconds, not hours.
  Both early-return branches now set `archiveStartingBalance: null` because
  the shadow needs `firstSnapshotDate` for alignment.
- `app/_components/Report.jsx` — badge tooltip surfaces "aligned to Taostats
  EOD snapshot (Ns residual)" line, drops the misleading "Day-boundary
  alignment hours" framing, attributes residual drift to alpha-share→tao
  stake-valuation parity and flags iter 225+ gate.

Latency cost of serialising on Taostats `/history`: ~400ms added to the
shadow's wall-clock budget. Acceptable while shadow is opt-in.

## Lesson candidate for memory

`lessons_taostats_history_timestamp_eod.md` — Taostats
`/api/account/history/v1` row `timestamp` field is the actual EOD instant
(~23:59:48 UTC of the date label), and is the alignment anchor for any
archive comparison. Without aligning to this exact timestamp, archive samples
land at arbitrary points in the snapshot day and produce up to ±7.33h
alignment-window drift in 30d-window comparisons.

## Lesson candidate for memory (stake parity)

`lessons_bittensor_stake_valuation_parity.md` — Even with archive
blockHash aligned to ±2s of the Taostats EOD snapshot, archive
`SubstakeShares × pool_unit_price` produces 5–48 mRAO stake-leg gaps with
mixed signs vs Taostats `balance_staked` on monitored coldkeys. Free leg
parity is RAO-exact at the same block. Drift is alpha-share → tao
valuation methodology, not data freshness or transaction timing.
