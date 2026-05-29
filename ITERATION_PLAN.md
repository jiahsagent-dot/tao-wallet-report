# Tao Wallet Report — Autonomous Improvement Loop

Driver: agent wakes every 30 min, pulls top item, ships, re-queues.

Status legend: ⏳ queued · 🔨 in-flight · ✅ done

## Done

- ✅ iter 1 — mobile sparkline overflow (fix/mobile-sparkline-overflow)
- ✅ iter 1 — app-shell: sticky tabbed section nav + "Quick open" wallet shortcuts (fix/app-shell-iter1)
- ✅ iter 2 — `/me` aggregated route: combined-total header + per-subnet aggregate table + per-wallet stacked reports (feat/me-aggregated-iter2). Did NOT merge PnL/drawdown/yield because cost-basis differs per wallet — semantic merge would mislead, so left those wallet-scoped.
- ✅ iter 3 — "report incorrect" diagnosis: lib/AUDIT.md captures field-by-field deltas (audit/numbers-iter3). Headline finding: `portfolio.totalTao` only sums alpha subnet positions and silently excludes root-staked + free TAO. Root wallet underreports by 100%, subnets wallet by ~55%. Stale `coldkey_alpha_shares` endpoint compounds the issue. Iter 140 (rootOnly→balance_total walk) is NOT on main and would only address §2 PnL, not the headline Total.

- ✅ iter 3.5 — fixed portfolio.totalTao (fix/portfolio-total-iter3.5). Headline τ now sourced from `getLatestBalance(coldkey).totalTao` (balance_total / RAO). Synthetic "Root" (netuid 0) and "Liquid" (netuid -1) rows added to §1 holdings table from `balance_staked_root` and `balance_free + balance_reserved`. emissionAlignment denominator preserved as alpha-only sum so iter-125 verdict thresholds keep their meaning. getLatestBalance call also de-duped (was fetched twice). Cosmetic: SubnetLink for synthetic rows links to broken Taostats URLs — flag for iter 3.6 polish.

- ✅ iter 3.6 — polished synthetic rows (polish/synthetic-rows-iter3.6). §1 table now branches on `pos.kind === 'root' || 'liquid'`: replaces SubnetLink with a `ROOT` (green) / `WALLET` (orange) pill badge carrying a title-tip ("Root-staked TAO — earns ~9% APR" / "Liquid wallet balance — not earning yield"), and renders `—` for netuid + α held + α price cells since those are meaningless for non-alpha rows. Cost-basis chip and APY chip already self-gate (perSubnet/perNetuidApy don't carry entries for netuid 0/-1), so no extra guards needed.

## Queue

- ⏳ iter 4 — section nav active-state polish: smooth-scroll, IntersectionObserver instead of scroll listener, restore tab on back/forward.
- ⏳ iter 5 — collapse §6 Broader market by default behind a "Show market context" disclosure (it's the same content for every coldkey; clutter on mobile).
- ⏳ iter 6 — owner-only `/me` deep link with auto-refresh every 5 min (revalidate). Pin to PWA home screen.
- ⏳ iter 7 — share card: `/report/<coldkey>/og` already exists; surface a "Copy share image" button on Report.
- ⏳ iter 8 — TAO price source consistency: confirm Taostats price is used everywhere (CoinGecko drifted 25%+ historically — see Jai's memory `feedback_tao_price_source.md`).
- ⏳ iter 9 — collapsible §1 holdings table on mobile: tap a row to expand details (apy, sparkline, flag).
- ⏳ iter 10 — settings page: edit `FEATURED_WALLETS` per browser; persisted in localStorage.

## Rules of the loop

1. Pull top ⏳ item. Implement on feature branch. Open PR? No — push branch, Vercel auto-previews, Jai verifies.
2. After successful preview, fast-forward `main` (small CSS/UI iters) OR leave on branch for Jai (anything touching data semantics).
3. Always re-queue (move to ✅) and surface next item in the wake-up reply.
4. Hard stop on "stop", "pause", or explicit redirect.
5. If a queued item is now stale or wrong, mark it ❌ with a one-line note and skip — never silently drop.
