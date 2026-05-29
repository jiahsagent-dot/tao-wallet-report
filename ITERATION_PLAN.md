# Tao Wallet Report — Autonomous Improvement Loop

Driver: agent wakes every 30 min, pulls top item, ships, re-queues.

Status legend: ⏳ queued · 🔨 in-flight · ✅ done

## Done

- ✅ iter 1 — mobile sparkline overflow (fix/mobile-sparkline-overflow)
- ✅ iter 1 — app-shell: sticky tabbed section nav + "Quick open" wallet shortcuts (fix/app-shell-iter1)

## Queue

- ⏳ iter 2 — `/me` aggregated route: fetch both Jai coldkeys (5Cnz1juP root + 5EKFph3D subnets), sum balances per subnet, combine PnL streams, single header showing total TAO across wallets. Lib helper `lib/aggregator.js`.
- ⏳ iter 3 — "report incorrect" diagnosis: compare live report numbers against Taostats screener + tax/v1. Capture deltas in `lib/AUDIT.md`. Top candidates: iter140 free-PnL balance-total walk (currently draft branch `iter140-balance-total-walk-draft`), stale subnet labels, dust-position filtering.
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
