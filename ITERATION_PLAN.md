# Tao Wallet Report — Autonomous Improvement Loop

Driver: agent wakes every 30 min, pulls top item, ships, re-queues.

Status legend: ⏳ queued · 🔨 in-flight · ✅ done

## Done

- ✅ iter 1 — mobile sparkline overflow (fix/mobile-sparkline-overflow)
- ✅ iter 1 — app-shell: sticky tabbed section nav + "Quick open" wallet shortcuts (fix/app-shell-iter1)
- ✅ iter 2 — `/me` aggregated route + per-wallet stacked reports (feat/me-aggregated-iter2). Done on a separate branch off iter 1.
- ✅ iter 3 — "report incorrect" audit (audit/numbers-iter3): identified headline `portfolio.totalTao` only sums alpha positions, silently excludes root-staked + free TAO. lib/AUDIT.md captures field-by-field deltas.
- ✅ iter 3.5 — fixed headline totalTao (fix/portfolio-total-iter3.5): sourced from `latestBalance.totalTao` (balance_total / RAO); synthetic Root + Liquid §1 rows added. Branch stays for Jai's review (data semantics).
- ✅ iter 3.6 — polished synthetic rows (polish/synthetic-rows-iter3.6): ROOT/WALLET pill badges, hidden α-held/α-price for non-alpha rows, gated cost-basis + APY chips off synthetic rows, dropped phantom netuid-0 ghost row from alpha-shares feed.
- ✅ iter 4 — SectionNav refactor (polish/sectionnav-iter4): replaced scroll listener with IntersectionObserver, added smooth-scroll on tab click via scrollIntoView, restored active tab + scroll position from URL hash on mount + hashchange (back/forward, deep links). hash written via replaceState so tab taps don't clutter history.

## Queue
- ✅ iter 5 — collapsed §6 Broader market behind a "Show market context" disclosure (polish/market-collapse-iter5). Section() now takes optional `collapsible` + `collapsibleLabel` props; renders the body inside a native `<details>` closed by default. Auto-opens when URL hash matches `#sec-N` (tab nav click, hashchange, popstate) so deep links land on visible content. CSS chevron pill matches the section-nav-tab look.
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
