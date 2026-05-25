// Single source of truth for changelog entries. Imported by:
//   - app/changelog/page.jsx (HTML render)
//   - app/changelog/feed.xml/route.js (Atom)
//   - app/changelog/feed.json/route.js (JSON Feed 1.1)
//
// Each entry: { date (YYYY-MM-DD), tag, title, body, links? }
// Newest first.

export const ENTRIES = [
  {
    date: '2026-05-25',
    tag: 'Report',
    title: 'Subnets-to-watch callout on §6 — top 7d gainers you don\'t already hold',
    body:
      '§6 Broader market has always shown the biggest 24h movers across the whole network, but it doesn\'t answer the more useful question: what\'s running that I don\'t own yet? New "🔭 Subnets to watch" callout below the §6 movers table now lists the top 3 subnets, sorted by 7-day positive price change, that are NOT already in your portfolio. Each chip is a green pill: subnet name + 7d %, linking out to taostats.io/subnets/<id>/metagraph for one-click research. Hover for live α price and 24h τ volume. Filters out illiquid subnets (< 1 τ daily volume) and dead/zero-priced rows so the recommendations are actually tradeable. Pure-JS off the screener data already loaded for §6 — zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: 'Top 24h movers chip strip on §1 — winners and losers surfaced above the portfolio table',
    body:
      'The 24h column has been in the portfolio table since day one but it\'s buried mid-row, easy to miss. New chip strip above the table now shows the top 3 24h winners (green) and top 3 losers (red) as compact pills with subnet name + %. Sorted by signed pct1d so the most-positive and most-negative positions surface first. Soft-omits when fewer than 4 positions have valid pct1d data (avoids noisy strips on fresh wallets). Hover each chip for the position\'s τ value and percent-of-portfolio context. Zero extra API cost — pct1d already comes back on every p.top10 entry.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Report',
    title: '30d rolling-σ sparkline on the §2 volatility panel — see whether risk is climbing, stable, or fading',
    body:
      'The volatility panel already tells you what your annualised σ is right now. The new sparkline tile below the four headline tiles shows the 30-day-rolling annualised σ trend — one point per day from when the trailing window first fills. Anchored to min/max of the visible series (not zero) so meaningful movement is visible — σ is always positive and the interesting question is whether today\'s vol is high or low *relative to the recent past*. Same SVG sparkline component the §2 staking-income trend uses, generalised with a min/max anchor mode. Hover for the date range + peak/low. Pure JS off the same /api/account/history/v1 daily-return series — zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Per-position cost-basis chip on the §1 portfolio table — see your avg entry price vs current α price at a glance',
    body:
      'Each row in §1 Portfolio now shows a tiny chip under the α price column: "entry X.XXXXXX +N%" (or −N% in red). The entry price is computed as (gross τ spent on this position minus τ realised from any partial sells) divided by α currently held — the cost-basis-equivalent per token still in your wallet. The percentage compares that to the live α-in-τ price. Turns abstract "+0.83 τ profit" into the more intuitive "you bought in at 0.018 τ per α, it\'s 0.022 τ now, that\'s +20% per token". Hover the chip for a verbose breakdown (net spent, α held, exact entry vs current). Soft-omits when no buy history is visible for the netuid (delegation-only positions, fresh subnets without buys, or wallets where the tax-report didn\'t see acquisitions). Pure-JS off existing pnl.perSubnet — zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Copy as CSV on the §2 drawdown panel — paste your daily balance + drawdown series straight into a spreadsheet',
    body:
      'Completes the §1 Portfolio / §2 Tax-year / §2 Drawdown / §3 Yield / §6 Broader-Market CSV-export quintet. The drawdown panel now has a header row with "Drawdown & recovery" plus a Copy as CSV button at the top-right. Output columns: Date, Balance τ, Running peak τ, Drawdown τ, Drawdown %. One row per daily snapshot from the Taostats balance-history series (typically 169 days = the past year, matching what the drawdown stats are computed from). Sorted by date ascending. Pure-JS off existing server payload — no extra API cost, no data leaves the browser. Filename: tao-wallet-report-<coldkey6>-drawdown-<yyyymmdd>.csv. Useful for charting drawdown in Excel/Sheets without re-fetching the underlying snapshots.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Staking-income daily trend sparkline on §2 — see if your yield is climbing, flat, or fading',
    body:
      'The Staking income (Nd) stat shows you the total τ earned over the window, but a single number can hide a falling-yield trend or a recent spike. New inline-SVG sparkline tile sits beside that stat, rendering one polyline per daily snapshot from the same Taostats tax-report data. Hover the chart for the date range + peak τ/day. Skips render when fewer than 7 daily observations are available (noisy single-week trends would over-emphasise outliers). Pure-JS off existing data — zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Copy as CSV on the §3 per-validator yield table — paste delegation data straight into your spreadsheet',
    body:
      'The §3 Yield per-validator breakdown now has a Copy as CSV button at the top-right, completing the §1 Portfolio / §2 Tax-year / §6 Broader-Market CSV-export trifecta with delegation data. Output columns: Netuid, Subnet, Validator, Hotkey, Alpha held, APY %, APY is fallback (true when the specific hotkey wasn\'t in the yield response and the subnet median was used as a stand-in), Subnet best APY %, Δ to best (pp), Subnet validator count. Sorted by alpha held descending. Same client-side build + clipboard write — zero data leaves the browser. Filename: tao-wallet-report-<coldkey6>-yield-<yyyymmdd>.csv.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Drawdown recovery time on §2 — how many days from the worst dip until balance climbed back to peak',
    body:
      'The drawdown panel told you "how bad" — now it also tells you "how long". New fifth tile sits beside Worst dip window: Recovery time. If the wallet has since climbed back to (or above) the dip\'s starting peak, shows "Xd to recover" in green with the recovery date underneath. If still under water at the latest snapshot, shows "Yd underwater" in red with "still below Z.ZZ τ peak". If no real drawdown was observed (wallet only grew), shows an em-dash. Computed in the same single walk over the balance series the rest of the drawdown stats use — zero extra API cost. Pairs the magnitude question (Max drawdown %) with the duration question (recovery days) to give a complete risk picture for the worst recent dip.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Copy as CSV on the AU tax-year breakdown — paste straight into your accountant\'s spreadsheet',
    body:
      'The §2 tax-year table now has a Copy as CSV button at the top-right, matching the pattern §1 Portfolio and §6 Broader Market already use. Output columns: FY, Window, Start bal (τ), End bal (τ), In (τ), Out (τ), PnL τ, Return %, A$. Current FY is tagged "(in progress)" inline so a CSV row exported mid-year is self-documenting. Same client-side build + clipboard write as the other CSV exports — zero data leaves the browser. Filename is templated as tao-wallet-report-<coldkey6>-tax-year-<yyyymmdd>.csv so multiple wallets / multiple days don\'t collide in your Downloads folder.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Volatility + return-per-risk on §2 — annualised σ, daily best/worst, positive-day rate',
    body:
      'Drawdown told you "how bad was the worst dip" — now §2 also tells you "how bumpy is the ride". New volatility panel sits between drawdown and the tax-year table with four tiles: Annualised volatility (daily σ × √365 with the daily-σ figure underneath), Return-per-risk (annualised return ÷ annualised vol — Sharpe-with-rf=0, the convention crypto reports use), Best day / Worst day (with dates), and Positive days % (fraction of daily-return observations that were green). Computed in pure JS off the same /api/account/history/v1 series the drawdown panel uses — zero extra API cost. Returns are clamped to ±200% so a single deposit/withdraw event doesn\'t blow up the stddev. Requires at least 14 daily snapshots; soft-omits cleanly on newer wallets. Reads as a real risk readout instead of a single profit-over-window number.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'AU tax-year breakdown on §2 — FY24-25 vs FY25-26 PnL split with start/end balance + transfers + A$',
    body:
      'Australian users want the same answer their accountant wants: how much TAO did this wallet earn in FY24-25, and what is the FY25-26 number tracking at right now? §2 PnL gains a tax-year breakdown table below the drawdown panel: one row per AU FY (Jul 1 → Jun 30) showing FY label, window, start balance, end balance, transfers in, transfers out, PnL in τ, return %, and PnL in A$. Same end + transfer_out − transfer_in − start formula as the headline ground-truth number, applied per FY. Start/end balances come from /api/account/history/v1 (full total including alpha staking — tax/v1\'s total_balance excludes alpha and would have under-reported). Transfers come from /api/accounting/tax/v1, one fetch per FY because the endpoint caps each request at 12 calendar months. Wallets created mid-FY treat start = 0 so initial fundings don\'t double-count against the first snapshot. Current FY is tagged "(in progress)" with a subtle row tint. buildReport shares a single sequential set of tax-report + balance-history fetches across pnlGroundTruth, drawdown, and the tax-year table so the free-tier Taostats key doesn\'t get burst-throttled to HTTP 429.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Drawdown stats on §2 — peak balance, max peak-to-trough dip, and days since all-time high',
    body:
      '§2 PnL gains a Drawdown panel sitting between the headline τ number and the alpha-position breakdown — answers the risk question a single profit number can never answer: how deep was the worst recent dip, and are you at an all-time high right now. Four tiles: Peak balance (with date), Days since peak (or "at ATH" when within 0.5%), Max drawdown (% and τ peak-to-trough), and Worst dip window (peak→trough dates with the two balance values). Computed from a single walk over the daily Taostats /api/account/history/v1 series (cached for 5min like the rest of the report). When the wallet is currently at an all-time high the panel says so explicitly with a green tint; otherwise it shows "currently X% off" the peak. New lib/taostats.js helper getBalanceHistory(coldkey, days) paginates the endpoint up to 2000 daily snapshots. Soft-omits the whole panel if fewer than 3 snapshots are available (new wallet) — the rest of §2 renders unaffected.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Per-subnet PnL attribution on §2 + delegation opportunities wired into §5 deterministic recs',
    body:
      'Two complementary deepenings of the report\'s actionable surface. (1) §2 PnL gains a Per-subnet PnL attribution mini-table — top 5 contributors and bottom 3 detractors, each showing current α value, spent, sold, and PnL τ, so the headline +X τ number now decomposes into "which positions actually drove this". Already-computed data from pnl.perSubnet — zero extra API cost. (2) §5 Recommendations now feeds on the new yieldData.delegationOpportunities first (replacing the generic "consider moving stake from worst to best subnet" line that was the only yield-aware rec before): each opportunity becomes a concrete "Re-delegate X.XX α off your current validator — best validator on this subnet would add ≈ Y.YYY τ/yr" with the specific Δ-pp and current-vs-best APYs cited. Old spread-based rec only fires as a fallback when no per-validator opportunities exist. Net: the report now shows you both what happened (PnL attribution) and what to do about it (specific re-delegation calls with τ/yr lift estimates) — both grounded in numbers already on the page.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Report',
    title: 'Per-validator yield breakdown on §3 — see exactly which validator on each subnet is paying you (and which one to re-delegate to)',
    body:
      '§3 Yield used to show four headline numbers (weighted APY, coverage, best/worst subnet) and nothing else — invisible to the user was the fact that two delegations into sn4 could be yielding 22% and 9% on different validators. Now §3 renders a full Per-validator breakdown table for every held position: subnet name, validator (named when known, short hotkey otherwise), alpha held, that specific validator\'s APY, the subnet\'s best APY, and the Δ-to-best in percentage points (green when on/near the best, accent-orange when 1-5pp behind, red when ≥5pp behind). Underneath, a Delegation opportunities callout enumerates the highest-impact re-delegation candidates with a τ/yr lift estimate sorted by impact. The headline strip also gains a "↗ Re-delegating each position to its subnet\'s best validator would lift weighted APY by +Xpp" line whenever the lift exceeds 2pp. Every number is computed from one call per held netuid against /api/dtao/validator/yield/latest/v1 — no extra wallet-side cost, just structural reuse. The AI Insights narrative also picks this up for free because the enriched yieldSection payload flows into buildUserPrompt.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'In-app Bittensor knowledge base — AI Insights now reads with real domain context',
    body:
      'Built lib/bittensor-kb.js: a structured Bittensor reference now loaded into the §0 AI Insights system prompt on every render. Includes a 30-subnet dossier (one-line purpose for each well-known netuid — sn0 Root, sn4 Targon, sn8 PTN, sn19 Vision, sn56 Gradients, sn64 Chutes, sn75 Hippius, etc.), terminology baseline (TAO, alpha, dTAO, root staking, hotkey/coldkey, emission, validator yield), yield bands by subnet maturity (root baseline 10-14%, established 12-25%, newer 30-100% with volatility caveat), interpretation guidance for each rule-based flag, and a recommendation heuristics playbook (TRIM/ADD/MIGRATE/HOLD with concrete trigger thresholds). The user prompt also injects per-position dossier lines whenever the held subnet has a KB entry, so the model reasons about WHAT each subnet does rather than just what number it printed. Net effect: the narrative now reads as someone who actually understands Bittensor rather than a generic LLM dressing up a CSV. App-only — does not affect the email digest (which uses its own deterministic template).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Infra',
    title: 'PnL data now sourced from the free Taostats tier — zero paid-key dependency',
    body:
      'The two Taostats endpoints powering the ground-truth PnL formula (/api/accounting/tax/v1 + /api/account/history/v1) are now served from a free-tier API key. Verified end-to-end against the demo coldkey: every figure matches the prior ground-truth to six decimals — current_balance 5.798525 τ, transfer_in 6.402 τ (5 events), transfer_out 0.652539 τ (10 events), starting_balance 0 τ, profit_tao +0.049064 τ, return_pct +0.7664%. No app code changed; lib/taostats.js already read the value from process.env.TAOSTATS_API_KEY — only the Vercel env value was rotated. Rate-limit budget is 60 req/min, and per-report cost is 2-3 calls, so the existing 5-min report cache + 1h AI Insights cache leave generous headroom for organic traffic growth. Removes the cost ceiling on scaling the free tier of the product.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Search autocomplete on the homepage input — pinned + recent coldkeys as typeahead',
    body:
      'The homepage coldkey input is now a typeahead. As soon as it has focus, the dropdown shows your ★ Pinned + 🕐 Recently viewed coldkeys (deduped, pinned first, cap 8) — start typing and it filters by prefix or by pinned-note substring. Arrow keys to navigate, Enter to pick and instantly load the report, Escape to dismiss. Compounds directly on iter 21 (Recently viewed chips) and iter 39 (Pinned with notes): both stored lists were previously only accessible by clicking a chip below the form; now they are discoverable from the input itself, matching the muscle memory power users built up over the last 26 iters.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Copy as CSV on §6 Broader Market — top movers + top volume in one paste',
    body:
      'The 📋 Copy as CSV button (iter 42) now also sits above the §6 Broader market table. One click produces a two-section CSV — "Top movers 24h" headed table on top, blank-row separator, "Top by volume 24h" headed table underneath — so a spreadsheet user gets both rankings in a single paste rather than juggling two clipboards. Columns: #, Subnet, Netuid, Price (TAO), 24h pct, Volume (TAO). Same CRLF line endings, same csvEscape helper, same client-only build (no data leaves the browser). Closes the "Broader Market export coming next iter" promise made in iter 42.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Share',
    title: 'One-click Share to X — tweet your wallet PnL with the new OG card unfurling',
    body:
      'New 𝕏 Share to X button in the /report header, next to ★ Pin. One click opens the X tweet composer pre-filled with "Bittensor PnL last 365d: <profit> τ (<pct>) — full report:" and the canonical /report/<coldkey> URL appended, so the iter-44 OG card (live PnL + Δ 7d + top mover + subscribe pill) unfurls inline in the timeline. Works on desktop and mobile via twitter.com/intent/tweet — no API key, no auth, no popup-blocker friction (opened in noopener/noreferrer popup). Pulls profitTao + returnPct from pnlGroundTruth on the rendered report so the tweet shows the same headline number as the page; soft-falls back to a generic "Live Bittensor wallet report:" prefix when ground-truth PnL is unavailable.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Share',
    title: 'Richer per-coldkey Open Graph image — Δ 7d, top mover, subscribe nudge on share previews',
    body:
      'Per-coldkey OG image (the social-share preview rendered when a /report/<coldkey> URL is pasted into Twitter, Discord, Slack, Reddit, iMessage) gets four new signals on top of the existing headline PnL: a 📬 Weekly email ~$3 TAO pill in the top-right (so every shared link doubles as a soft subscribe nudge), and two new colour-coded delta chips in the bottom row — Δ 7d portfolio (green/red, mirrors the on-site iter 41 strip) and Top mover 7d (subnet + 7d % move). All four soft-omit if the underlying field is missing, so bad/empty coldkeys still render a clean fallback card. Same Next.js opengraph-image route, same 5min edge cache, no extra API calls — just reshapes the existing report payload.',
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'See the actual weekly email on /about before you subscribe',
    body:
      'New "Here\'s what subscribers actually get" section on /about embeds a live render of the same renderEmail() output that goes to paid subscribers — same brand colours, same §0 AI Insights card, same PnL block with starting balance / transfers / current portfolio rows, same top-5 positions table. Built from a public demo coldkey so privacy-conscious visitors don\'t see anyone else\'s data. New /api/email-preview route returns the HTML with a 10-minute Cache-Control so the embed is fast on repeat visits. AI insights soft-fail cleanly if Pollinations is throttling — the deterministic data still renders end-to-end. Iframe sandboxes the email styling from About-page CSS.',
    links: [{ label: 'See the preview', href: '/about#email-preview' }, { label: 'Raw HTML', href: '/api/email-preview' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Copy as CSV button on the Portfolio table — paste straight into your spreadsheet',
    body:
      'A dashed-pill 📋 Copy as CSV button now sits above the §1 Portfolio table on every report. One click puts a clean CSV of your top 10 alpha positions on the clipboard — columns: #, Subnet, Netuid, Alpha held, Alpha price (TAO), Value (TAO), Pct portfolio, 24h pct, 7d pct. CRLF line endings so it pastes into Excel without the "data is in one column" trap. No data leaves your browser — the CSV is built client-side from the report payload you already have. Falls back to a hidden-textarea select + alert if the Clipboard API isn\'t available (e.g., insecure context). Scoped to the Portfolio table for now; Broader Market export coming next iter.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Δ vs last week strip on Report header — PnL delta, top mover, holding shift',
    body:
      'A new chip strip sits between the wallet meta line and the subscribe nudge on every report, surfacing 1–3 one-glance period changes: Δ 7d portfolio (price action on current positions, in τ), top mover 7d (largest mover among your top 10 positions, with subnet name as a hint), and Δ 30d portfolio. Green chips for up, red chips for down, soft-omits any chip whose underlying data is missing or rounds to zero. Pairs naturally with the weekly email cadence so returning subscribers get an instant "what changed this week" read without scrolling. Zero extra API calls — every value is computed from data already in the report payload.',
  },
  {
    date: '2026-05-24',
    tag: 'Health',
    title: 'Live status badge on /about — provider, cooldown, cache at a glance',
    body:
      'The /about page now wears a live status pulse under the header. A small green dot + one-line readout shows: live status (OK / Degraded), active AI provider (Pollinations), Pollinations cooldown remaining if a 429 window is active, in-memory cache sizes (reports / insights), and the Vercel region serving you. Fetched client-side from /api/health on mount (no polling, no flicker). Soft-fails to null if the endpoint is unreachable so the page never wears a broken badge. "raw ↗" link drops you straight into the JSON for debugging.',
    links: [{ label: 'About', href: '/about' }, { label: 'Live status JSON', href: '/api/health' }],
  },
  {
    date: '2026-05-24',
    tag: 'Retention',
    title: 'Pin a report ★ with an optional note — pinned chips sit above recents',
    body:
      'Hit ★ Pin this report on the homepage (after a build) or on any /report/<coldkey> page to bookmark it locally with an optional one-line note ("watching SN21 closely", "check after halving", etc). Pinned coldkeys render as a new 📌 Pinned row above the Recently viewed chips on every visit. Cross-tab sync via the storage event — pin in one tab, see it in another. Up to 20 pins stored in localStorage (nothing leaves your browser). Click a note to edit, × to unpin.',
  },
  {
    date: '2026-05-24',
    tag: 'Health',
    title: '/api/health endpoint — live provider chain, cooldown, and cache stats',
    body:
      'GET /api/health returns a JSON snapshot of the AI provider chain (Pollinations primary + Groq/Gemini/Anthropic fallback flags), the live Pollinations 429 cooldown for this Vercel instance (with remainingMs), report + insights cache sizes, region, and deploy id. Status is "ok" or "degraded" — degraded iff AI is kill-switched OR Pollinations is cooling down with no fallback configured. Always 200 (degraded is soft state, monitors shouldn\'t false-alarm). Linked from the /about footer as "Live status".',
    links: [{ label: 'Live status', href: '/api/health' }],
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Homepage input placeholder cycles through 5 hint variants',
    body:
      'The empty-state placeholder under the coldkey input now rotates between a sample SS58 address and four hint-style prompts ("Paste any Bittensor SS58 coldkey…", "never your hotkey", "Tap demo report below…"). Deterministic per UTC hour so server-rendered HTML and client hydration agree (no flash). Tiny polish that signals variety + nudges visitors towards the demo button.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Subnet hover cards — peek price, 24h, holding without leaving the report',
    body:
      'Hover any subnet name link in the Portfolio or Broader Market tables and a small card now floats below showing the current α price (τ), 24h change (green/red), 7d change for your positions, your holding size + % of portfolio, or 24h volume for market movers — whichever fields are available. Built from data already in the report payload so there\'s zero extra API cost. Mouse-only (skips touch devices) with an 80ms hover delay + 150ms close grace so the cursor can travel into the card without dismissing.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'Keyboard shortcut: press R to regenerate AI Insights',
    body:
      'Power-user delight on the headline feature. While the AI Insights card is on-screen, tap R (no modifier) to bypass the 1h cache and re-run the analyst pass — same code path as the ↻ Regenerate button. Deliberately NOT Cmd/Ctrl+R: that\'s sacred browser-reload territory. The shortcut is gated on viewport (IntersectionObserver) and skipped when an input is focused, so it never fires while you\'re typing. Hint chip next to the button shows the binding.',
  },
  {
    date: '2026-05-24',
    tag: 'Onboarding',
    title: 'Try a demo report — one-click entry into the tool for first-time visitors',
    body:
      'Don\'t have a Bittensor coldkey on hand? Tap "▸ Try a demo report" below the input on the homepage and we\'ll auto-fill a known-good sample wallet and build the full six-section report. Removes the biggest first-time-visitor dead-end ("where do I get a coldkey?") and shows new users exactly what they\'re getting before they hunt down their own SS58 address.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'Regenerate button + cache countdown + provider credit on AI Insights',
    body:
      'Made a trade and want the AI to re-read your portfolio? Tap ↻ Regenerate in the AI Insights card header — bypasses the 1h cache but still respects the Pollinations rate-limit cooldown so spam-clicks won\'t break anything. A live countdown next to the byline shows how long the current pass stays free in cache. New footnote credits GPT-OSS 20B Reasoning via Pollinations, making the moat (zero-key anonymous tier) legible to readers.',
  },
  {
    date: '2026-05-24',
    tag: 'Syndication',
    title: 'Atom + JSON feeds now in sitemap.xml',
    body:
      'RSS readers, dev dashboards, and search crawlers that auto-discover feeds via /sitemap.xml will now find /changelog/feed.xml and /changelog/feed.json. Bumped /changelog itself from weekly to daily change-frequency so search bots recrawl more often — matches the actual iter-per-iter ship cadence.',
    links: [
      { label: 'Sitemap', href: '/sitemap.xml' },
      { label: 'Atom feed', href: '/changelog/feed.xml' },
      { label: 'JSON feed', href: '/changelog/feed.json' },
    ],
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights short-circuits during Pollinations rate-limit windows',
    body:
      'When Pollinations returns a 429, the next 60 seconds of /api/insights requests fall through to the next provider in chain (or soft-fail) immediately instead of hammering the same upstream and amplifying the throttle. Retry-After header honoured if present. 5xx upstream errors trigger a shorter 10s cooldown. Cooldown lives per Vercel instance on globalThis, wiped on cold start.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights guarantees all 4 sections via deterministic fallback',
    body:
      'If the model still refuses a heading after the auto-retry, a conservative canonical line is spliced in for the missing slot (e.g. "No material risk flags surfaced by the analyst pass" for Risk Flags). The model\'s prose for sections it did emit is left untouched; only the gaps are filled. The four-section contract now holds 100% at the UI and email layer, even when the LLM is stubborn. Each response exposes validation.patched so downstream can show a "(structured fallback)" badge if desired.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights now validated for all 4 sections, with auto-retry on miss',
    body:
      'The four headings (Summary, What Changed, Recommendations, Risk Flags) are now treated as a contract — if the model omits any, we re-prompt once with the exact missing list and the strict instruction to include a one-line acknowledgement rather than skip the heading. Soft-fails to the partial narrative if the retry also misses, so the AI block always renders. Each /api/insights response now includes a validation field exposing requiredSections / present / missing / retried for downstream visibility.',
  },
  {
    date: '2026-05-24',
    tag: 'Press kit',
    title: 'Press kit now leads with AI Insights as the headline feature',
    body:
      'Tweet, paragraph, and long-form copy on /press now frame the tool as an "AI-generated personalised Bittensor analyst report" instead of "structured Bittensor data". New FACTS row documents the AI stack — GPT-OSS 20B Reasoning via Pollinations.ai anonymous tier, $0/report default, optional Groq/Gemini/Anthropic fallbacks. New pull-quote about AI Insights ready to paste.',
    links: [{ label: 'Press kit', href: '/press' }],
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'Weekly emails now include AI Insights narrative',
    body:
      'Paying subscribers get the §0 AI Insights card (Summary, What Changed, Recommendations, Risk Flags) at the top of every Monday email — same plain-English analyst write-up that runs on the site, delivered to your inbox. Inline-styled HTML so it renders in Gmail, Outlook, Apple Mail, plain-text fallback for raw mail clients.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights — personalised analyst narrative on top of the data',
    body:
      'Every report now opens with a §0 AI Insights card: Summary, What Changed, Recommendations, and Risk Flags written in plain English from your specific portfolio. Backed by a multi-provider LLM chain (Pollinations free tier primary, optional Groq/Gemini/Anthropic fallbacks). 1h cache per coldkey so refreshes are free.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Heatmap colour intensity on portfolio + market tables',
    body:
      'Value, % portfolio, 24h, 7d, and 24h-volume cells now carry a column-relative background tint — instantly shows who you are overweight in and which subnets are moving most, without reading numbers. Green/red for signed columns, orange for magnitude.',
  },
  {
    date: '2026-05-24',
    tag: 'Syndication',
    title: 'RSS + JSON feeds for the changelog',
    body:
      'Every shipped change now syndicates to /changelog/feed.xml (Atom) and /changelog/feed.json (JSON Feed 1.1). Newsroom tools, dev dashboards, and personal RSS readers can subscribe and surface ships automatically.',
    links: [
      { label: 'Atom feed', href: '/changelog/feed.xml' },
      { label: 'JSON feed', href: '/changelog/feed.json' },
    ],
  },
  {
    date: '2026-05-24',
    tag: 'Press kit',
    title: 'New /press page with one-click copy blocks',
    body:
      'Tweet-length, paragraph-length, and long-form descriptions ready to paste. Logo in SVG + PNG. Two dynamic OG-image previews. Facts table and pull-quotes. So anyone writing about the tool has the right artifacts in 10 seconds.',
    links: [{ label: 'Press kit', href: '/press' }],
  },
  {
    date: '2026-05-24',
    tag: 'Retention',
    title: 'Recently-viewed coldkey chips',
    body:
      'Last 5 coldkeys you looked at show as one-click chips below the input. Stored in localStorage (nothing leaves your browser). Per-chip ×, plus a clear-all button. Synced across tabs.',
  },
  {
    date: '2026-05-24',
    tag: 'SEO',
    title: 'JSON-LD structured data',
    body:
      'WebApplication schema site-wide. FAQPage + HowTo schemas on /about. Google can now render an expandable FAQ accordion inline in search results and a step-by-step rich snippet for "how to calculate bittensor PnL" queries.',
  },
  {
    date: '2026-05-24',
    tag: 'Trust',
    title: 'New /about page — methodology, data sources, FAQ',
    body:
      'Plain-English explanation of the PnL formula, where the data comes from, what the tool does and does NOT do, and why your numbers might differ slightly from your own spreadsheet.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Credibility',
    title: 'Taostats cross-links throughout the report',
    body:
      'New "verify on Taostats ↗" link in the report header. Every subnet name in the Portfolio and Broader Market tables links to its Taostats subnet page. Skeptics can fact-check the data in one click.',
  },
  {
    date: '2026-05-24',
    tag: 'Viral',
    title: 'Permalink pages with dynamic per-coldkey OG images',
    body:
      'Every report is now a shareable URL at /report/<coldkey>. Sharing it on Twitter, Telegram, Discord, etc shows a custom preview card with the actual PnL number for that wallet — colour-coded green/red.',
  },
  {
    date: '2026-05-24',
    tag: 'Social proof',
    title: 'Usage counter on the homepage',
    body:
      'Live "📊 X reports generated so far" badge below the subhead. Backed by a Supabase atomic counter — only counts unique builds, not cache hits.',
  },
  {
    date: '2026-05-24',
    tag: 'Safety',
    title: 'Per-IP rate limit on the report API',
    body:
      '5 requests per minute per IP on cache misses (cached responses are free). Stops casual abuse without blocking real users.',
  },
  {
    date: '2026-05-24',
    tag: 'Discovery',
    title: 'SEO basics: robots.txt + sitemap.xml',
    body:
      'Next.js auto-emits both from app/robots.js and app/sitemap.js. Search indexing has weeks of lead time, so we did this early — by the time we promote, Google already knows we exist.',
  },
  {
    date: '2026-05-24',
    tag: 'Performance',
    title: '5-min response cache + branded favicon',
    body:
      'Repeated requests to the same coldkey (refresh, shared links) skip the ~5s of Taostats fetches and serve from memory. Plus a proper τ favicon and Apple touch icon — no more generic globe in browser tabs and iOS home screens.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Surface the paywall — top-of-report nudge',
    body:
      'Subscription CTA was buried at the bottom of the report. Added a small accent-coloured nudge at the top ("📬 Want this every Monday? Subscribe for ~$3 TAO →") that scrolls to the form.',
  },
  {
    date: '2026-05-24',
    tag: 'Share',
    title: 'Dynamic Open Graph image',
    body:
      'Site-wide og:image and twitter:image — any link shared on Twitter, Discord, Slack, iMessage now gets a polished preview card matching the dark theme.',
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'Weekly email delivery',
    body:
      'One-time ~0.01 τ (~$3 USD) gets you 30 days of Monday-morning emails. Vercel cron triggers Gmail SMTP every Monday at 09:00 UTC. Fresh build per recipient.',
  },
  {
    date: '2026-05-24',
    tag: 'Accuracy',
    title: 'Ground-truth PnL from the Taostats tax-report',
    body:
      'The headline PnL number now uses the canonical formula — same one the Taostats tax-report CSV uses, the one tax professionals trust. Replaces the naive alpha-token-value summation which drifts 5–10% from actual on-chain balance.',
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'TAO micropayment paywall',
    body:
      'Subscribers send a unique amount of TAO (e.g. 0.0143 τ) to a single tip wallet. We poll Taostats for matching inbound transfers every 5 seconds and confirm the subscription on first match.',
  },
  {
    date: '2026-05-24',
    tag: 'Tip',
    title: 'TAO tip jar',
    body:
      'Suggested 0.01 τ (~$3 USD) tip with QR code + click-to-copy address. Any amount keeps the tool free.',
  },
  {
    date: '2026-05-24',
    tag: 'Launch',
    title: 'Initial public release',
    body:
      'Paste any Bittensor coldkey, get a six-section report: portfolio, PnL, yield, flags, recommendations, broader market. Free, instant, no signup. Built on Next.js 14 on Vercel; data from Taostats + tao.app.',
  },
];

export const TAG_TONE = {
  AI: 'tag-ai',
  Launch: 'tag-launch',
  Onboarding: 'tag-launch',
  Health: 'tag-safety',
  Paid: 'tag-paid',
  Accuracy: 'tag-accuracy',
  Trust: 'tag-trust',
  Credibility: 'tag-trust',
  Viral: 'tag-viral',
  Share: 'tag-viral',
  Retention: 'tag-viral',
  SEO: 'tag-seo',
  Discovery: 'tag-seo',
  Syndication: 'tag-seo',
  'Press kit': 'tag-seo',
  'Social proof': 'tag-seo',
  Safety: 'tag-safety',
  Performance: 'tag-safety',
  UX: 'tag-ux',
  Tip: 'tag-paid',
};

// Stable per-entry id for Atom <id> and JSON Feed `id` field. Same input ⇒
// same URN, so subscribers don't see duplicates if we re-render.
export function entryId(entry, index) {
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `tag:tao-wallet-report.vercel.app,${entry.date}:${slug}-${index}`;
}

export function entryUrl(entry, index, baseUrl) {
  // No per-entry pages yet, so deep-link with a fragment id derived from the
  // entry id. /changelog renders all entries in one document; fragments let
  // RSS readers jump to the right card.
  return `${baseUrl}/changelog#entry-${index}`;
}
