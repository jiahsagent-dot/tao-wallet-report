# Tao Wallet Report — Iteration Plan

## CURRENT DIRECTION (2026-05-29 — set by Jai)

**Stop polishing the single-scroll `/report/<coldkey>` page.**
**Build a proper multi-page SaaS app modelled on bittensor-tracker.app.**

The legacy `/report/<coldkey>` route can stay as a deep-dive surface, but the primary entry point is now an **app shell** at `/`.

### Reference UI: bittensor-tracker.app

Left sidebar nav (vertical, persistent):
- Dashboard
- All Subnets
- Subnet View
- Performance
- Portfolio
- Stakes
- **Transactions**
- Alerts
- Settings

Top bar: Selected Wallet picker · Last Updated · dark/light toggle · refresh.

### App shell requirements (v1)

1. **Left sidebar + top bar layout** — replaces the current report-as-page UX.
2. **Multi-wallet support** — wallet list stored in localStorage; Settings page lets the user add/remove/rename wallets; top-bar picker switches the active wallet across every page.
3. **Dashboard page** — high-level summary across the selected wallet (total τ, 24h/7d/30d delta, top holdings, latest transactions snippet).
4. **Transactions page** — sortable filterable table sourced from `/api/transfer/v1` + `/api/delegation/v1` (with the iter 139 move-stake augmentation already shipped), one row per on-chain event.
5. **Portfolio page** — per-position breakdown including the synthetic ROOT + Liquid rows from the recent portfolio fix.
6. **Performance page** — PnL, drawdown, yield trend from the existing report sections.
7. **Settings page** — wallets, Taostats API key (optional), theme.
8. **Dark/light theme toggle.**
9. **"Last updated" indicator + manual refresh button.**

### Constraints (still active)

- **Free Taostats API only** — Jai's "this is for other people" rule from iter 47 means no paid-plan dependency.
- **Use the iter 139 free-PnL path** for any PnL surfaces — it already catches move-stake events.
- **`getLatestBalance` returns the full bucket split** (rootStakedTao, liquidityTao, etc.) — re-use it.
- **No backend / DB.** State lives in localStorage; data is fetched on demand from `/api/report` and (new) per-feature endpoints.

### Stop-doing list

- No more iter-117-through-140-style `§0` AI-insights / verdict-tree polish on the legacy single-page report.
- No more `§2/§3/§6` polish unless it's flowing into the new app-shell pages.

### Next concrete steps (in order)

1. **Iter A1 — App shell scaffold.** New `app/(app)/layout.jsx` with persistent left nav + top bar. Legacy `/report/<coldkey>` redirects into `/wallet/<coldkey>` inside the shell.
2. **Iter A2 — Settings + multi-wallet store.** localStorage-backed wallet list with add/remove/rename, top-bar picker, default-wallet selection.
3. **Iter A3 — Dashboard page.** Summary cards reusing existing portfolio + pnl data from `/api/report`.
4. **Iter A4 — Transactions page.** New `/api/transactions?coldkey=…` endpoint that returns merged transfer/v1 + delegation/v1 (with move-stake `is_transfer:true` augmentation). Table with date/type/amount/peer columns, filter + sort.
5. **Iter A5 — Portfolio page.** Move existing §1 table into its own page.
6. **Iter A6 — Performance page.** Move §2/§3/§4 into a dedicated page.
7. **Iter A7 — Theme toggle.**
8. **Iter A8 — Onboarding flow** (first-visit modal modelled on the reference).

### Already shipped (lift onto the new shell as you go)

- iter 139 (PR `fix/move-stake-pnl-iter139`): move-stake events in free-API PnL path + portfolio.totalTao sourced from balance_total + synthetic ROOT/WALLET rows. Verified locally on Jai's Root coldkey: portfolio 0 → 6.78 τ, PnL −5.83 → +0.20 τ.
