# Tao Wallet Report — Numeric Field Audit (iter 3)

Generated 2026-05-29 against demo coldkey `5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd`.
Verification done via direct Taostats API calls compared to the values served by `/api/report`.

## TL;DR — the bug behind "the report is incorrect"

`portfolio.totalTao` is computed as the **sum of subnet (alpha) positions only**,
priced through the tao.app screener. It silently **excludes**:

1. **Root-staked TAO** (`balance_staked_root`) — significant for users who hold mostly on root.
2. **Free / unstaked TAO** (`balance_free` + `balance_reserved` + `balance_liquidity`).
3. Anything held outside the `coldkey_alpha_shares` endpoint snapshot — which itself is **~27 days stale** today (snapshot ts 2026-05-02 for a query made on 2026-05-29).

For the **Root wallet (5Cnz1juP…)** this means `totalTao ≈ 0` despite the wallet actually
holding ~6.68 τ on root. The /me iter 2 view surfaced this exactly — Root pill showed `0.00 τ`.

For the **Subnets wallet (5EKFph3D…)** at the live snapshot:

| Source | Value |
|--------|-------|
| Taostats `/api/account/history/v1?limit=1`.balance_total | **5.764 τ** ← ground truth |
| Taostats balance_staked_root (root staking) | 3.183 τ |
| Taostats balance_staked_alpha_as_tao | 1.987 τ |
| Taostats balance_free + reserved | 0.594 τ |
| Report `portfolio.totalTao` (sum of alpha positions, screener-priced) | ~2.63 τ (per Jai's earlier screenshot) |

Delta ≈ −3.13 τ understated. Root-stake is the missing 3.18 τ; the residual rounding is
the screener-vs-Taostats alpha-price drift.

## Fix candidates (queued for iter 4+)

1. **Replace `portfolio.totalTao` source with `getLatestBalance(coldkey).totalTao`** —
   `balance_total / RAO` from `/api/account/history/v1`. Already used inside `lib/report.js`
   for PnL computations (see `getLatestBalance`), so the helper exists and is trusted.
   Keep the alpha-positions table for the §1 breakdown, but cap the row sum at the
   real balance and surface "root: X τ" as its own line.
2. **Surface `balance_staked_root` as a §1 row** with netuid 0 / name "Root" /
   `alphaHeld = root staked tao` so the table is honest about the rest of the wallet.
3. **Stop relying on `coldkey_alpha_shares/latest/v1` for live holdings.** It lags by
   weeks. Switch to `stake/balance/latest/v1` or compute live positions from
   delegation history + last block. (Memory note: lessons_taostats_alpha_shares_stale.md
   already flagged this April-time-frame.)

## Iter 140 status

Branch `iter140-balance-total-walk-draft` (sha `a55f420`) is **NOT on main**. Main HEAD is
`5e562d7` (iter 131). Iter 140 switches free-PnL reconstruction from rootOnly → balance_total
in `lib/taostats.js`, which would mostly fix the §2 PnL block for root-heavy wallets but
does NOT touch `portfolio.totalTao` — that's an upstream bug in `portfolio()`. So merging
iter 140 alone won't fix the headline "Total".

## Field catalogue (§1 Portfolio)

| Field | Computed from | Spot-check method |
|-------|---------------|--------------------|
| portfolio.totalTao | sum of `position.taoValue` where `taoValue = alphaTokens × screener.alphaPriceTao` | `account/history/v1?address=&limit=1` → `balance_total / 1e9` (currently differs by root + free) |
| portfolio.totalUsd | totalTao × taoPrice | Taostats `price/latest/v1` or tao.app screener TAO price |
| portfolio.totalAud | totalUsd × usdAud | exchangerate.host USD→AUD |
| portfolio.positionCount | `holdings.length` after aggregateHoldings | count distinct netuids in `dtao/coldkey_alpha_shares/latest/v1` |
| position.taoValue | `alphaTokens × alphaPriceTao` from screener | `account/history/v1` does not break out per-subnet; use `coldkey_alpha_shares` × tao.app screener `price` per netuid and compare |
| position.pctOfPortfolio | `taoValue / totalTao × 100` | derivable once totalTao is corrected |
| position.emissionPct | tao.app screener `emission_pct` | tao.app `/v1/subnet/screener` per-netuid `emission_pct` |
| taoPrice | TAOSTATS_PRICE / TAOAPP_PRICE (see lib/taostats.js) | Taostats `/api/price/latest/v1`, target currency=USD |

## Field catalogue (§2 PnL — ground truth path)

| Field | Computed from | Spot-check method |
|-------|---------------|--------------------|
| profitTao | `currentPortfolio + transferOut − transferIn − startingBalance` | recompute manually from tax-report rows (paid) or rootOnly walk (free) |
| currentPortfolioTao | `getLatestBalance().totalTao` (balance_total ÷ RAO) | `account/history/v1?limit=1`.balance_total |
| startingBalance | first snapshot row in window | first row of paid `accounting/tax/v1` OR rootOnly walk |
| transferIn / transferOut | transfer rows from paid tax/v1 OR `transfer/v1` (free) | `/api/transfer/v1?from=&to=&address=&date_start=…` directly |
| effectiveWindowDays | window clamped to first snapshot date | inspect `tax/v1` row range |
| returnPct | `profitTao / (startingBalance + transferIn)` | derivable |

Free-PnL path additionally depends on rootOnly snapshot walk; iter 140 (queued draft)
proposes balance_total walk which would fix alpha-credit miss but changes PnL semantics
from "TAO-route in/out" to "portfolio-value delta" (see iter 140 commit message).

## Field catalogue (§3 Yield)

| Field | Computed from | Spot-check method |
|-------|---------------|--------------------|
| validator yields (1h/1d/7d/30d) | `dtao/validator/yield/latest/v1?netuid=N` | hit endpoint directly per netuid |
| weightedApy | per-position taoValue-weighted yield | derivable from above + position weights |
| 30d staking-income sparkline | daily income series from tax-report (paid) OR rootOnly delta minus transfers (free) | inspect series + verify monotonicity |

## Field catalogue (§2 drawdown — added iter 131)

| Field | Computed from | Spot-check method |
|-------|---------------|--------------------|
| maxDrawdownPct | peak-to-trough across 365d daily-balance walk | recompute from `account/history/v1` series |
| currentDrawdownPct | distance from ATH at latest snapshot | derivable from same series |
| recoveryDaysP50/P90/Max | underwater-stretch percentiles (iter 131) | segment ddSeries by sign of drawdownTao |

## Out-of-scope this audit

- AI Insights (§0) is downstream — depends on the deterministic inputs above. Fix those
  and §0 corrects itself.
- §4 Flags / §5 Recommendations are rule-based on the above values; same.

## Next iter recommendation

Iter 4 (queued) is section-nav active-state polish — UI-only. Suggest reordering: do the
**`portfolio.totalTao` fix first** (audit-iter3 → fix-iter3.5) since it's the user-visible
headline number that drove Jai's "report is incorrect" complaint. Then resume the UI
queue. Will surface this in the loop reply.
