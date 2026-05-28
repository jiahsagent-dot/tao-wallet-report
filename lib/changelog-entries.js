// Single source of truth for changelog entries. Imported by:
//   - app/changelog/page.jsx (HTML render)
//   - app/changelog/feed.xml/route.js (Atom)
//   - app/changelog/feed.json/route.js (JSON Feed 1.1)
//
// Each entry: { date (YYYY-MM-DD), tag, title, body, links? }
// Newest first.

export const ENTRIES = [
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL forensic trace gains balance-delta probe: GET /api/debug/free-reconstruction-trace?coldkey=<SS58>&days=N&include_balance_delta_probe=1 now also fetches /api/account/history/v1?address=X directly (20 pages × 200, sequential 250ms-paced, bypassing the iter-125 memo + DB cache AND the lib/taostats.js retry wrapper), and for each paid_only row\'s block_number finds the snapshot pair straddling it, computes rootOnly and balance_total deltas, and emits a per-row verdict — root_delta_matches | total_delta_matches_only | no_balance_delta | delta_present_but_unmatched | pre_history_retention. Decides the iter-138 fix path: if rootOnly delta ≈ paid_only.amount_tao on the 2026-02-13 2.556τ miss, balance-delta reconstruction on history/v1 catches the event (fix is in-lib, no new endpoint); if rootOnly ≈ 0 but balance_total ≈ amount, the event lives inside balance_staked_alpha (needs PnL-semantics shift); if both ≈ 0, history/v1 doesn\'t see it at all and the next iter must add a staking-specific endpoint',
    body:
      'iter 138 verify produced a clean two-way split on the iter-137 paid_only set. The 2025-12-06 boundary drops (3.596τ across two rows) are NOT a bug — free\'s starting_balance=3.59τ matches the inflow exactly because the iter-109 fallback-oldest path uses the first snapshot\'s intra-day timestamp as effectiveStartMs and 05:58/06:00 transfers correctly fall INTO starting_balance, the iter-134 divergent-by-retention semantic. But the 2026-02-13 2.556τ miss is the REAL bug: mid-window (deep inside 173d), same counterparty 5Cnz1juP… free saw for 0.24τ a month earlier on 2026-01-16, /api/transfer/v1 returns 14 all-time rows for this coldkey and block 7534068 isn\'t among them. Strongly suggests a stake-movement event (e.g. remove_stake from a hotkey that returns 2.556τ TAO to coldkey) that paid\'s tax engine flattens into transfers_in but the bare /api/transfer/v1 endpoint excludes — transfer/v1 only surfaces balances.Transfer extrinsics, not stake-system credits. Two candidate fix paths: (1) widen free\'s reconstruction to walk balance-deltas on /api/account/history/v1 (which lib already fetches for the daily-snapshot sparkline) and net out transfers, catching anything that hits the on-chain balance regardless of which pallet emitted it; (2) add a staking-specific endpoint like /api/dtao/stake_balance_change/v1 to the reconstruction. Path (1) is the cheaper fix (no new endpoint, reuses cached data), but it only works if the 2.556τ stake credit actually shows up as a balance_free / balance_reserved / balance_staked_root delta — if the event credits balance_staked_alpha_as_tao directly (which rootOnly excludes), it would be invisible to a rootOnly-delta walk too. iter 139 ships the sub-decision endpoint to answer this BEFORE committing to a fix path: include_balance_delta_probe=1 fetches /api/account/history/v1 uncached (20 pages cap matches lib\'s walker), for each paid_only.block_number finds the latest snapshot with block_number <= target (the "before") and the earliest with block_number > target (the "after"), and reports {before_root_tao, after_root_tao, delta_root_tao, before_total_tao, after_total_tao, delta_total_tao, expected_signed_delta} plus a per-row verdict. Verdict matrix: root_delta_matches (Δrootonly within ±0.05τ of the expected signed transfer → fix path (i) viable, balance-delta on rootOnly catches it); total_delta_matches_only (Δrootonly ≈ 0 but Δtotal matches → event lives inside alpha-as-tao, needs a PnL-semantics shift not just a source widen); no_balance_delta (both deltas ≈ 0 → history/v1 doesn\'t see this event at all → must use stake_balance_change/v1 or similar); pre_history_retention (target block predates oldest history snapshot → free-tier retention bound is biting); delta_present_but_unmatched (deltas non-zero but don\'t match expected → multi-event window noise, weakens the signal). Also surfaces oldest_block + newest_block on the history walk so retention-bound failures are explicit. Plus a rollup field so the wake-script can branch on a single string instead of scanning the per-row results array. Sequential 250ms pacing matches the iter-138 transfer walker; 20-page cap (4000 rows) is enough for ~330 days of 12-rows/day history. Same FREE_PNL=1-gated preview-only auth as the rest of the debug fleet. The two debug flags compose: ?include_raw_walk=1&include_balance_delta_probe=1 returns the full forensic dump in one request. With this in place, iter 140 has a deterministic 3-way fork (in-lib delta walk on rootOnly | in-lib delta walk on balance_total with PnL-semantics shift | new staking endpoint) instead of picking blind.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL forensic trace gains raw-walk mode: GET /api/debug/free-reconstruction-trace?coldkey=<SS58>&days=N&include_raw_walk=1 now fetches /api/transfer/v1?address=X directly (5 pages × 200, sequential 250ms-paced, bypassing the iter-127 memo+DB cache AND the lib/taostats.js retry wrapper) and reports per-paid_only row whether its block_number appears in the raw API response. iter 137 verify named 3 missing inbound rows totalling 6.152τ — block 7534068 on 2026-02-13 (deep inside free\'s 173d window, same counterparty 5Cnz1juP… free DID see for 0.24τ a month earlier), plus blocks 7036937 + 7036948 on 2025-12-06 (first_snapshot_date). The page-1-only walk in iter 127 captures all ~15 transfers on this coldkey in one fetch, so neither pagination cap nor sort-order can explain the gap; iter 138 ships the diagnostic that decides between (a) /api/transfer/v1 structurally doesn\'t surface these rows (real reconstruction-source bug — fix is a new data source like /api/account/history/v1 deltas or a staking endpoint) and (b) the rows ARE in the API but our cache/classification path drops them (fix is inside lib/taostats.js)',
    body:
      'iter 137 verify ran the new forensic /api/debug/free-reconstruction-trace endpoint live against the real subnets coldkey 5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd at 180d and produced actionable data: paid_only_count=3 (in=6.152τ), free_only_count=0, gap matches the net_profit divergence exactly. The 3 missing rows: (1) 2026-02-13 2.556τ inbound from counterparty 5Cnz1juP… (block 7534068) — deep inside free\'s effective window (2025-12-06 to now); (2) 2025-12-06 0.002τ inbound from 5FWbyzWSeCP… (block 7036937) — on first_snapshot_date; (3) 2025-12-06 3.594τ inbound from 5FWbyzWSeCP… (block 7036948) — on first_snapshot_date. Two of three sit on the snapshot day itself (possibly a > vs >= filter boundary), but the 2026-02-13 2.556τ is mid-window — there\'s no boundary defence for that one. Confounding signal: free correctly surfaces 0.24τ inbound from the same 5Cnz1juP… counterparty on 2026-01-16, which rules out a counterparty filter; and the iter-127 cache walk uses limit=200 and breaks on pageRows.length<200, so a coldkey with ~15 transfers all-time captures every row in one page — pagination cap is not the cause either. Two remaining hypotheses: (a) Taostats /api/transfer/v1?address=X structurally doesn\'t surface these 3 specific transfer types (possible: stake-pallet-routed transfers, multi-recipient batched transfers, alpha-to-tao conversions that flow through Subtensor\'s staking module; paid\'s /api/accounting/tax/v1 walks the full balance-delta engine and catches all of them); (b) /api/transfer/v1 DOES return the rows but the iter-127 transfersCacheRead returned a stale/partial cached payload that\'s missing them. iter 138 attacks both: add ?include_raw_walk=1 to the trace endpoint, when set fetch /api/transfer/v1?address=X directly (5 pages × 200, sequential with 250ms inter-page pacing to avoid burst-429 on Vercel\'s shared outbound IP), bypassing the iter-127 cache AND the lib/taostats.js retry wrapper. For each block_number in paid_only, check whether it appears in the raw walk response; if YES → hypothesis (b), the bug is in our cache/filter path (fix is inside lib/taostats.js — likely repairing transfersCacheRead\'s staleness check or unwrapping a t.to/t.from shape variant the classifier misses); if NO → hypothesis (a), /api/transfer/v1 doesn\'t emit these rows at all and the fix is structural: iter 139+ needs to widen the reconstruction source to include /api/account/history/v1 balance deltas, or pull from a staking endpoint that catches the missing event types. Also surfaces sample_rows from the raw walk so the t.to/t.from/t.amount field shape is visible end-to-end (the iter-127 classifier reads t.to?.ss58 || t.to and t.from?.ss58 || t.from — if Taostats has nested those differently in some rows, we\'d see it here). Sequential walk pacing keeps the diagnostic under the burst-429 ceiling iters 121/124/127 chased; 5-page cap holds total time under ~5s for a wallet of this size; raw_walk block surfaces ok/pages_walked/total_rows/pagination_total/stop_reason for full audit trail. FREE_PNL=1-gated preview-only same as the rest of the debug fleet. With this in place, the next iter has a deterministic branch decision — fix the cache layer or widen the data source — instead of guessing.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL forensic reconstruction trace: GET /api/debug/free-reconstruction-trace?coldkey=<SS58>&days=N runs paid /api/accounting/tax/v1 AND the free reconstruction (history/v1 + transfer/v1) over the same window, extracts the transfer rows from each, and emits four arrays — paid_transfers, free_transfers, paid_only (rows in paid but not free), free_only (rows in free but not paid) — keyed by {direction, date, amount_tao} so the missing rows are explicitly named. iter 136 verify exposed a real reconstruction bug (paid sees 6.4τ transfers_in vs free\'s 0.25τ at the narrow effective window on the subnets coldkey); this endpoint produces the diff list that distinguishes endpoint-scope bug (paid surfaces stake movements that free\'s /transfer/v1 walk doesn\'t) from aggregation bug (free has the rows but filters them out)',
    body:
      'iter 136 verify confirmed retry-on-429 worked structurally (paid_at_free_window.ok=true, ms=349, no transient block) but the narrow-window comparison itself returned non-parity: at free\'s effective window (173d starting 2025-12-06 on the subnets coldkey), paid saw transfers_in=6.4τ + starting_balance=0τ; free saw transfers_in=0.25τ + starting_balance=3.59τ. Total inflow paid=6.4τ vs free=3.84τ — 2.56τ of inbound is missing from free entirely, and that gap matches the net_profit divergence exactly. This is NOT a window-mismatch artifact (the iter-134 reclassification path was built to filter those out and it correctly refused to reclassify this row); it\'s a real reconstruction bug, and the FREE_PNL=1 prod flip stays blocked until it\'s fixed. iter 137 ships the forensic diagnostic to attack it: a new route at app/api/debug/free-reconstruction-trace that runs getTaxReportRangePaid + getTaxReportRangeFree over the same {coldkey, days} window, extracts the transaction_type === transfer_in | transfer_out rows from each set, keys them by {direction, date, amount_tao} (amount rounded to 6dp to bypass float noise), and emits paid_transfers + free_transfers + paid_only + free_only arrays so the MISSING rows are explicitly named — not summarised away into aggregate totals. Two hypotheses the diff distinguishes: (a) endpoint-scope bug — paid\'s /api/accounting/tax/v1 flattens stake movements (add_stake, remove_stake, alpha→root unstake events) into transfer_in/_out rows; free\'s /api/transfer/v1 walk only sees pure account-to-account transfers and never surfaces those rows; in this case paid_only will contain the missing 6.15τ as discrete rows that have no free counterpart at all. (b) aggregation bug — free\'s /api/transfer/v1 DOES return the rows but getTaxReportRangeFree\'s classification logic (to === coldkey check after SS58 nesting unwrap, effectiveStartMs clipping) drops them on the floor; in that case the missing rows won\'t appear in free_transfers but they should be visible in the raw all-time transfer list (a future iter can compare against getTransferRowsCached directly if needed). The diff is multiset-style (greedy match by key, duplicates not collapsed) so two 0.5τ inbound transfers on the same day are properly accounted for. Each side capped at ROW_CAP=50 after DESC date sort to keep payload sane; truncated.{...} flags surface when caps fired. Summary block reports per-side total counts + transfers_in_tao + transfers_out_tao + per-direction paid_only/free_only sums so the magnitude of the missing inflow is reported in one number alongside the row dump. Same FREE_PNL=1-gated preview-only auth as the iter-132/133/134/135/136 debug endpoints. With this in place, the next iter can name which transfer rows are missing AND their original type (raw block preserved on each row), pointing iter 138 at the exact fix — either widen free\'s transfer source to include the missing event type, or repair the aggregation filter that\'s dropping them.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL parity sweep gains retry-on-429 for the iter-134 paid_at_free_window re-probe: when the divergent-by-retention reclassification path fires a SECOND paid /api/accounting/tax/v1 walk at the narrow effective window, a single transient 429 from Taostats was leaving the row stuck on `divergent` despite the reclassification logic being structurally correct. Live verify against the real subnets coldkey at 180d returned exactly that failure mode (paid_at_free_window.ok=false, error="429: Rate Limited"). iter 136 wraps the narrow-window paid walk in retryOn429() — one retry after a 5s backoff, only on 429/Rate Limited messages — so a single rate-limit blip doesn\'t mask the reclassification signal the FREE_PNL=1 flip decision depends on',
    body:
      'iter 134 added the divergent-by-retention verdict tier so the FREE_PNL=1 flip decision wouldn\'t block on what is structurally a window-mismatch labeling artifact. The mechanism: when the iter-109 fallback-oldest path fires on the free leg AND the at-requested-window comparison shows divergence, the sweep re-runs paid at free\'s effective window (windowStart = first_snapshot_date) and tests like-for-like; narrow-window parity reclassifies the row from `divergent` to `divergent-by-retention`. Live verify of iter 134 against the real subnets coldkey 5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd at 180d returned the right shape (paid_at_free_window block attached, all five reconstruction fields populated correctly) but the re-probe got 429d by Taostats — body: `{"status_code":429,"message":"Rate Limited. Try Again Later."}`. The catch block correctly captured ok:false + error, but the verdict stayed `divergent` instead of flipping to `divergent-by-retention`. Root cause: the narrow-window paid walk is the SECOND /api/accounting/tax/v1 call in a single request (the first being the at-requested-window paid walk ~1-2s earlier), so it\'s the most 429-prone call in the whole sweep — paid /api/accounting/tax/v1 is the lowest-quota endpoint on the Standard plan and the iter-125/127/128 caches don\'t cover the paid path (they\'re only for the free reconstruction endpoints). iter 136 wraps the narrow-window paid walk in a retryOn429() helper: one try, catch error, regex-match against /429|Rate Limited/i, if it matches sleep 5s and retry once, else rethrow immediately. Only retries the deterministic recoverable case — other paid-tax errors (network, server 500, malformed coldkey) bubble unchanged so we don\'t mask real bugs by retrying them. 5s backoff picked from the Standard plan\'s nominal rate-limit window; gives meaningful breathing room without bloating sweep latency for the no-429 happy path. Wrapping ONLY the paid_at_free_window call, not the initial at-requested-window paid walk — the initial walk hitting 429 surfaces as `incomplete` verdict at the top level, which is the right signal (rerun the whole sweep when Taostats cools off); but a 429 on the SECOND walk after the FIRST one succeeded is a deterministic transient that\'s worth a single retry to keep the reclassification signal flowing. With this in place, the iter-134 reclassification path actually fires under realistic Taostats load, not just on the happy-path 0-429 sweep where the whole derisk is moot anyway.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL Taostats endpoint health probe: GET /api/debug/free-tier-health?coldkey=<SS58> directly hits the three endpoints the free-PnL reconstruction depends on (history/v1, transfer/v1, accounting/tax/v1) with limit=1 — BYPASSING the lib/taostats.js retry+throw wrapper AND the iter-125/127/128 caches — and surfaces per-endpoint {http_status, body_bytes, parsed_row_count, pagination_total, ms, sample_row} plus a one-glance triage tag (ok_with_rows | ok_empty | rate_limited | client_error | server_error | transport_error). The diagnostic was missing: iter 134 verify dead-ended at "getLatestBalance returned null totalTao" and every inner debug endpoint reported "row_count: 0, last_source: fetch-empty", which collapses four very different failure modes (HTTP 200 + empty data[], 4xx, 429, transport error) onto one indistinguishable signal',
    body:
      'iter 134 verify hit `getLatestBalance returned null totalTao` and the iter-130 free-pnl debug endpoint reported `tax_report_free.total_rows: 0, balance_history_30d.row_count: 0, delegation_history.row_count: 0`, all three caches `last_source: "fetch-empty"`. The cache-layer signal was structurally lossy: every variant — Taostats returns 200 + empty data[], Taostats returns 400 "Invalid SS58: bad checksum", Taostats returns 429, transport error — maps to the same `row_count: 0 / fetch-empty` indicator in the iter-125/127/128 cached fetchers, because page-1 failures intentionally return [] without persisting (iter 122) to avoid poisoning the cache on transient 429s. That decision is correct for the warmer path but it cost us the ability to diagnose iter-134 verify from log signal alone. Retrospective inspection: iter 134 verify URL contained `5EKFph3DC83cqLrYAStuFFKQ7HmpgcSdsfHHrx9oXuYCMQHV` which is NOT a valid SS58 (Taostats returns 400 "Invalid SS58: bad checksum"); the real subnets coldkey is `5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd`. So the entire iter-134 divergent-by-retention path remains structurally untested live — the malformed address short-circuited at getLatestBalance before any reconstruction code ran. iter 135 ships the diagnostic that would have surfaced this in one curl: a dedicated route at app/api/debug/free-tier-health that takes one ?coldkey= and runs three sequential raw fetches against the Taostats free-tier endpoints, returning the raw HTTP status + body byte count + parsed data[] length + pagination total + ms latency per endpoint. SS58 shape is validated up front (/^5[a-km-zA-HJ-NP-Z1-9]{47}$/) so a malformed address returns 400 + a hint instead of three identical "ok_empty" probes. Sequential not parallel — Vercel\'s shared outbound IP plus burst-429 on free-tier means even a 3-call probe can rate-limit if fired concurrently. No retries: this endpoint surfaces the FIRST response verbatim, the entire point being to distinguish "rate-limited (retryable)" from "really empty (not retryable, real signal)". An env_probe block reports whether TAOSTATS_API_KEY is set and whether FREE_PNL_WARM_COLDKEYS has any entries — also relevant data, since iter 135 separately confirmed that FREE_PNL_WARM_COLDKEYS is unset on the Vercel preview env (the warmer endpoint cannot warm anything until that env var is populated; the sweep endpoint cannot run without an explicit ?coldkey=). FREE_PNL=1-gated preview-only same as the other debug endpoints, so it 404s in prod. With this landed, every future "why is free-PnL returning empty?" question reduces to one URL: hit the endpoint with the suspect coldkey and read the triage tag.',
  },
  {
    date: '2026-05-28',
    tag: 'infra',
    title: 'Free-PnL parity sweep gains a divergent-by-retention verdict: when the iter-109 fallback-oldest snapshot path fires on the free leg AND the at-requested-window comparison shows divergence, the sweep now re-runs the paid leg at free\'s effective window (windowStart = first_snapshot_date) and tests like-for-like. If THAT comparison shows parity, the divergence at the requested window is a window-mismatch artifact (free is honestly computing PnL-since-snapshot, paid is computing PnL-over-requested-window) and not a math bug — the row reclassifies as divergent-by-retention. Closes the iter-133 analytical confusion that blocked the FREE_PNL=1 prod flip on what is effectively a labeling issue, not a reconstruction bug',
    body:
      'iter 133 surfaced a 2.556τ net_profit divergence at the 180d window on the subnets coldkey — the headline blocker on the FREE_PNL=1 prod flip. On inspection the divergence has a fully mechanical cause: free-tier history/v1 retains ~168d for that coldkey, so the iter-109 fallback-oldest path kicks in and uses the oldest available snapshot (2025-12-05) as the starting state. A 6.4τ inbound transfer that landed ~175 days ago — pre-snapshot — is therefore absorbed into the starting balance instead of counted as an in-window transfer_in. The paid leg, with no retention ceiling, walks the full 180d and correctly attributes the 6.4τ as transfers_in with starting_balance ≈ 0. The two numbers are doing different things: free is reporting "PnL since 2025-12-08" and paid is reporting "PnL over 180d", and the iter-110-112 effectiveWindowDays + windowIsShortened plumbing already surfaces this honestly in the §2 headline ("data covers 168d since YYYY-MM-DD"). The numbers are internally consistent FOR THEIR RESPECTIVE WINDOWS; the iter-133 sweep just compared them at the same requested window without accounting for free\'s shorter effective window. iter 134 fixes the sweep to test like-for-like: when fallback-oldest fired AND the at-requested-window comparison is divergent, run a SECOND paid call at free\'s effective window (windowStart parsed from first_snapshot_date), aggregate via the same row-walk, and emit a paid_at_free_window block alongside the original diff. If the narrow-window comparison shows parity across all five fields, the row reclassifies from `divergent` to `divergent-by-retention` — a new verdict tier whose meaning is "free\'s math is honest for the window it can see; the divergence at the wider requested window is a window-mismatch artifact". rollup() orders verdicts as incomplete > divergent > divergent-by-retention > parity, so a sweep that contains only parity + divergent-by-retention rolls up to divergent-by-retention (not divergent) — which is the signal the FREE_PNL=1 flip decision actually needs. Sequential design preserved (one extra paid walk per fallback-oldest-divergent row, ~5-15s each); paid_at_free_window only fires on the path that surfaced the issue (most rows skip it entirely). Same FREE_PNL=1-gated preview-only auth as iter 133. With this in place, the load-bearing question for FREE_PNL=1 — "does free produce correct numbers for the window it CAN see?" — gets a deterministic yes/no instead of being entangled with retention behaviour.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL parity sweep: GET /api/debug/free-vs-paid-sweep runs the iter-132 single-point probe across a window grid {30, 90, 180, 365} days × all coldkeys in FREE_PNL_WARM_COLDKEYS (or one explicit ?coldkey), returning the full per-window per-coldkey {paid, free, diff, verdict} matrix plus a top-level worst_verdict so the FREE_PNL=1 prod flip decision has full-matrix derisk, not point-estimate derisk. The 365d window is the one users actually hit; iter 132 only sampled 30d',
    body:
      'iter 132 verified parity at one (coldkey=mantat, days=30) point — verdict: parity, diff: 0.0 on all 5 fields. Encouraging, but a point estimate. The iter-109 finding (free-tier history/v1 only retains ~170d) means parity behaviour at 30d can\'t structurally predict behaviour at 365d: only the long-window path triggers the fallback-oldest snapshot branch, which uses a fundamentally different starting_balance reconstruction (oldest available row vs the requested start). Conversely, only the short-window path tests the in-retention branch under normal load. The app default is 365d, FY24/FY25 windows are also user-visible, and the 30d sample tells us nothing about the windows that ship to production. iter 133 wraps the iter-132 logic in a sweep: a new route at app/api/debug/free-vs-paid-sweep accepts an optional ?coldkey= (falls back to every SS58 in FREE_PNL_WARM_COLDKEYS) and an optional ?days=30,90,180,365 (defaults to that grid), then loops sequentially across the cross-product calling getTaxReportRangePaid + getTaxReportRangeFree, aggregating each via the inlined pnlGroundTruth row-walk, and emitting a {paid, free, diff, verdict} row per (coldkey, days) cell. Per-coldkey worst_verdict rolls up the row verdicts (incomplete > divergent > parity); top-level worst_verdict rolls up the per-coldkey verdicts. Sequential across BOTH coldkey and window axes — the burst-429 vector iters 121/124/127 chased means even paid/free in parallel within one request can rate-limit on Vercel\'s shared outbound IP; 3 coldkeys × 4 windows × 2 paths = 24 sequential Taostats walks, but with the iter-125/127/128 caches in place each warmed coldkey amortises to 2 cache hits per (window, path). FREE_PNL=1-gated preview-only same as the iter-132 probe and iter-123 diagnostic, 404s in prod. maxDuration=300 because the worst-case cold sweep can run 60-90s before caches warm. The deliverable: a single URL that returns "worst_verdict: parity" iff every (coldkey, window) cell agrees with paid to within 0.001τ — the FREE_PNL=1 prod flip decision becomes one curl + one grep, no need to invoke the iter-132 probe N times by hand.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL numeric parity probe: GET /api/debug/free-vs-paid?coldkey=…&days=N runs paid /api/accounting/tax/v1 AND the free-tier rootOnly reconstruction (history/v1 + transfer/v1) in the same request and returns per-field {paid, free, diff, within_tolerance} for current_balance, starting_balance, transfers_in, transfers_out, net_profit, plus a top-level verdict (parity | divergent | incomplete). Closes the validation gap that nothing has live-diffed paid vs free since iter 106 — every iter since has added retention/cache/warmer plumbing assuming parity still holds',
    body:
      'iter 106 shipped getTaxReportRangeFree() with a one-shot throwaway test script that diffed paid vs free over a 30d window for all three of Jai\'s coldkeys and reported Δ=0.000000τ across every field (mantat, root, subnets). That script was deleted before commit and the codebase has never re-validated numeric parity since. Iters 109-131 in the free-pnl-preview-verify branch added meaningful structural changes downstream of that probe: iter 109 introduced the fallback-oldest snapshot path for young coldkeys (changed starting_balance reconstruction semantics), iter 110-112 added effectiveWindowDays + closing snapshot + sparkline backfill, iter 125/127/128 wrapped all three Taostats endpoints in memo+DB caching (introduced page-1-failed fetch-empty path), iter 130 added the warmer, iter 131 added db_state self-validation. Any of those could have silently introduced a parity skew — fallback-oldest changing starting_balance, the closing snapshot changing snapshot_count, a cache TTL boundary returning stale rows mid-window. The iter 132 endpoint extracts the paid branch of getTaxReportRange() into its own exported getTaxReportRangePaid() helper (one-line dispatch refactor — getTaxReportRange still env-dispatches as before, behaviour identical), then a new route at app/api/debug/free-vs-paid issues both calls sequentially against the SAME coldkey + window + shared getLatestBalance() result, aggregates each row set through an inlined version of pnlGroundTruth\'s row-walk loop (so any aggregation skew shows up in the diff, not in the helper), and emits a per-field diff payload with a tolerance flag at ±0.001τ. The endpoint is FREE_PNL=1-gated like /api/debug/free-pnl so it\'s preview-only (preview URLs are not indexed; the response carries no PII beyond what /api/report already exposes publicly). With this landed the FREE_PNL=1 prod flip decision becomes deterministic: hit the URL for each coldkey at the prod 365d window, confirm verdict: "parity" and within_tolerance: true for all five fields, then flip. If verdict is "divergent" the diff payload names which field skewed and by how much — pinpoints the regression instead of leaving it to guesswork. Sequential paid+free calls (~5-15s each) avoid burst-429 on Vercel\'s shared outbound IP; one shared getLatestBalance() so current_balance is identical by construction (parity test focuses on reconstruction divergence, not balance fetch race).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL cache warmer is now self-validating: after each warm, /api/admin/warm-free-pnl-cache reads the cache row back from Supabase directly and reports db_state.{history,transfers,delegation}.{present,row_count,age_ms,fresh} per coldkey — closes the gap iter 125 flagged where DB read-path was theoretical (same write path tested both writes and reads). Cron now has a deterministic "is the cache truly populated" signal to assert on before FREE_PNL=1 prod flip',
    body:
      'iter 130 shipped the warmer endpoint with a cache_state block that reported _getHistoryRowsLastSource / _getTransferRowsLastSource / _getDelegationRowsLastSource — the in-process memo cursor for the LAST call. Useful, but a proxy: cache_state=fetch only means the wrapper function walked Taostats and called the *CacheWrite helper, which "claimed" to write. Iter 125\'s end-of-fire note explicitly flagged this — "DB read path covered structurally" — but the only actual evidence was an out-of-band SQL probe via mcp__claude_ai_Supabase__execute_sql at iter-125 ship time, never since. iter 131 turns the warmer endpoint into its own integration test: after each coldkey\'s warm tasks complete, probeDbState fans out three parallel reads against tao_taostats_history_cache / _transfers_cache / _delegation_cache via the existing historyCacheRead / transfersCacheRead / delegationCacheRead helpers (with maxAgeMs pinned at 1 year so any present row counts), and reports {present, row_count, age_ms, fresh, fetched_at} per endpoint. fresh = age_ms <= 15min TTL, so a freshly-warmed cache shows present=true & fresh=true; a cache the warmer FAILED to write (e.g. Supabase RPC degradation) shows present=false even though cache_state.last_source would still read fetch. The iter-132 VPS systemd timer can now assert on db_state.{history,transfers,delegation}.present === true && fresh === true to verify each warm landed, not just executed. With this in place, the FREE_PNL=1 prod flip (iter 133) can be gated on 24h of cron telemetry showing 100% db_state.present on all three endpoints for all three coldkeys, which is a materially stronger signal than the iter-130 cache_state proxy. Sequential warm loop + Promise.all probe (3 read queries hit Supabase concurrently per coldkey, ~50ms total). No new env vars, no new DB tables, no new dependencies — just a thin verification layer reusing the iter-125/127/128 cache readers.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL cache warmer admin endpoint: GET /api/admin/warm-free-pnl-cache (auth via CRON_SECRET) pre-populates the iter-125/127/128 Supabase caches (history + transfers + delegation) for every coldkey listed in FREE_PNL_WARM_COLDKEYS. Designed to be hit every ~10 min by an external cron so user-facing reports under FREE_PNL=1 always resolve cache_state=db on cold lambdas instead of racing Taostats free-tier rate limits from page 1. Last structural derisk before the FREE_PNL=1 prod flip',
    body:
      'Iters 125/127/128 closed every Taostats endpoint the free-PnL reconstruction touches (history/v1, transfer/v1, delegation/v1) onto a memo → Supabase → fresh-walk hierarchy with a 15-minute TTL. That removed the steady-state worst case — repeat reports inside the TTL window now share one walk per coldkey per endpoint instead of one walk per request. But the moment AFTER TTL expiry (or on a cold lambda spinning up against an empty in-process memo) the FIRST user to load a report still pays the full page walk on three endpoints across three coldkeys, exactly the burst-429 pattern iters 121-124 chased. iter 130 closes the gap from the cron side: an admin endpoint at /api/admin/warm-free-pnl-cache that, when triggered, sequentially walks getTaxReportRangeFree (which internally drives both getHistoryRowsCached and getTransferRowsCached so two caches warm per call) followed by getDelegationHistory for every coldkey in the comma-separated FREE_PNL_WARM_COLDKEYS env var. Sequential everywhere — across coldkeys AND across endpoints — because Vercel\'s shared outbound IP cannot survive a parallel burst against Taostats free tier (the whole reason the caches exist). Auth follows the exact pattern of the existing /api/cron/weekly-emails route: CRON_SECRET either as ?secret= or as Authorization: Bearer. The response is a per-coldkey JSON breakdown with each task\'s ok/count/ms and a cache_state block exposing _getHistoryRowsLastSource/_getTransferRowsLastSource/_getDelegationRowsLastSource so an external cron can deterministically tell whether the warm actually fetched (fetch / fetch-empty) or just touched an already-warm layer (memo / db). Cron wiring itself is intentionally OUT of scope this iter — Vercel Hobby cron only fires once daily and the cache TTL is 15 min, so the warmer is intended to be triggered by a VPS systemd timer (or any external scheduler) every 10 min. With this landed, the FREE_PNL=1 prod flip can rely on the cache being structurally guaranteed-warm at all times: the only "fetch" cost is paid by the warmer (which is allowed to take 60s and 429-degrade gracefully via the iter-115/116/117/120 partial-rows tolerance), never by a real user.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'narrative',
    title: 'PnL methodology note now travels on the report payload: pnlGroundTruth() attaches a human-readable _methodologyNote describing the reconstruction path (paid /api/accounting/tax/v1 vs free-tier rootOnly reconstruction from history/v1 + transfer/v1), the canonical formula (current + transfers_out − transfers_in − starting), the asymmetric alpha-as-tao treatment between starting and current balances (preserved for parity with the official Taostats tax report), and — when the window is shortened — a note that the ~170d history-endpoint retention horizon truncated the requested days. AI Insights now consumes this line directly so the narrative can name WHY the numbers look the way they do instead of just citing them',
    body:
      'Across iters 125 / 127 / 128 every Taostats endpoint in the free-PnL path was structurally amortised onto memo → Supabase → fresh walk caching, but the model writing the §0 AI Insights narrative still had no idea HOW the headline PnL number was produced — only that it existed. That gap mattered most when windowIsShortened fired (free-tier history endpoint only retains ~170 days, so a 365d request silently collapses to the actual coverage via the iter-109 fallback) or when the reader spotted the starting-vs-current asymmetry on alpha-as-tao and reasonably asked "is that a bug?" (it isn\'t — paid tax/v1 is internally inconsistent and we mirror that intentionally so the headline number matches the official Taostats tax report rao-for-rao). iter 129 introduces an _methodologyNote string on the pnlGroundTruth payload: path detected from the row-source tagging getTaxReportRangeFree() already stamps on each emitted snapshot row (free:history/v1@rootOnly:*) — falls back to paid wording when no row carries that tag. The note names the source endpoint, the formula in plain words, the alpha-as-tao asymmetry, and (only when windowIsShortened) the retention-horizon truncation with the actual effective coverage in days. lib/ai-insights.js buildUserPrompt picks the field up under the ## PnL ground truth block as a single "Methodology: …" line so the model gets it without burning its instruction-following budget on a new system-prompt section. /api/debug/free-pnl gains a parallel methodology block exposing path + first_snapshot_source + a short note preview so end-to-end wiring is verifiable from one probe. Iter counter bumps to 129. No behaviour change for the deterministic report — only context being handed to AI Insights — but it tees up priority-2 (richer AI knowledge base) and priority-3 (more detailed report) work that\'s easier to reason about once methodology is named explicitly.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL cross-request delegation cache: /api/delegation/v1 walks now go through the same memo → DB → fresh-walk hierarchy as history (iter 125) and transfers (iter 127), backed by a new Supabase table tao_taostats_delegation_cache (coldkey PK, 15-min TTL). Third and last endpoint in the burst-429 triplet closed onto the cache shape — every Taostats endpoint the free-PnL path touches is now structurally amortised across same-request and cross-request reuse. With this landed, FREE_PNL=1 in production is structurally as derisked as it gets: 3 coldkeys × N report visits no longer pile rate pressure on Taostats inside the TTL window',
    body:
      'iters 125 (history) and 127 (transfers) closed the first two free-tier Taostats endpoints used by the free-PnL reconstruction onto a cross-request Supabase cache. The third — /api/delegation/v1, used by getDelegationHistory() to fetch stake/unstake/move events for the realised-PnL math — was still uncached: every report build (3 coldkeys × 1 walk each per fire) re-walked from page 1, and a cold lambda paid the full walk every time. Worse, getDelegationHistory fires inside buildReport\'s top-level Promise.all alongside getHoldings + getSubnetScreener — guaranteed concurrent against the same shared outbound IP, exactly the burst-429 pattern iters 121-124 chased on the history endpoint. iter 128 refactors getDelegationHistory to use the same 3-layer cache as the other two: 60s in-process memo (same coldkey, same fire = zero re-fetches), Supabase cross-request cache via tao_taostats_delegation_cache (coldkey PK, rows JSONB, fetched_at TIMESTAMPTZ, 15-min TTL), in-flight promise dedup so concurrent first-callers share one walk. Page-walk tolerance preserved (page-1 failure → return [] tagged fetch-empty; mid-walk failure → return partial); flattened row shape is unchanged so the downstream pnl() / realised-PnL math doesn\'t need to know caching exists. /api/debug/free-pnl exposes a new delegation_cache.last_source field (memo|db|fetch|fetch-empty) parallel to history_cache and transfers_cache, plus a delegation_history block (row_count, first, last, ms) for end-to-end verification. After this all three burst-429-prone endpoints in the free-PnL path are amortised, and a cold-lambda 3-coldkey report visit inside the TTL window pays at most one walk per endpoint per coldkey total instead of one walk per request per endpoint per coldkey.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL cross-request transfers cache: /api/transfer/v1 walks now go through the same memo → DB → fresh-walk hierarchy as history rows (iter 125), backed by a new Supabase table tao_taostats_transfers_cache (coldkey PK, 15-min TTL). One walk per coldkey serves both FY24 and FY25 reconstructions plus any future time-window query — the transfer-endpoint burst-429 vector is now structurally amortised across both same-request and cross-request reuse. Bundles a drive-by instrumentation fix (iter 126): the history-rows page-1-failed return-empty path now tags last_source as fetch-empty so the debug endpoint reflects the failure instead of a stale memo/db value',
    body:
      'iter 125 collapsed the /api/account/history/v1 endpoint onto a cross-request cache so cold lambdas stopped re-walking inside the 15-min TTL. The companion free-tier endpoint /api/transfer/v1 was still the unfinished half: pre-iter-127 each FY reconstruction (lib/report.js orchestrator pre-fetches both FY24 + FY25 inside pnlGroundTruth) issued its own paginated transfer walk per coldkey per request, and every cold lambda paid the full walk again. With 3 coldkeys × 2 FYs that\'s 6 transfer-endpoint hits per cold report, every one on Vercel\'s shared outbound IP that\'s already fighting Taostats free-tier rate limits. iter 127 adds getTransferRowsCached(coldkey) in lib/taostats.js mirroring getHistoryRowsCached one-for-one: 60s in-process memo (same coldkey, same fire = zero re-fetches), a Supabase cross-request cache via the new tao_taostats_transfers_cache table (coldkey PK, rows JSONB, fetched_at TIMESTAMPTZ, 15-min TTL), plus the same in-flight promise dedup so concurrent first-callers share one walk. Crucially the fetch now omits the timestamp_start/timestamp_end filter — the consumer in getTaxReportRangeFree filters the all-time list in-memory by [effectiveStartMs, endD], which means a single cached row services BOTH FY24 and FY25 reconstructions automatically (same coldkey, different windows, same cached payload). Same safety properties as iter 125: empty-walk results are NOT persisted (page-1 failure → return [], log + set fetch-empty source), write is fire-and-forget, read errors fall through to fresh fetch. /api/debug/free-pnl exposes a new transfers_cache.last_source field (memo|db|fetch|fetch-empty) parallel to the existing history_cache.last_source. iter 126 piggy-back: getHistoryRowsCached\'s own page-1-failed return-empty path was missing the _historyRowsLastSource.set call, so after a burst-429 the debug endpoint would still show whatever the previous successful call had set — closed that gap by setting fetch-empty on the path too. Combined effect with iter 125: both free-tier Taostats endpoints used by the reconstruction now have memo + DB caching with identical semantics. The next FREE_PNL=1 production flip is structurally safer than ever.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL cross-request history cache: getHistoryRowsCached now layers a Supabase-backed cache (tao_taostats_history_cache, 15-min TTL) under the iter-114 in-process memo. Cold lambdas no longer re-walk /api/account/history/v1 from page 1 when the previous request just paid for the same coldkey — the burst-429 vector iters 121/122/123/124 chased is now amortised across the TTL window. memo → DB → fetch hierarchy, never blocks on cache infra failure',
    body:
      'iter 124 closed the within-request burst by collapsing getLatestBalance + getBalanceHistory + getTaxReportRangeFree onto one shared in-process memo. But a fresh Vercel lambda (cold start, or scaled-out concurrent request) starts with an empty memo and pays the full /api/account/history/v1 page walk again — and Jai\'s 3-coldkey diagnostic burst was failing intermittently because the third coldkey\'s walk competed with the first two from a sibling lambda. iter 125: add a cross-request cache layer in Supabase (tao_taostats_history_cache: coldkey PK, rows JSONB, fetched_at TIMESTAMPTZ, RLS enabled). New helpers lib/supabase.js#historyCacheRead / historyCacheWrite. getHistoryRowsCached hierarchy is now memo (free, ~0ms) → DB (network, ~50ms) → fresh page walk. 15-min TTL is conservative for PnL reports — balance snapshots only move once per epoch (~12s) but the headline figures Jai cares about (current_balance, starting_balance, net_profit) tolerate 15-min staleness trivially. Empty-walk results are NOT persisted (iter 122\'s page-1-failed → []) so a transient 429 can\'t poison the DB cache. Write is fire-and-forget; read errors return null and fall through to fresh fetch. /api/debug/free-pnl gains a `history_cache.last_source` field exposing `memo`|`db`|`fetch` so I can verify the 2nd probe of any coldkey hits the DB layer instead of re-walking. Existing Supabase project (tsaxitqzmzieaqakgvpb, shared with production-scheduler) used to stay inside the free-tier 2-project cap. With cross-request caching now landed, FREE_PNL=1 in production is structurally viable: repeated visits and multi-coldkey workflows no longer pile rate pressure on Taostats, and the cache spreads the load across the hour instead of fighting the IP budget on every request.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL latest-balance shares history memo: getLatestBalance() now reads from the shared getHistoryRowsCached memo (allRows[0], rows are DESC) instead of making its own /api/account/history/v1?limit=1 call. Halves the number of /account/history/v1 hits per coldkey per report — was the burst-429 vector iter 123 diagnosed for subnets coldkey (latest_balance.ok=false → no_balance). One in-flight walk, two consumers',
    body:
      'iter 123 nailed the residual failure mode: subnets coldkey ships `pnlGroundTruth.available=false, reason=no_balance` because getLatestBalance\'s /api/account/history/v1 leg 429s, even though the other two coldkeys render cleanly. Diagnostic JSON confirmed it: `latest_balance.ok=false, error=Taostats /api/account/history/v1 → 429`. Root cause: at lib/report.js ~L1261-1262 the orchestrator fires `getBalanceHistory(coldkey, 730)` and `getLatestBalance(coldkey)` as parallel promises. getBalanceHistory routes through getHistoryRowsCached (the shared memo from iters 114/115/118 with in-flight promise dedup), but getLatestBalance bypassed the memo with its own /api/account/history/v1?limit=1 call. Result: every report build double-tapped the same endpoint per coldkey, and under Vercel\'s shared outbound IP the secondary call was the one losing the rate race. iter 124: rewrite getLatestBalance to consume getHistoryRowsCached too — `allRows[0]` is the most recent snapshot (rows are timestamp-DESC), which is exactly what getLatestBalance needed. Same fix-shape as iter 115 (which collapsed getBalanceHistory + getTaxReportRangeFree onto the same memo). After iter 124 both callers share the in-flight promise: whichever fires first pays the page walk, the other awaits and gets the result free. Null-on-failure contract preserved — getHistoryRowsCached returns [] on page-1 failure (iter 122), allRows[0] is undefined, getLatestBalance returns null exactly as before. Side benefit: the 365d window in pnlGroundTruth and the 730d window in getBalanceHistory already need the full history walk anyway, so getLatestBalance now costs zero additional fetches on every report path. Next: re-probe /api/debug/free-pnl on the iter-124 preview to confirm subnets\' latest_balance now succeeds, then promote FREE_PNL=1 to production.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL JSON diagnostic endpoint: GET /api/debug/free-pnl?coldkey=<ss58>&days=365 returns getTaxReportRangeFree\'s internal state as JSON — latest_balance result, snapshot/transfer row counts, first/last snapshot timestamps and _source tags, sample rows, balance_history_30d row count, plus error+stack on any thrown leg. Gated behind FREE_PNL=1 (preview only, 404s in prod). Closes the visibility gap: iter 119\'s [free-pnl] empty-out warnings are real, but Vercel\'s runtime log viewer truncates them mid-line so I can\'t tell which mode actually fired for mantat',
    body:
      'Iters 119-122 added instrumentation, partial-tolerance, and stale caches — every layer that could swallow a 429 silently was patched. But four preview probes later mantat still ships `no_tax_data`, root still ships `no_balance`, and I still don\'t know why. Reason: the Vercel runtime log UI truncates each warning line to ~120 chars, so iter 119\'s structured `[free-pnl] 5CTRC.. snapshots empty (history_rows=N, in_window=N, transfers=N)` line — designed specifically to give a deterministic answer — comes back as just `[free-pnl] 5CTRC.. snapshots empt` with the counts cut off. The log path was the wrong instrumentation channel from the start. iter 123: dedicated diagnostic endpoint at app/api/debug/free-pnl/route.js. Runs the exact same calls /api/report\'s pnlGroundTruth makes (getLatestBalance → getTaxReportRangeFree → getBalanceHistory), each in its own try/catch, returns a structured JSON blob: rows counts, ms timings, sample rows (first 3 + last 3), first_snapshot_source (the _source tag that tells us whether fallback-oldest fired), stack traces on thrown legs. Gated behind FREE_PNL=1 so it only exists on the preview env (production is unaffected — endpoint 404s). Data exposed is no more sensitive than the public report page. Next fire: GET this endpoint for all 3 coldkeys, finally diagnose mantat\'s no_tax_data and root\'s no_balance deterministically, then fix the actual cause.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL history page-1 visibility: getHistoryRowsCached() no longer rethrows on a page-1 fetch failure — it now logs `[taostats] history-rows page 1 failed (...); returning empty rows` and returns []. Was the silent-failure mode hiding behind mantat\'s `no_tax_data` and root\'s `no_balance` on the iter 121 preview: the throw propagated through every consumer\'s `.catch(() => [])` in lib/report.js, collapsing to empty rows long before reaching iter 119\'s `[free-pnl]` empty-out instrumentation. Now the diagnostic chain closes',
    body:
      'iter 121 stopped the report from 500ing, but POSTing /api/report on the preview across all 3 coldkeys still produced two failure modes — mantat ships `pnlGroundTruth.available=false, reason=no_tax_data` (FY rows empty) and root ships `reason=no_balance` (getLatestBalance returned null) — while subnets renders cleanly with profitTao=2.18 and 172 daily snapshots. Crucially the iter 119 `[free-pnl]` warnings (history walk returned 0 rows, snapshots empty, merged empty) never fire in the runtime logs for the failing coldkeys, even though I\'ve been chasing them across four iters. Root cause: at lib/taostats.js:317 inside getHistoryRowsCached, page-1 of `/api/account/history/v1` throwing was the ONE rate-limit path NOT wrapped in partial-tolerance — iter 115 added it for page>1, iter 117 wrapped /api/transfer/v1, iter 116 wrapped /api/delegation/v1, iter 120 wrapped getHoldings\' alpha_shares, but page 1 of history still bare-threw. The throw propagated up through balanceSeriesP, both FY getTaxReportRange.catch(() => []) and (separately) getLatestBalance\'s own /api/account/history/v1 call, collapsing silently. iter 122: replace the throw with the same partial-rows pattern — log a `[taostats] history-rows page 1 failed (...); returning empty rows (next caller will retry)` line and return []. The _historyRowsMemo.set is skipped because we return before it (no poison-cache), and the in-flight promise resolves cleanly so concurrent awaiters see [] without orphaning. Downstream effect: when this fires for mantat, getTaxReportRangeFree now reaches its empty-out checks, iter 119\'s `[free-pnl] history walk returned 0 rows` warning finally surfaces in logs, and we have a deterministic answer to "is mantat\'s no_tax_data caused by a 429 or by something else?" — for the first time. No behaviour change on the happy path; we still ship `no_tax_data` under burst-429 but the cause is now in the logs instead of inferred.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL price-endpoint stale cache: getTaoPrice() now wraps /api/price/latest/v1 in a module-level fresh (60s) + stale (1h) cache. Sat inside buildReport()\'s first Promise.all next to four heavier walkers — when 429-prone under the burst it threw the whole report 500. iter 120 unblocked subnets coldkey; mantat still 500\'d because price/latest happened to lose its retry budget. Stale fallback keeps the report rendering and finally lets iter 119\'s [free-pnl] instrumentation log for the failing coldkey',
    body:
      'Three fires deep into the iter 119 instrumentation hunt, the runtime logs across the iter 120 preview kept showing the same alternating 200/500 pattern across the 3 coldkeys, and the 500s were grouped around `[taostats] /api/price/lates...` warning lines — meaning the report was 500ing on getTaoPrice() before §2 ever ran. price/latest/v1 is the LIGHTEST Taostats endpoint we call (single row, no pagination), but it lives inside buildReport()\'s first Promise.all with four heavy walkers (getHoldings, getDelegationHistory, getSubnetScreener, getUsdToAud) — under that parallel burst the free-tier key 429s here just as readily as on the walkers, taoGet\'s 1.5s+3.5s retries exhaust, the await throws, Promise.all rejects, /api/report returns 500. iter 121 fix: module-level cache in lib/taostats.js — `_taoPriceCache = { value, ts }`. 60s fresh (warm-container reuse skips the network entirely after the first call), 1h stale (on 429/transport error, serve the last-good value with a [taostats] warn line instead of aborting). Cold boots still re-fetch because the cache is in-memory only. The fix is rate-symmetric: it doesn\'t paper over Taostats\' rate limit, it just stops the lightest endpoint from taking down the whole report. Expected impact: mantat\'s no_tax_data finally resolves to either real data OR an iter-119 [free-pnl] warning telling us which silent-failure mode it\'s actually hitting.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL preview unblock: getHoldings now tolerates mid-walk 429s on /api/dtao/coldkey_alpha_shares/latest/v1 — same partial-rows pattern as iter 116 (delegation) and iter 117 (transfer). Last unprotected paid-tier Taostats endpoint that was aborting the whole report before §2 could run, masking iter 119\'s new instrumentation',
    body:
      'iter 119 added [free-pnl] warnings to getTaxReportRangeFree so the runtime logs would finally tell us which silent-failure mode §2 was hitting on the preview. But when I tried to trigger them by POSTing /api/report on the preview alias across all 3 coldkeys, every call returned HTTP 500 with "Taostats /api/dtao/coldkey_alpha_shares/latest/v1 → 429" — the entire report build aborted before §2 ever ran, so the new instrumentation never had a chance to log anything. Root cause: getHoldings was the last paid-tier Taostats endpoint without partial-rows tolerance. One 429 → throw → top-level Promise.all rejects → 500. Iter 116 fixed this for /api/delegation/v1, iter 117 for /api/transfer/v1, iter 115 for /api/account/history/v1; coldkey_alpha_shares was the remaining domino. iter 120: same try/catch wrapper inside the pagination loop — page-N>=1 failure logs and returns whatever rows we walked so far. Zero behaviour change for the happy path. Next fire: re-trigger the preview now that the build can survive an alpha_shares 429, read the iter 119 [free-pnl] warnings, fix the actual silent-failure cause they reveal.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL concurrent-walk dedup: getHistoryRowsCached() now holds an in-flight promise so concurrent callers share a single page walk — iter 115\'s result-cache only helped sequential callers, but the orchestrator fires getBalanceHistory(730) + the FY24 getTaxReportRange concurrently, both kicked off parallel page walks, both raced past the free-tier rate ceiling, §2 kept shipping "no_tax_data"',
    body:
      'Visual verify on the iter 117 preview: banner gone (iter 116), transfer-walk doesn\'t throw (iter 117), but §2 STILL says no_tax_data on mantat. Reread lib/report.js:1255-1271 — getBalanceHistory(coldkey, 730) is fired without await (balanceSeriesP), then the for-loop AWAITs getTaxReportRange(FY24). Both call getHistoryRowsCached(coldkey) before either resolves. iter 115\'s memo is a Map<coldkey, {rows, ts}> — it only deduplicates AFTER one walk has resolved. Concurrent first-callers each see an empty cache, each kick off an 11-page walk, 22 history fetches go out in parallel, 429s mid-walk, .catch(() => []) swallows trailingRows into []. The local validator in scripts/validate-iter115.mjs called the functions SEQUENTIALLY, so this race was invisible. iter 118 fix: add a parallel _historyRowsInFlight Map keyed by coldkey storing the in-flight Promise. Second concurrent caller awaits the same promise the first started instead of starting its own walk. finally{} clears the in-flight entry so a future request after this batch can re-walk if the cache is also gone. Validated locally with a fresh dynamic import to bypass module-level cache: Promise.all(getBalanceHistory, getTaxReportRangeFree) issues 1 shared history walk (not 2). Sequential path still hits the result-cache for free. This is the real iter-115 — promise-dedup, not just result-cache.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-27',
    tag: 'infra',
    title: 'Free-PnL transfer-walk tolerance: getTaxReportRangeFree() /api/transfer/v1 page walk now mirrors the iter 116 partial-rows pattern — finally unblocks §2 on the preview, where iter 116 stopped the banner abort but §2 still rendered "no_tax_data" because the transfer walk was the next-weakest endpoint',
    body:
      'iter 116 stopped getDelegationHistory from throwing the whole report away. Visual verify on the preview after iter 116: the banner is gone, §1 portfolio renders, but §2 PnL Ground Truth still says "no_tax_data". Runtime logs on the preview deploy showed a single new warning line: `[taostats] /api/transfer/v1 page N → 429`. The transfer page walk at lib/taostats.js:336-373 was the only remaining unprotected page walk in the free-PnL reconstruction path — iter 115 fixed history/v1, iter 116 fixed delegation/v1, but transfer/v1 still threw on any mid-walk 429, propagating up through pnlGroundTruth\'s `.catch(() => [])` in lib/report.js so trailingRows became empty and §2 shipped "no_tax_data". The fix is the exact same pattern: wrap the per-page taoGet in try/catch, on page-1 failure → empty array (pnl reconstruction degrades to zero transfers, which on a wallet with non-trivial activity is still wrong but no longer aborts the section), on page-N>1 failure → return what we have so far + log. Three endpoints, three identical patches — the underlying problem is Vercel\'s shared outbound IP being aggressively rate-limited by Taostats free tier. The real fix is a separate iter (request memoisation across all four endpoints with a longer TTL, or a paid-key fallback for the cold-start hit). This iter is the last patch needed to make the iter 113 preview verify actually pass.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL preview unblock: getDelegationHistory() page-walk is now tolerant of mid-walk 429s — preview verify was repeatedly aborting with "Couldn\'t build report: /api/delegation/v1 → 429" because that single endpoint failure was throwing the top-level Promise.all in buildReport(), masking iter 115\'s actual fix',
    body:
      'Two fires in a row (iter 113 verify, iter 115 verify) the §2-no_tax_data hunt was blocked one layer up: buildReport()\'s parallel Promise.all(getTaoPrice, getHoldings, getDelegationHistory, getSubnetScreener, getUsdToAud) re-threw whichever child rejected. getDelegationHistory walks /api/delegation/v1 — the most expensive Taostats endpoint, walking up to 50 pages of 200 rows. Under Vercel\'s shared outbound IP the FREE key 429s mid-walk on cold builds; taoGet\'s 1.5s + 3.5s retries exhaust, the page throws, the walker throws, Promise.all throws, the whole page renders the "⚠ Couldn\'t build report" banner. iter 115\'s shared history-rows memo could be working perfectly and we\'d never see it. Fix: wrap each page fetch inside the walker in try/catch; on failure log + return the rows we already have. Page 1 failure ⇒ empty array, lets pnl() degrade to spent=0/sold=0 instead of throwing. Mirrors the partial-rows tolerance pattern iter 115 added to getHistoryRowsCached. The fix is endpoint-symmetric: it doesn\'t paper over the underlying free-key rate-limit problem, it just stops one weak endpoint from taking down the whole report. iter 117 candidate (assuming preview now actually shows §2 PnL Ground Truth rendered): promote FREE_PNL=1 to production target.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL shared history-rows memo: getTaxReportRangeFree() and getBalanceHistory() now read /api/account/history/v1 from the same in-process cache, plus partial-rows tolerance on mid-pagination failure — finishes the iter 113/114 preview fix where §2 still rendered "no_tax_data" after iter 114\'s FY-only memo',
    body:
      'Iter 114 memoised the history page walk INSIDE getTaxReportRangeFree so the second FY call reused the first FY\'s rows. Preview re-render after iter 114 still rendered "no_tax_data" on the mantat coldkey, because the rate-limit collision wasn\'t between the two FY calls — it was between getTaxReportRangeFree (FY25, first call) and getBalanceHistory(coldkey, 730) (drawdown/volatility), both of which independently paginate /api/account/history/v1 from page 1 on a cold lambda. iter 114\'s memo helped the second FY but the first FY still raced drawdown — 429 mid-walk, .catch swallowed the throw into an empty array, "no_tax_data" shipped. This iter promotes the memo to a module-shared one (_historyRowsMemo, was _freeHistoryMemo) and refactors getBalanceHistory to consume it instead of doing its own page walk. Whichever code path fires first pays for the walk, the other gets it free. Also: getHistoryRowsCached now mirrors getBalanceHistory\'s pre-iter-115 partial-rows tolerance — if page N>1 fails mid-walk we log and return what we have rather than throwing the whole walk away (better to render with ~170d than render "no_tax_data" because the last page was rate-limited). Local validation with a fetch counter on all three of Jai\'s coldkeys: full free-PnL render sequence (getBalanceHistory(730) + getTaxReportRangeFree FY24 + getTaxReportRangeFree FY25) issues exactly 2 history/v1 fetches per coldkey (one for getBalanceHistory, one for getTaxReportRangeFree FY24; FY25 + the post-FY25 getBalanceHistory both cache-hit). Pre-iter-115 the same sequence issued 6+ history fetches and bursted past the rate ceiling on cold lambdas. PnL outputs match iter 112 baseline to the rao on every coldkey (mantat +2.91τ, root −5.83τ, subnets +2.59τ). Preview should now genuinely render §2 PnL under FREE_PNL=1.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL history-page memo: getTaxReportRangeFree() now memoises /api/account/history/v1 page walks per coldkey with a 60s TTL — fixes the iter 113 preview regression where §2 PnL silently returned "no_tax_data" on the live render despite local validation passing',
    body:
      'iter 113 flipped FREE_PNL=1 on a Vercel preview deploy to visually verify the free-PnL path. Result: §2 PnL on the mantat coldkey rendered as "Ground-truth PnL unavailable (no_tax_data)" while every local test against the same function returned 173 rows including non-zero transfers. Vercel runtime logs surfaced a warning on /api/transfer/v1 inside the preview request. Root cause traced to call-stack contention: the lib/report.js orchestrator pre-fetches tax-report rows for BOTH the prior and current FY in a sequential loop (line 1263-1269), and under FREE_PNL=1 each loop iteration paginates /api/account/history/v1 from page 1 independently. Add the parallel getBalanceHistory(coldkey, 730) + getLatestBalance(coldkey) calls that also hit history/v1, and a cold-start render bursts ~24 history fetches in a few hundred ms. The free-tier rate ceiling against Vercel\'s shared outbound IP is much tighter than against the VPS — sequential bursts of 3+ history/v1 calls already trip 429 per the existing taoGet retry comment. After two retries fail, getTaxReportRangeFree throws, pnlGroundTruth\'s .catch(() => []) swallows it into an empty rows array, and the !rows.length branch ships "no_tax_data". This iter introduces a module-scoped Map cache (coldkey → { rows, ts }, 60s TTL) that intercepts the page walk in fetchFreeHistoryPagesCached(). First call fetches all pages; subsequent calls within 60s on the same warm lambda for the same coldkey return zero new fetches. The orchestrator\'s FY24 + FY25 loop now amortises to a SINGLE history walk (the second FY hits cache). TTL keeps warm-lambda reuse from serving stale data across distinct user requests. Local validation with a fetch counter confirms: FY24 call = 1 history fetch + 1 transfer fetch; FY25 call = 0 history fetches + 1 transfer fetch (cache hit). PnL outputs match iter 112 baseline to the rao on all three coldkeys (mantat +2.91τ, root −5.83τ, subnets +2.59τ). Preview re-render should now succeed where iter 113\'s did not.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL preview verification: FREE_PNL=1 set on Vercel preview target only, branch pushed to trigger a preview deploy so §2 PnL across all three of Jai\'s coldkeys can be visually confirmed in a free-mode render before the production flip',
    body:
      'Safety step before iter 114\'s prod flip. The free-tier reconstruction (iters 103-112) has been validated by node scripts that import getTaxReportRangeFree() directly and assert PnL equality vs paid — but the full page render under FREE_PNL=1 (Report.jsx → income sparkline → AI Insights → email → X-share text) has never been exercised end-to-end. A bug in any view-layer consumer of pnlGroundTruth\'s new fields (effectiveWindowDays, windowIsShortened, _source tags on snapshot rows) would surface as a broken or misleading prod report without warning. This iter sets FREE_PNL=1 with target=[preview] only on the Vercel project (paid prod env untouched), then pushes branch `free-pnl-preview-verify` with this changelog entry to trigger an isolated preview deploy. Verify protocol on the resulting preview URL: (1) load the report for mantat coldkey and confirm §2 headline reads "~168 days · requested 365d, data covers 168d", annualised chip uses 365/168 exponent (visibly higher than the 365/365 prod chip), and the income sparkline has visible per-day points. (2) Repeat for root + subnets coldkeys. (3) Spot-check that AI Insights text and the X-share button text mention the shortened window. If any coldkey fails, iter 114 reverts the env-var instead of promoting to prod. If all pass, iter 114 promotes FREE_PNL=1 to production target and the paid TAOSTATS_API_KEY can be retired in iter 115.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL sparkline backfill: getTaxReportRangeFree() now derives daily_income per UTC date by diffing rootOnly snapshots and netting out transfers — §2 income sparkline will be populated under FREE_PNL=1 instead of a blank chart',
    body:
      'Last unblocker before the FREE_PNL=1 prod flip. Paid /api/accounting/tax/v1 ships a server-computed daily_income field on every snapshot row; /api/account/history/v1 does not. Iters 105-111 produced PnL totals that matched paid to the rao but left dailyIncomeSeries empty under free mode — flipping the flag now would render §2 sparkline blank (a regression). This iter derives daily_income from history primitives. Algorithm: (1) Collect every history row visited during the starting-snapshot page walk (they\'re all in [start, end] by construction). (2) Fetch transfers first (was after; reordered so the per-day correction can use them). (3) Build transferNetByDate so each transfer day knows its in − out signed total. (4) Group history rows by UTC date and keep the most recent row per day — /api/account/history/v1 ships ~12 epoch-frequency rows/day, so without this collapse the sparkline would have 2000 noisy points instead of ~170 clean daily ones. (5) Sort the per-day end-of-day rows ascending and emit one snapshot row per day, with daily_income = rootOnly(today) − rootOnly(yesterday) − transferNetByDate[today]. The first day is the baseline (no daily_income — matches paid behaviour). The iter-111 closing-snapshot push is gone (the most recent per-day row IS the closing snapshot). rootOnly excludes alpha-as-tao so alpha price moves don\'t contaminate the diff; the residual approximates root-network staking yield plus alpha→root unstake events (and minus root→alpha stake events). Validated locally against all three of Jai\'s coldkeys at 365d: mantat → 168 daily rows with daily_income, root → 171, subnets → 170; effectiveWindowDays still shortened (168/171/170d vs requested 365d); pnlGroundTruth profits unchanged from iter-111 baseline (mantat 2.91τ, subnets 2.59τ). Paid mode (FREE_PNL off) is untouched.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL closing snapshot: getTaxReportRangeFree() now emits both a starting AND a closing snapshot row so iter 110\'s effectiveWindowDays / qualifier text actually fires under free mode (was structurally inert)',
    body:
      'Caught a latent bug while preparing the FREE_PNL=1 prod flip. Iter 110 added effectiveWindowDays (firstSnapshotDate → lastSnapshotDate) and an "honest window" qualifier to every label/email/AI/X-share site — but getTaxReportRangeFree() only ever emitted ONE snapshot row (the starting one), so firstSnapshotDate === lastSnapshotDate, the ternary fell through to the requested `days`, and the qualifier never appeared. Flipping FREE_PNL=1 right now would have rendered "365d" sitting on top of a ~172d reconstruction — exactly the lie iter 110 was meant to prevent. Fix: while paginating /api/account/history/v1 to find the starting row, also track newestSeenRow (first row touched, since the endpoint returns DESC). After the starting snapshot, emit a closing snapshot row at that newest timestamp using the same rootOnly basis (balance_free + balance_reserved + balance_staked_root) for internal consistency. The closing row\'s total_balance lands in pnlGroundTruth\'s lastSnapshotBalance (assigned, never returned, never used in PnL math) so it cannot affect any downstream number — only lastSnapshotDate (and via that, effectiveWindowDays and windowIsShortened). Merged out + transfer rows are now sorted by timestamp before returning to satisfy the consumer\'s ascending-order expectation. Validated locally against all three of Jai\'s coldkeys at 365d: mantat (effective=168d), root (171d), subnets (170d), windowIsShortened=true on every coldkey. The FREE_PNL=1 flip is now genuinely unblocked: a future iter can flip it and the headline will correctly read "168 days · requested 365d, data covers 168d".',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Honest PnL window label: §2 now reports the actual reconstruction window (e.g. "172 days, since 2025-12-06") instead of the requested 365d — unblocks the free-PnL re-flip',
    body:
      'Iter 109 surfaced that under FREE_PNL=1 all three of Jai\'s coldkeys hit the fallback path because /api/account/history/v1 only retains ~6 months of snapshots — so a "365d PnL" request was structurally a ~170-day reconstruction. This iter teaches pnlGroundTruth to compute `effectiveWindowDays` from the snapshot range (firstSnapshotDate → lastSnapshotDate, rounded to days) and adds a derived `windowIsShortened` flag (true when effective < requested − 5d). Every label/annualisation in the app now consumes effectiveWindowDays in place of windowDays: §2 headline ("Over last N days"), status pill ("+0.45% over Nd"), annualised-return chip (whose (1 + ret)^(365/days) math was silently dampening on shortened windows — fixing this raises the annualised number to its honest value), staking-income label, email HTML + plaintext heading + body, AI Insights data block, X share text. When the requested and effective windows diverge, the headline line + email + AI dossier appends a `· requested 365d, data covers 172d` qualifier so the reader can see what happened; tooltip explains the free-tier history/v1 retention cap. In paid mode firstSnapshotDate ≈ start, so the two values converge and nothing changes visually. Priority 1 free-PnL flip is now unblocked: a future iter can flip FREE_PNL=1 in Vercel prod env without the headline number lying about its time horizon.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL young-coldkey fix + retention finding: getTaxReportRangeFree() now falls back to the oldest available history snapshot, and at 365d ALL three coldkeys hit it (free history/v1 only retains ~6mo)',
    body:
      'Fixes the iter-107 regression that pushed §2 PnL to "no_balance_snapshots" on the subnets coldkey. getTaxReportRangeFree() now keeps a running pointer to the OLDEST history/v1 row it sees while paginating; if it never finds a row at or before the requested `start`, it falls back to that oldest row as the snapshot, and clamps the /api/transfer/v1 window to the snapshot timestamp (effectiveStart) so the PnL formula stays internally consistent: profit_tao = current + transfers_out − transfers_in − starting, with every term measured from the same starting point. Snapshot rows emitted via fallback are tagged `_source: \'free:history/v1@rootOnly:fallback-oldest\'` so they\'re traceable. Validated locally against all three of Jai\'s coldkeys at the production 365d window — every coldkey now returns a non-empty starting snapshot. Surprise finding: ALL THREE hit the fallback path, because /api/account/history/v1 only retains data back to ~2025-12-05 to 2025-12-08 (about 6 months). So when free-PnL is flipped on at the default 365d window, the production reconstruction is structurally a ~170-day reconstruction, not a 365-day one — the headline number will be smaller in magnitude than paid tax/v1\'s full-year answer. Implications: (a) the fix unblocks the iter-107 flip safely, but (b) the report\'s "365d" label is now misleading under free mode and should either be tightened to the actual reconstruction window or augmented with a `since YYYY-MM-DD` qualifier (followup iter). FREE_PNL stays opt-in until that labelling fix lands.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Revert iter 107: paid tax/v1 restored as default — free path can\'t produce a starting snapshot when the coldkey is younger than the 365d window',
    body:
      'Iter 107 flipped getTaxReportRange() to call getTaxReportRangeFree() by default. Visual verification against the live subnets coldkey (5EKFph…) immediately surfaced a regression: §2 went to "Ground-truth PnL unavailable (no_balance_snapshots)". Root cause: iter 106\'s validation ran 30d windows, but the production headline PnL uses a 365d window — and the subnets coldkey was created < 365 days ago. getTaxReportRangeFree\'s snapshot lookup paginates /api/account/history/v1 looking for a row whose timestamp ≤ start; when none exists (wallet is younger than `days`), it emits NO snapshot row, and pnlGroundTruth bails out at startingBalanceTao == null. Paid /api/accounting/tax/v1 handled this case implicitly by returning rows starting from the wallet\'s first activity. Fix-forward (next iter): teach getTaxReportRangeFree to fall back to the OLDEST available history row when none exists ≤ start, and clamp the transfer window to that fallback date so the formula stays consistent (start + in − out → current). Until that ships and is re-verified end-to-end against ALL three coldkeys on the 365d window (not just 30d), paid stays as the default. Drawdown / vol / per-position sections were unaffected — they use getBalanceHistory() directly, which doesn\'t need a pre-window snapshot.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL is now the default: paid /api/accounting/tax/v1 is no longer called in production — every PnL number comes from free-tier primitives',
    body:
      'Iter 106 shipped getTaxReportRangeFree() behind FREE_PNL=1 and validated it to Δ=0.000000τ against paid /api/accounting/tax/v1 on all three of Jai\'s coldkeys (mantat, root, subnets) over 30d windows. This iter flips the default: lib/taostats.js getTaxReportRange() now dispatches to the free reconstruction unconditionally, with PAID_PNL=1 left as an explicit escape hatch (for the rare debug / regression check). End-state: every PnL surface in the app — §2 headline ground-truth, tax-year breakdown table, drawdown stats, AI Insights data block — is now reconstructed from /api/account/history/v1 + /api/transfer/v1, both available on the FREE Taostats tier. Priority 1 of Jai\'s iter-47 redirect ("free-API PnL, ground-truth not paid Standard plan") is now LIVE in production. Followup: once a few production reports have been served on the free path with no regressions, the Standard-plan TAOSTATS_API_KEY can be swapped for the FREE-tier key in Vercel env without changing a line of code (lib/taostats.js authHeaders() reads from process.env.TAOSTATS_API_KEY regardless of tier). Separately, the iter-104 finding about paid\'s internal alpha-asymmetry (starting balance excludes alpha-as-tao, current includes it) is preserved by design — getTaxReportRangeFree() mirrors that exact methodology so the headline number stays continuous across this swap; a future iter can decide whether to switch to a symmetric formula and re-baseline.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL implementation: getTaxReportRangeFree() ships behind FREE_PNL=1, validated to the rao against all three of Jai\'s coldkeys',
    body:
      'Iter 105 proved the methodology (rootOnly starting + balance_total current matches paid net_profit to the rao); this iter actually implements it. Added getTaxReportRangeFree(coldkey, start, end) to lib/taostats.js — calls /api/account/history/v1 + /api/transfer/v1 (both available on the FREE Taostats key) and emits synthetic rows in the EXACT same shape as paid /api/accounting/tax/v1: snapshot rows ({ transaction_type: null, total_balance, date }) for the starting balance + transfer rows ({ transaction_type: \'transfer_in\'|\'transfer_out\', credit_amount|debit_amount, date }) for the flows. All amounts in TAO. The starting-balance snapshot uses rootOnly reconstruction (balance_free + balance_reserved + balance_staked_root) to mirror paid tax/v1\'s starting semantics — current_balance still comes from getLatestBalance() unchanged, which means we naturally inherit paid\'s asymmetry (root-only on start, full on current). Wired into getTaxReportRange() via process.env.FREE_PNL === \'1\' dispatch — paid path is still the default, free is opt-in for safe rollback. Local validation ran the new function via pnlGroundTruth() against all three of Jai\'s coldkeys (mantat 5CTRC…, root 5Cnz1…, subnets 5EKFph…) over 30d windows; all five fields (startingBalanceTao, currentPortfolioTao, transferInTao, transferOutTao, profitTao) match paid to Δ=0.000000τ on every coldkey, including the subnets coldkey which has non-zero transfers_out (0.0009τ matched exactly). daily_income is intentionally NOT populated in free mode — free history/v1 doesn\'t expose it, pnlGroundTruth handles its absence (the §2 sparkline series will be empty under free mode). Next iter: validate end-to-end on Vercel preview with FREE_PNL=1 set, then flip the default. After that, free-tier swap is real and the paid Standard-plan dep can be dropped from PRODUCTION env.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL probe: rootOnly reconstruction matches paid to the rao — free-tier swap is now unblocked',
    body:
      'Iter 104 narrowed the 5.86τ gap between paid tax/v1 and free history/v1 to one structural cause: paid\'s starting_balance counts only the root-stake portion (free + reserved + balance_staked_root) while free history/v1.balance_total also includes alpha-staked-as-tao. This iter tests that hypothesis by adding a SECOND reconstruction to scripts/research-free-pnl.mjs — "rootOnly", which builds balances from balance_free + balance_reserved + balance_staked_root only. Output is now a 3-way comparison (paid vs full vs rootOnly) so every field shows two deltas. Ran live against the mantat coldkey (5CTRC…, 30d): starting_balance rootOnly=7.0244τ vs paid=7.0244τ → Δ=0.0000τ (exact match to the rao); transfers_in/out both zero on all three; current_balance full=12.7548τ vs paid=12.7548τ → Δ=0.0000τ. Paid tax/v1 is INTERNALLY INCONSISTENT — it excludes alpha-as-tao on starting balance but INCLUDES it on current balance. We can mirror that exactly with a MIXED reconstruction (starting=rootOnly + current=full), and the probe now prints that mixed net_profit alongside paid: 5.7304τ = 5.7304τ → Δ=0.000000τ ✅. Priority 1 is unblocked: a future iter can migrate lib/taostats.js getTaxReport() to compute the three components from free /api/account/history/v1 + /api/transfer/v1 (already confirmed to return 200 on the FREE Taostats key) and drop the paid Standard-plan dep — gated behind FREE_PNL=1 env flag for safe rollback. Separately, the asymmetry is worth flagging in §0: the headline PnL number compares apples (root-only) at t-start to oranges (root + alpha) at t-end, so a chunk of "profit" is just alpha entering the portfolio.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Free-PnL probe: ran against live coldkey, fixed two probe bugs, surfaced a real methodology gap with paid tax/v1',
    body:
      'Iter 103 shipped the methodology validator; this iter actually ran it and learned three things that change how priority 1 unblocks. (1) Bug: probe assumed /api/accounting/tax/v1 returns an aggregate row with current_balance / starting_balance / transfers_in / transfers_out / net_profit fields. It doesn\'t — it returns daily EOD snapshot rows (transaction_type=null, total_balance set) interleaved with per-transaction rows (transfer_in/out, token_swap for alpha). Fixed paidBaseline() to aggregate the same way lib/report.js pnlGroundTruth() does. (2) Bug: free reconstruction was computing current_balance and starting_balance as balance_total + balance_staked from /api/account/history/v1. But balance_total already INCLUDES staked + reserved + free — adding balance_staked again double-counts the staked portion. Fixed to use balance_total alone. (3) After both fixes, ran the probe against the mantat coldkey (5CTRC…, 30d window): current_balance matches paid to the rao, transfers in/out are both zero on both sides (no external flow in the window), and starting_balance still diverges by 5.86τ (paid 7.02τ vs free 12.88τ at the same 2026-04-25T23:59:48Z timestamp). The gap is structural, not arithmetic — paid tax/v1.total_balance appears to count only the root-stake portion (free + reserved + root_stake), while free history/v1.balance_total includes the alpha-staked-as-tao portion too. That means the app\'s current PnL formula already mixes semantics (starting excludes alpha, current includes it), and a naive swap to free primitives would inherit a DIFFERENT gap. Next iter candidate: split balance_staked into root vs alpha in the free reconstruction and re-test — if that matches paid, we have a clean swap path; if it overstates by alpha price drift, we have an argument for changing the app\'s PnL methodology rather than just its data source. Also confirmed both /api/account/history/v1 and /api/transfer/v1 return 200 with TAOSTATS_API_KEY_FREE, so the tier story holds.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'infra',
    title: 'Research probe: free-tier Taostats reconstruction of paid tax/v1 PnL — first concrete step on iter-47 priority 1',
    body:
      'The PnL number is the report\'s headline figure and today it depends on Taostats\' paid Standard-plan /api/accounting/tax/v1 endpoint. Iter-47 priority 1 said: free-API ground-truth, but research-first — prove the free source matches before swapping anything. This iter ships scripts/research-free-pnl.mjs, a CLI probe that runs both sides side-by-side: it pulls the paid tax/v1 row for a coldkey + window as the baseline, then rebuilds the same five fields (current_balance, starting_balance, transfers_in, transfers_out, net_profit) from primitive endpoints that are available on the FREE tier — /api/account/history/v1 for the balance snapshots and /api/transfer/v1 for the in/out flows. Prints a per-field comparison with delta and ⚠️ flags any divergence > 0.001τ. Usage: TAOSTATS_API_KEY=… COLDKEY=5G… DAYS=30 node scripts/research-free-pnl.mjs. Nothing wired into the app yet — this is the methodology validator. Once the numbers match across a couple of coldkeys + windows, a follow-up iter can migrate getTaxReport() to call these primitives and drop the paid dependency. If they don\'t match, the script tells us which field diverges and by how much, which is the actual unblock for picking a different free source (Substrate RPC, SubVortex, etc.).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'AI',
    title: '§0 AI Insights: inline category purpose for any cohort ≥25% of port — narrative hook for the dominant theme',
    body:
      'Iter 101 added a category breakdown table to the AI user prompt; this iter adds the WHY for whichever categories actually matter. After the breakdown listing, the prompt now filters to categories that hold ≥25% of the portfolio and re-emits each one with its CATEGORY_INFO.purpose inline — e.g. "Compute marketplaces (42.3%): GPU rental / serverless inference marketplaces. Highly correlated with each other and with broader GPU-demand narratives." The model already knew the % from the breakdown; now it knows the thesis behind that % without having to remember the system-prompt KB block. Lets §0 name the dominant category thesis the wallet is implicitly running (e.g. "this is a GPU-demand bet via three different compute subnets") rather than just citing the share. Zero extra API calls, ~50-200 extra prompt tokens only when a category crosses the threshold. Soft-omits otherwise.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-26',
    tag: 'AI',
    title: '§0 AI Insights: subnet category KB + portfolio category breakdown — second concentration axis for the analyst',
    body:
      'The dossier (added earlier) told the model what each held subnet does. The new SUBNET_CATEGORIES map groups all dossier\'d subnets into 11 categories — compute marketplaces (sn27/51/64), LLM inference (sn4/11/18/20/21), training (sn3/9/25/37/52/56), trading-forecasting (sn6/8/10/41), data (sn5/13/42/50), vision/multimodal (sn19/23), detection (sn32/34), root, foundation-text, storage, other. portfolioCategoryBreakdown() then aggregates the report\'s top positions by category (count + subnet list + tao total + % of port) and injects the breakdown into the user prompt directly after the per-subnet dossier. A new CATEGORY_HEURISTICS block in the system KB tells the model how to reason about it: same-category subnets share narratives (compute correlates on GPU-demand sentiment, training on hardware-cost news), so a portfolio with no single subnet >40% can still be over-concentrated if one CATEGORY >50%. Healthy mix: no category >50%, ≥3 categories represented. Zero extra API calls — uses the top10 data already serialised into the prompt. Lets §0 surface a class of risk the per-subnet concentration check structurally misses.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 PnL: income breakdown splits the headline into staking (recurring) vs price-driven (mark) — centennial iter 💯',
    body:
      'The headline +X.XXX τ profit blends two very different things: STAKING income, which is a recurring floor you\'d earn even at flat prices (sourced from the tax-report dailyIncomeTao, same as the Bittensor weekly FINAL doc), and PRICE-driven PnL, which is the residual — the mark on top of whatever\'s held. They tell different stories: a wallet at +0.06 τ where staking contributed +0.10 τ is actually a price LOSS being masked by yield; another at +0.06 τ where staking only earned +0.005 τ is mostly token-price appreciation. The new .pnl-income-breakdown pill displays both legs as colored sub-pills (green/red by sign) — "Staking +X.XXXX τ · Price +Y.YYYY τ". Tooltip names what % of headline staking covers. Soft-omits when staking income is zero (collapses to profit ≈ price, no signal). Hundredth iter of the tao-wallet-report deepening project.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 PnL: compound-annualised return chip — lets different report windows compare on the same footing',
    body:
      'The PnL hero says "+0.98% over 365d" — but a 30-day report showing "+0.98% over 30d" is a completely different result (12% annualised). The new .pnl-apy-chip beside the status pill normalises via (1 + ret)^(365/days) − 1 so the annualised figure is always visible. Green/red/neutral tinted by sign, italic sub-line either "vs raw +X.XX% over Yd" (when they differ) or "= raw over 365d (already annual)" when the window is already a year. Tooltip names the formula and explains the gating: chip soft-omits below 14 days because compounding tiny windows produces nonsense extremes (a +5% over 3d annualises to ~400%).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 PnL: base-vs-current τ strip surfaces the start/end the status pill only mentioned in tooltip',
    body:
      'The iter-97 status pill named "In profit/drawdown" but the actual τ start and end were buried in its tooltip. A "+0.98%" return is ambiguous in isolation: profit on what base? The new .pnl-base-strip puts the answer inline directly under the status pill — "Net contributed 5.749 τ → Current 5.812 τ (+0.063 τ) ≈ A$X → A$Y". Both AUD figures use the CURRENT TAO price (not historical) so the gap reflects pure τ growth, not token-price moves — the tooltip names this explicitly so the reader doesn\'t think the AUD delta is "PnL in fiat". Tooltip also breaks down the base = starting balance + transfers in − transfers out.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 PnL: status pill ("In profit" / "In drawdown" / "Break-even") under the headline number',
    body:
      'The §2 PnL hero already shows the absolute τ profit and the percent return. The status pill names the situation in one phrase — 📈 In profit, 📉 In drawdown, or 🟰 Break-even — and rephrases the return as "+X.XX% over Yd". Break-even band is ±0.5% so a fractional drift on a wallet sitting right at cost basis doesn\'t flicker between profit and drawdown. Tooltip walks through the math: starting balance + transfers in − transfers out → current → profit τ → return %. Companion to the §1 portfolio-trend-hint but anchored on cumulative window PnL rather than 24h/7d delta — different timescale, different read.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 Portfolio trend hint: "X/Y holdings agree" alignment pill bridges aggregate ↔ per-row',
    body:
      'The §1 aggregate trend chip (iter 95) gives one read; the per-position chips (iter 94) give ten. A natural follow-up: how many of the per-row chips agree with the aggregate? The trend hint now carries an inline pill — e.g. "9/10 holdings agree" green-tinted if ≥70% align (broad move, well-supported), "3/10 holdings agree" red-tinted if <40% align (narrow — aggregate driven by one or two big positions while the rest are mixed), otherwise neutral. A narrative-concentration signal: a "Week-long rally" looks the same in the headline whether all 10 holdings rallied or just sn5 dragged the average up; this pill disambiguates. Soft-omits when fewer than 5 positions are classifiable. Shared classifyTrendKind() helper now used by both the aggregate computation and the alignment count so the row + aggregate read use identical bucketing rules.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 Portfolio: aggregate day-vs-week trend hint above the holdings table',
    body:
      'Iter 94 added trend-shape emoji to every per-position row. This adds the complementary aggregate read: a single .portfolio-trend-hint pill above the §1 table summarising the WHOLE book\'s day shape vs week shape (same 📈📉↩️🔻 vocabulary). Computed in lib/report.js from delta24h and delta7d (already on portClean), bucketed into rally/bleed/bounce/pullback. So the §1 scan now reads top-down: total τ stat → 24h/7d τ strips → "📈 Week-long rally · 24h +1.2% / 7d +5.4%" pill → table where each row\'s emoji either matches the aggregate (book trending in unison) or diverges (mixed regime). Green-tinted pill for up days, red-tinted for down days, tooltip points to the per-row chips for the per-holding breakdown. Soft-omits when either window is null or within 0.1% of zero.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 Top positions: per-row day-vs-week trend emoji — instant shape read on every holding',
    body:
      'Iter 92 added day-vs-week trend tooltips to the §6 movers tables ("week-long rally" / "bounce off weekly low" etc). The same shape relationship was hidden in §1 — the 24h column and 7d column are right next to each other but the reader had to subtract signs in their head. Now every row in the top-10 positions table carries a tiny emoji inline beside the 7d %: 📈 week-long rally (both green), 📉 week-long bleed (both red), ↩️ bounce off weekly low (red 7d but green 24h — possible reversal), 🔻 pullback in uptrend (green 7d but red 24h — caution). Tooltip names the relationship and quotes both pcts. Soft-omits when either is within 0.1% of zero (no noise from sideways days). Zero new API calls; pure visual aid over data already present.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§6 Watch / Trim: inline "vs market" alpha chip — separates idiosyncratic moves from market-wide tides',
    body:
      'Both action strips ("🔭 Subnets to watch" / "🩸 Worst held this week") used to show only the subnet\'s raw 7d %. A +25% gainer when the whole market is +20% is much less interesting than +25% when the median subnet is -5%. Each row now carries an inline pill subtracting the market median 7d from the row\'s 7d, e.g. "+30.0 vs mkt" (green) or "-15.2 vs mkt" (red). The strip header also shows the market median 7d alongside its existing subtitle so the baseline is visible without hovering. For trim chips, the tooltip now reads "subnet-specific bleed" vs "market-wide weakness" so Jai can tell whether the trim case is structural or just market beta. New marketContext.median7dPct added to broader() — uses screener pct7d, zero extra API calls.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§6 Movers: dual-window 24h+7d heat columns with day-vs-week trend hints',
    body:
      'The "Biggest 24h movers" table previously showed only the day shape (and the 7d movers table only showed the week shape — separate stories on separate rows). It now carries both columns: 24h heat AND 7d heat side by side on every row, so each subnet\'s day and week shape can be read together. Same for the 7d movers table (it already had both columns from earlier). Critically, both tables now also carry a per-row tooltip naming the day-vs-week relationship: green 24h + green 7d → "week-long rally"; red 24h + red 7d → "week-long bleed"; green 24h + red 7d → "bounce off weekly low"; red 24h + green 7d → "pullback in uptrend". The 7d heat gradient is internally normalised to that table\'s own 7d values so the colour intensity stays meaningful even when 7d moves are an order of magnitude larger than 24h moves. Zero new API calls — pct7d already in the screener payload.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§6 Market context: paired "Your holdings" row — see at a glance whether you\'re leaning with the market',
    body:
      'Iter 90 added a single market-context strip (Tradeable / Median 24h / Median 24h vol / Breadth). This adds a paired second row computed over YOUR positions instead of the whole subnet universe — Positions count (and how many are price-covered), your median 24h %, median position size τ, and your own up/down breadth with the same risk-on / mixed / risk-off label. Each row carries an italic comparison hint inline ("↗ outperf" / "↘ underperf" / "= in line") that subtracts market median from portfolio median for you, plus a tooltip that names the delta in points. Visually distinguished — market row uses the accent tint, portfolio row is green-tinted with a green divider. So §6 now reads top-down: market state → your state vs market → 4 mover tables → 2 actionable hint tables. The full §6 deepening arc is now self-contained.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§6 Broader market: 4-cell market-context strip above the movers tables',
    body:
      'Every per-subnet figure in §6 (a +5% mover, a 200τ volume row) is ambiguous in isolation — is that a big day or a routine day? The new strip frames the typical day across tradeable subnets: Tradeable count (vs total active), Median 24h % (green/red by sign), Median 24h volume τ, and Breadth (up-count↑ down-count↓ + risk-on / mixed / risk-off label tuned at the 45/55 threshold). Median (not mean) so a single 200% pump doesn\'t skew the centre, and tradeable-only (>1τ daily volume, price > 0) so dead listings don\'t pin the median at 0. The whole strip carries a tooltip explaining the population. Sits directly under the §6 stats grid, before the CopyCsvButton, so it reads as a header for the four mover tables below. Capstone iter — closes out the row-chips → tfoot-totals → sparklines → market-context deepening arc.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 Volatility: 30-day daily-returns sparkline — different signal from balance shape',
    body:
      'The §1 30d and §2 90d sparklines (iter 87/88) show BALANCE shape. The new vol panel sparkline shows RETURNS shape — each daily return % bucketed into one of 8 unicode block levels, anchored symmetrically around zero so a flat day sits mid, a +5% day sits high, a −5% day sits low. So at a glance the row tells you which days were big up/down moves over the past 30 (volatility texture), while the balance sparklines tell you the cumulative trajectory those moves produced. Reads e.g. "30d ret ▄▄▅▃█▅▂▄▅▅▄▅▄▆▄▃▅▅▅▅▄▅▆▄▆▅▅▅▄▄  −5.4% / +6.6%". Sits directly above the existing 30d rolling σ SVG sparkline so the vol panel now reads: stat tiles → returns shape → σ trend → narrative hint. Soft-omits below 14 recent returns. Zero extra API cost — same returns array already powers the σ math.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§2 Drawdown: 90-day balance sparkline beneath the dd-row',
    body:
      'Iter 87 added a 30-day balance sparkline to §1. This adds the symmetric companion to §2\'s drawdown panel — a 90-day balance sparkline directly under the drawdown stat tiles (Peak / Days since peak / Max drawdown / Worst-dip window / Recovery time), anchored on the drawdown panel\'s longer time horizon. Same unicode block-char rendering, same .sparkline pill styling. So the dd-row reads: stats describe the worst dip + recovery, sparkline shows the actual shape that produced those stats, recovery bar shows where you sit now between trough and peak — three complementary risk views in one scan. Soft-omits below 14 daily snapshots (the same threshold the rest of §2 already gates on). Zero extra API cost; the same balanceSeries already powers the dd panel itself.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 Portfolio: 30-day balance sparkline inline beneath the stats grid',
    body:
      'Headline tiles (Total / USD / AUD / Positions) tell you WHAT you have but nothing about HOW you got here. New compact sparkline strip sits directly beneath the stats grid showing the last 30 daily balance snapshots as unicode block chars (▁▂▃▄▅▆▇█) plus the first→last τ delta inline. So at a glance the row tells you "you\'re at 8.62 τ, here\'s the 30-day trajectory that got you there, started at 7.94 τ". Hover spells out the full first/last balance + dates + min/max range. Soft-omits below 7 snapshots (cold-start wallets where the line wouldn\'t be meaningful). Zero chart library — pure JS bucketing into 8 levels by (v − min)/(max − min). Renders identically across browsers (block glyphs are universal Unicode). Pairs with iter 67/68 macro pulse pills below: pills say "+0.063 τ today" while the sparkline says "and here\'s the month-long trend that frames today\'s move". Zero extra API cost; balanceSeries was already loaded by the §2 panels.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§4 Per-subnet PnL attribution tfoot totals row — grand total across all subnets',
    body:
      'Completes the tfoot pattern across §1, §3, and now §4. The Per-subnet PnL attribution table shows top 5 contributors + bottom 3 detractors (the most interesting 8 rows) but the wallet may have touched dozens more subnets over time. New tfoot row sums Σ α value now · Σ Spent · Σ Sold · Σ PnL across the FULL perSubnet array — not just the visible 8. So the row tells you "the visible 8 represent X% of total PnL impact" by comparison with the headline numbers in the §4 stats grid. Reconciles directly with α value now / α PnL in the stats grid above: if they tie out, the math is consistent end-to-end; if they don\'t, something needs investigating. Hover spells out total subnet count ("across N subnets in the full perSubnet array"). Same .tfoot-totals styling — selector generalised to plain `tfoot tr.tfoot-totals td` so any future table gets the visual language free. Zero extra API/compute cost; perSubnet was already loaded.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§3 Per-validator breakdown tfoot totals row — Σ α held · Σ APY % · Σ τ/yr',
    body:
      'Iter 84 added a totals row to the §1 portfolio table. This completes the pattern on §3\'s per-validator breakdown: the same spreadsheet-style tfoot row now sits beneath the validator table, summing total α held + alpha-weighted APY across all rendered validators + total τ/yr at current α prices. Sum α held = the actual total alpha staked across the rendered top-10 validator rows (so the user can see "I have 1,247 α delegated in total"). Σ APY = alpha-weighted average (sum(apy × α) / sum(α with apy)), mirroring the §3 headline weighted-APY logic so the numbers tie out. Σ τ/yr = total dollar-equivalent yield in τ at current alpha prices. Hover spells out coverage ("across N of M rendered validators"). Same .tfoot-totals styling as iter 84 — extended the selector to cover .yield-table too so both tables share the visual language. Zero extra API/compute cost; all three inputs (alphaTokens, apy, alphaPriceTao) were already on each perPosition row.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 portfolio table tfoot totals row — Σ APY % · Σ τ/yr · Σ value at the bottom',
    body:
      'Per-row chips (iters 65/82/83) made each position legible but never asked "what does the whole portfolio look like in aggregate?". New tfoot row beneath the §1 portfolio table answers it in one line: portfolio-weighted APY (sum(taoValue × apy) / sum(taoValue with APY)) and the total τ/yr the wallet is throwing off, alongside the sum of α-token values + sum of % port the top-10 covers. So the table now reads top-down: position, position, position, … Σ — exactly how a spreadsheet user expects to see totals. The Σ APY chip uses the same visual language as the per-row APY chip (Σ prefix instead of 📈) so the rhyme is obvious. % port total tells you what fraction of the wallet the top-10 visible rows represent (e.g. "98.4%" = top-10 captures nearly all, "82.1%" = meaningful long-tail beyond top-10). Hover spells out coverage (e.g. "across 7 of 7 top positions with yield data"). Pairs with iter 67/68 macro pulse pills above the table — pills tell you what just happened, tfoot tells you what the wallet is currently set up to earn.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 portfolio row APY chip surfaces τ/yr inline — yield contribution at a glance',
    body:
      'The per-row APY chip (iter 65) reported the rate but parked the τ/yr earnings in the hover title only — so eyeballing the table told you everything except "which positions are actually paying the bills". Iter 83 surfaces the τ/yr value inline beside the % so the chip now reads "📈 APY 18.4% · 0.1517 τ/yr". Same chip, same color palette, just a muted secondary span (10px, 0.85 opacity) for the τ/yr so it complements the headline % rather than competing with it. Soft-omits below 0.0001 τ/yr (dust positions where the math is technically valid but visually noisy). Pairs naturally with iter 82\'s 7d-change-τ chip: now every row exposes both capital change (what the market did to your principal this week) AND yield income (what your delegations are throwing off per year) in the same scan — no hover, no §3 jump. Zero extra API/compute cost; taoValue × apy was already computed for the hover.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§1 portfolio row 7d τ change chip — translate the % move into actual τ gained/lost',
    body:
      'The §1 portfolio table\'s 7d column shows each position\'s percentage move but leaves the τ impact mental-arithmetic. New chip beside the % puts the absolute number right there: "+12.4% +1.83 τ" or "−8.1% −0.47 τ". Tinted green/red to match the heat-coloured cell. Hover spells out the implicit 7d-ago baseline ("current 16.42 τ vs 7d-ago 14.59 τ at +12.50%") so the math is auditable. A row showing +20% can look exciting on paper but if the position is 0.12 τ in size that\'s only +0.02 τ — the chip surfaces that proportionality so the eye can\'t conflate "big mover" with "big impact". Pairs with the iter 67/68 portfolio-level Δ pills which give the same view at the headline level. Soft-omits when |change| < 0.001 τ (dust noise). Zero extra API or compute cost — taoValue and pct7d were already on every position row.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§3 yield row "+X.XX τ/yr lift" chip beside Δ-to-best — turns abstract pp gap into concrete τ',
    body:
      'The §3 yield table\'s "Δ to best" column tells you how far a validator is behind the best on its subnet in percentage points — a -144.6pp gap is shocking but abstract. New green chip directly beside the Δ value translates it into concrete τ/yr terms: alphaTokens × alphaPriceTao × |deltaToBest|. So a row reading "-144.6pp +0.217 τ/yr" says "this position is leaving 0.217 τ a year on the table by not re-delegating" — a number you can actually weigh against gas / re-delegation friction. Soft-omits when the row is already at-or-above subnet best (no opportunity), or when the computed lift is under 0.001 τ/yr (noise floor). Hover spells out the multiplier inputs so the chip\'s math is auditable. Pairs naturally with the §5 top-action banner (iter 72), which calls out the single biggest such opportunity — the chip lets you see EVERY row\'s opportunity at a glance, not just the headline one. Zero extra API cost; all three inputs (alphaTokens, alphaPriceTao, deltaToBest) were already on each perPosition entry.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§4 Per-subnet PnL attribution — Copy-as-CSV export',
    body:
      'The §4 Per-subnet PnL attribution table was the only major data table without a one-click CSV export. The on-screen view shows top-5 contributors + bottom-3 detractors but the full perSubnet array carries every netuid the wallet has ever touched — useful for spreadsheet sort/filter, tax review, or cross-checking against external bookkeeping. New Copy-as-CSV button on the table header exports all rows (sorted desc by PnL τ) with columns Netuid, Subnet, α value now τ, Spent τ, Sold τ, PnL τ, 7d α price %. Picks up the iter 79 trend chip data in the 7d column so the export carries both the static PnL number and the directional context. Closes the CSV quintet → sextet: §1 Portfolio / §2 Tax-year / §2 Drawdown / §3 Yield / §4 PnL attribution / §6 Broader-Market all have one-click clipboard export now.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§4 per-subnet PnL row 7d price-trend chip — see the why behind each PnL number',
    body:
      'The Per-subnet PnL attribution table tells you which subnets are making and losing τ, but the PnL number alone can\'t answer "is this still bleeding or has it turned?". New micro-chip in each PnL cell shows the position\'s 7d alpha-price direction (↗ green when ≥+2%, ↘ red when ≤-2%, → muted in between). Hover for the exact 7d % move. A "+0.83 τ PnL" row with a ↘ -8.4% chip says "you\'re still up on the trade overall but it\'s been bleeding for the past week" — meaningfully different from a "+0.83 τ" row with a ↗ chip in a way no flat PnL number could communicate. Same chip language and ±2% threshold as the §3 weightedApySeries direction logic and the §1 row-level trend chips. Zero extra API cost — pct7d is pulled from the screener row already fetched for §1 and §6. Soft-omits when a subnet has no screener entry (rare: fully de-registered subnets with residual spend history).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§6 Biggest 7d movers table — see the week\'s narrative alongside today\'s',
    body:
      'The Broader market section already showed the biggest 24h movers but had no companion for the weekly view. A subnet may be flat today and yet on a multi-day tear (or bleed) — a 24h snapshot alone misses that story. New "Biggest 7d movers" sibling table directly under the 24h table, sorted by |7d %| with both windows side-by-side per row (heat-coloured by sign, anchored to that table\'s own max-abs for visual scale). Both the screener-driven tradeability filter (>1 τ daily volume, non-zero price) and the SubnetLink hover behaviour are shared with the 24h table. The broader-market CSV export also gains a "Top movers 7d" section between the 24h and volume sections, so a single paste hands the spreadsheet user all three views. Caps the §6 deepening arc: iter 63 added 24h winners/losers chips on §1, iter 64 added §6 subnets-to-watch, iter 78 closes the loop with the parallel 7d movers table on §6 itself.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§3 portfolio-level weighted APY trend — 1d / 7d / 30d bars beside the headline',
    body:
      'The Weighted APY tile reports a single 30d-preferred number — easy to read but blind to which direction the wallet is heading. New compact trend strip directly underneath the §3 stats grid shows the same alpha-weighted average computed across the 1d, 7d, and 30d windows as three labeled mini-bars. Each bar is heat-coloured by tier (green if above 30d baseline, red below, muted around it). A ↗/↘/→ arrow at the right of the strip + a coloured left-stripe summarise the direction at a glance. Hover for the per-window % values. Coverage floor of 50% per window means the chart only shows windows where the majority of α-by-weight returned a real APY in the yield response — partial coverage gets dropped rather than misleadingly extrapolated. Caps the §3 deepening arc: iter 74 lifted the top yielders out of the table, iter 76 added per-row time-trend dimension, iter 77 lifts the whole-portfolio time-trend to the headline.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '§3 per-validator APY trend chip — see at a glance which validators are speeding up or slowing down',
    body:
      'The per-validator yield table reports each validator\'s 30d APY (preferred for stability) but a flat number can\'t tell you whether the validator is trending up, holding steady, or fading. New micro-chip appended to each row\'s APY cell shows direction (↗ green, ↘ red, → muted) plus the 1d-vs-30d delta in percentage points. Hover for the full 30d / 7d / 1d breakdown. A ↗ +5pp chip on a validator says "today is paying meaningfully more than the trailing month" — useful when comparing two validators with similar 30d numbers but different momentum. Suppressed on fallback rows (where the report uses the subnet median because the specific validator wasn\'t in the yield response) since a trend on someone else\'s median would be misleading. Zero extra API cost — the apy1d/apy7d fields were already in the per-netuid yield response, just not exposed on perPosition until now.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Reliability',
    title: 'Drawdown + volatility panels now render even when tax data is missing',
    body:
      'Wallets that have on-chain activity but no Taostats tax-report data (a real state for many small/new coldkeys — "no_tax_data") were losing the entire §2 PnL section bar a one-line note. But the drawdown panel, volatility panel, and recovery bar are all powered by /api/account/history/v1 (balance snapshots, an independent endpoint) — they have nothing to do with tax data. They were just nested inside the same `gt.available` JSX wrapper. This release moves them out: the three panels now sit at section level, so they render whenever their own data is available, regardless of tax-data state. Net effect: wallets that previously showed only the alpha-position PnL fallback now also get full drawdown stats, recovery progress bar, vol metrics, rolling σ sparkline, and best/worst-day callout. Caps the iter 73 reliability arc — the tax retry was step one (fewer cold-start cascades), this is step two (when tax DOES fail, the other panels survive).',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '🏆 Top yielders chips on §3 — the highest-APY positions, lifted out of the table',
    body:
      'Symmetric to iter 72\'s top-action banner: the per-validator yield table is great for full breakdown but hides the most useful answer ("which of my positions is actually earning the most?") in the middle of a sortable list. New top-apy-strip above the table picks the 3 highest-APY positions (filtered to apy > 0 and α > 0), sorted descending, rendered as accent-tinted pills with sn-id, subnet name, APY%. Each chip links to that subnet\'s taostats metagraph page; hover surfaces validator name, α held, and approximate τ/yr earnings at current price. Fallback APYs (subnet-median when your validator isn\'t in the yield response) get a "~" suffix so the signal stays honest. Soft-omits when fewer than 2 positions have APY data, keeping the section clean for new wallets.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Reliability',
    title: 'Drawdown / volatility panels no longer disappear under Taostats load',
    body:
      'Vercel cold starts that landed during high Taostats traffic were collapsing §2 entirely — drawdown panel, vol panel, recovery bar all soft-omitted because /api/account/history/v1 paginated calls would fail mid-stream and the whole series was discarded. Two reliability tweaks: the taoGet retry helper now retries on ANY 5xx (not just 503) and on transport errors (network resets), keeping the existing 1.5s + 3.5s backoff. AND getBalanceHistory now returns partial data when a mid-pagination page fails — if page 1 succeeded the wallet already has ~200 daily snapshots, plenty for §2 math, no reason to throw the whole series away because page 4 timed out. Net effect: §2 panels render reliably even under degraded Taostats conditions. Same data when the upstream is healthy, robust fallback when it isn\'t.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: 'Top-action banner on §5 — your single highest-priority move, lifted out of the list',
    body:
      '§5 Recommendations used to be a flat ordered list — even the most important action shared visual weight with the fifth-most. New banner promotes r.items[0] (already ordered by severity + impact in lib/report.js) to a hero card above the list: accent-tinted background, ▶ left-stripe, "🎯 TOP ACTION" tag, larger observation text, accent-coloured action line. The remaining recs continue below under "Other recommendations" with their numbering correctly continuing from 2. Soft-reverts to the flat list when only one rec exists (no point promoting when there\'s nothing to demote). Zero extra compute — pure presentation layer on existing data. Together with iter 69 (concentration) + iter 70 (recovery bar) + iter 71 (trim strip), the report now leads with the single sharpest "what to do next" signal on every wallet.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Report',
    title: '"Worst held this week" callout on §6 — counterpart to subnets-to-watch',
    body:
      'Iter 64 added a green "🔭 Subnets to watch" strip on §6 (top 7d non-portfolio gainers — what\'s running you don\'t own yet). This is the direct mirror: a red "🩸 Worst held this week" strip below it, listing the top 3 7d-losing subnets among positions you currently hold. Each chip shows the subnet + 7d % decline, links to its taostats metagraph, and hovers reveal your position size + % of portfolio context. Pure JS off existing screener data + portfolio positions — zero extra API cost. Together with the new concentration chip (§1) and recovery progress bar (§2), the report now offers a complete risk-action picture: "watch this · trim this · brace for this." Soft-omits when no held positions have negative 7d performance.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Report',
    title: 'Drawdown recovery progress bar on §2 — "you\'re X% climbed back from the worst dip"',
    body:
      'The §2 drawdown panel reports the magnitude of the worst dip ("−12% peak-to-trough") and how long the recovery took, but never showed where the user is RIGHT NOW between the trough and the peak. New horizontal progress bar below the dd-row tiles fills based on (current − trough) / (peak − trough): 30% recovered, 75% recovered, fully recovered. Tiered colour (red → orange → green-tinted → solid green) so a glance tells you how close you are to whole. When recovered, the centre label switches to "Fully recovered" or "Fully recovered · +X.X% beyond peak" (new high). Soft-omits when the wallet has no observable max drawdown. Pairs naturally with iter 69\'s concentration chip — both speak to where you sit on the risk curve. Zero extra API cost, pure JS off existing dd.maxDrawdownPeakTao / maxDrawdownTroughTao / currentTao.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Risk',
    title: 'Concentration warning chip on §1 — "this one position drives your portfolio"',
    body:
      'When any single position is ≥40% of total τ, a risk chip surfaces between the d24 macro-pulse band and the §1 table: "⚠ High concentration — sn{X} {Name} is {Y}% of total τ". Escalates to "🚨 Critical concentration" with red tint at ≥60%. Computed in a single pass over the existing top10 set (zero extra API cost, zero extra compute). Hover for the rationale: a move in this one subnet drives most of the portfolio swing, so the user can decide whether they want that idiosyncratic exposure or would rather trim. Soft-omits below 40% so a balanced wallet sees no chip at all — the absence is itself a positive signal.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '7d Δ pill alongside the 24h pill — completes the "macro pulse" band above §1',
    body:
      'The 24h portfolio Δ pill shipped yesterday now has a 7-day companion sitting beside it. Same shape — arrow + label + τ + percent + USD/AUD — just looking back a week. The two pills together form a "macro pulse" band above the §1 table: how did today go vs how is the week going. Both pills are independently green/red tinted, so a green 24h next to a red 7d tells a different story than two greens. Compute is generalised — a single helper picks the closest snapshot to (latest − window) with adaptive slop (half the window, capped at 36h) so the 7d pill cleanly handles wallets with sparse history. Soft-omits independently when either window can\'t find a clean snapshot. Zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'UX',
    title: '24h Δ pill above §1 portfolio table — your "you\'re up/down today" anchor',
    body:
      'Below the Total/USD/AUD/Positions strip on §1, a new pill chip surfaces the portfolio\'s 24-hour change in raw τ + percent + USD/AUD equivalents. Green-tinted when up, red when down, arrow indicating direction. Computed off the same /api/account/history/v1 daily snapshots already loaded for §2 — the prior reference point is the snapshot closest to (latest − 24h), giving a stable day-over-day comparison. Hover the chip for the exact prior → current balance + snapshot dates. Adds an immediate emotional hook so you know how the day went before scrolling to a single table. Soft-omits on wallets with fewer than 2 snapshots. Zero extra API cost.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Report',
    title: 'Best/worst day callout on §2 — calendar-anchored τ moves give the percent stats a face',
    body:
      'The volatility panel already shows the best-day and worst-day percentage, but a percent is abstract — knowing your wallet moved +0.42 τ on Mar 14 hits harder. New strip below the volatility panel splits into two large tiles: a green "🚀 Best day" with the τ delta + calendar date, and a red "🩸 Worst day" with the same. Computed in the same walk over the balance series that already powers daily returns (zero extra compute, zero extra API cost). Hover each tile for the exact start→end balance on that day so you can see what context the move happened in. Soft-omits on wallets with <14 daily snapshots, same threshold as the rest of the volatility panel.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-25',
    tag: 'Report',
    title: 'Per-position APY chip on §1 — every portfolio row now shows what it\'s actually earning',
    body:
      'Each row in §1 Portfolio now gets a third chip under the α price column: "📈 APY X.X%" — the alpha-weighted effective APY for that subnet, aggregated across however many hotkeys the wallet is delegated to. Same yield data §3 already loads from Taostats /api/dtao/validator/yield/latest/v1 — just surfaced inline so the user doesn\'t have to cross-reference §1 to §3 to know which positions are pulling weight. Hover the chip for the exact percent + the τ/yr the position is throwing off at current price. Italic + muted variant when the figure is the subnet median because the user\'s specific validator wasn\'t in the yield response (signal vs noise). Zero extra API cost — pure JS off existing yield.perPosition.',
    links: [{ label: 'About', href: '/about' }],
  },
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
