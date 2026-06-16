// Taostats + Bittensor data fetchers.
// Endpoints chosen to mirror Jai's production weekly pipeline
// (/home/Jai/bittensor-weekly/lib/api_refresh.py) — these are the ones
// proven to work and contain the data we need.

const TAOSTATS_BASE = 'https://api.taostats.io';

function authHeaders() {
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) throw new Error('TAOSTATS_API_KEY missing');
  return { Authorization: key, Accept: 'application/json' };
}

// iter 143: per-request timeout. Without this, a stalled Taostats endpoint
// (observed 2026-06-15 — /api/account/latest/v1 hung indefinitely, took down
// every /api/report build because the Promise.all in buildReport awaited a
// fetch that never resolved) eats the full Vercel 60s maxDuration and surfaces
// as FUNCTION_INVOCATION_TIMEOUT 504 with no body. With a 15s AbortController
// timeout, a single hanging endpoint throws cleanly in 15s and the report
// route returns 500 JSON with verdictFallback intact. Configurable via
// TAOSTATS_TIMEOUT_MS env (e.g. 8000 for tighter fail-fast on /api/insights
// which has a tighter time budget).
const TAOSTATS_DEFAULT_TIMEOUT_MS = Number(process.env.TAOSTATS_TIMEOUT_MS) || 15000;

// iter 144: per-endpoint timeout override map. Iter 145 (2026-06-16 00:15Z)
// tuned the light-endpoint caps upwards after the retroactive iter 142
// verify exposed that Vercel's egress IPs see substantially higher Taostats
// latency than the VPS baseline iter 144's numbers were calibrated against.
// Specifically, after the 2026-06-15 multi-hour Taostats outage cleared, a
// VPS direct probe of /api/price/latest/v1 returned 200 in 0.22s × 3 samples,
// but five consecutive POSTs to the live /api/report endpoint on Vercel ALL
// timed out the price call at exactly 5000ms (a sixth retry post-rate-limit
// reproduced the same 5.5s timeout). The 5s cap was based on a "single record,
// <1s normal" assumption that holds from the VPS but not from Vercel's egress
// IP range, which appears either geo-routed differently or post-outage-throttled
// by Taostats. Iter 145 fix: bump the 3 light/medium-latest endpoints to
// budgets that reflect Vercel-side reality without giving up the fail-fast
// principle. Heavy paginated endpoints unchanged (the 20-25s budgets were
// derived from observed Pro-plan cold-cache behavior on healthy days, which
// matched VPS and Vercel-side observation, so no calibration drift there).
// Lookup is exact path match — the same string that taoGet's `path` arg uses.
// Unknown paths fall through to TAOSTATS_DEFAULT_TIMEOUT_MS (15s — iter 143's
// proven safety floor). Per-endpoint override via env is intentionally NOT
// supported here to keep the map auditable in one place; TAOSTATS_TIMEOUT_MS
// still raises/lowers the unmapped-path fallback for emergency tuning.
const TAOSTATS_PATH_TIMEOUTS = {
  '/api/price/latest/v1': 10000,
  '/api/account/latest/v1': 12000,
  '/api/account/history/v1': 20000,
  '/api/transfer/v1': 20000,
  '/api/accounting/tax/v1': 25000,
  '/api/delegation/v1': 20000,
  '/api/dtao/coldkey_alpha_shares/latest/v1': 18000,
  '/api/dtao/validator/yield/latest/v1': 15000,
};

function timeoutFor(path) {
  return TAOSTATS_PATH_TIMEOUTS[path] ?? TAOSTATS_DEFAULT_TIMEOUT_MS;
}

// Test-only accessor so iter-144 smoke can assert the override map without
// reaching into module internals.
export function _getTaostatsTimeoutFor(path) {
  return timeoutFor(path);
}

// iter 149: per-endpoint retry-wait schedule. Iter 147 verify proved that
// /api/accounting/tax/v1 was 429-throttling on Vercel-egress for 6 of Jai's 7
// pinned coldkeys (Subnets tax/v1 returns 312 rows from VPS direct but the
// shared-outbound-IP Vercel call gets "Rate Limited. Try Again Later." 429s).
// The default [1500, 3500] retry schedule already retries 429s but only twice,
// with ≤5s of cumulative wait — short enough that the Taostats per-IP-range
// throttle window (apparently >5s for Vercel's egress range) hadn't reset by
// the time attempt 3 fired. Tax/v1 gets a wider schedule [1500, 4000, 10000]
// = 3 retries, ~15.5s cumulative wait, designed to outwait one full throttle
// reset window. Worst case fits the 25s per-attempt timeout + ~4s avg real
// latency × 4 attempts ≈ 35s, well under Vercel's 60s maxDuration. The other
// endpoints keep the default schedule — they 429 less aggressively in practice
// (delegation/v1 + alpha_shares 429s seen in iter 147 sweep are a separate
// fanout-burst problem better fixed by sequence rather than wider retries).
// Iter 153 extends the wider schedule to /api/account/history/v1 and
// /api/transfer/v1 — the two endpoints the iter-151 free-path fallback hits
// when paid tax/v1 is exhausted. Iter 152 caught the free-path itself
// 429-ing on Vercel-egress (Mum_root: "Taostats /api/account/history/v1 →
// 429" surfaced after the catch fired), so the same outwait-the-throttle-
// window treatment is needed on the free path or the fallback can't land
// the iter 142 verdict on cold-throttled wallets.
// Iter 156 extends the wider schedule to /api/delegation/v1 (direct unblock
// for Mantat) and /api/price/latest/v1 (direct unblock for Mum_subnets).
// Iter 155 verify proved that the iter 155 top-level Phase B serialisation
// MOVED Mum_subnets's blocker forward — was alpha_shares 429 (iter 150),
// now is /api/price/latest/v1 429 (iter 155 verify probe, 6.1s elapsed),
// because price is the FIRST Taostats call in Phase B and cold-start
// invocations have no cached price to short-circuit it. Mantat's blocker
// remained /api/delegation/v1 429 because getDelegationHistory paginates
// within a sequential while-loop (already serialised internally) and the
// per-page retry budget is what's exhausting — Mantat at 12.28τ has many
// pages of delegation history, each fetch consuming a throttle bucket.
// Both endpoints get the same [1500, 4000, 10000] schedule that worked
// for tax/v1 (iter 149) and free-path (iter 153). Brittle-risk on Mum_mantat
// (verified at 56s in iter 154, near Vercel's 60s ceiling): the price
// widening only adds latency on COLD-START instances with no warm price
// cache (subsequent calls hit the 60s stale-OK cache at lib/taostats.js:202
// and short-circuit retries entirely); the delegation widening only fires
// for wallets that actually paginate delegation history (Mum_mantat has
// none, per iter 154 lifetimeIn=0/lifetimeOut=0), so it doesn't add
// budget to Mum_mantat's probe.
// Unknown paths fall through to TAOSTATS_DEFAULT_RETRY_WAITS.
const TAOSTATS_DEFAULT_RETRY_WAITS = [1500, 3500];
const TAOSTATS_PATH_RETRY_WAITS = {
  '/api/accounting/tax/v1': [1500, 4000, 10000],
  '/api/account/history/v1': [1500, 4000, 10000],
  '/api/transfer/v1': [1500, 4000, 10000],
  '/api/delegation/v1': [1500, 4000, 10000],
  '/api/price/latest/v1': [1500, 4000, 10000],
};

function retryWaitsFor(path) {
  return TAOSTATS_PATH_RETRY_WAITS[path] ?? TAOSTATS_DEFAULT_RETRY_WAITS;
}

// Test-only accessor so iter-149 smoke can assert the override map without
// reaching into module internals.
export function _getTaostatsRetryWaitsFor(path) {
  return retryWaitsFor(path);
}

async function taoGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TAOSTATS_BASE}${path}${qs ? `?${qs}` : ''}`;
  const timeoutMs = timeoutFor(path);
  // Free-tier key throttles Vercel's shared outbound IP harder than direct VPS
  // calls — even sequential bursts of 2-3 sub-second calls trip 429. Retry on
  // 429/5xx (or transport error) using per-path retry schedule (iter 149) —
  // tax/v1 gets a wider [1500, 4000, 10000] backoff after iter 147 proved the
  // default [1500, 3500] wasn't long enough to outwait Vercel-egress throttle
  // windows. Everything else keeps the default schedule.
  const waits = retryWaitsFor(path);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(url, { headers: authHeaders(), signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      // iter 143: abort errors (per-request timeout fired) do NOT retry —
      // a stalled endpoint will stall again on retry, burning the full
      // maxDuration budget. Fail-fast instead so the caller's .catch()
      // wrapper or the route-level error envelope kicks in within ~15s,
      // leaving budget for the rest of the report.
      const isAbort = e?.name === 'AbortError' || /abort/i.test(e?.message || '');
      if (isAbort) {
        console.warn(`[taostats] ${path} → timeout after ${timeoutMs}ms (fail-fast, no retry)`);
        throw new Error(`Taostats ${path} → timeout after ${timeoutMs}ms`);
      }
      if (attempt < waits.length) {
        console.warn(`[taostats] ${path} → transport error '${e.message}' (retry ${attempt + 1}/${waits.length} in ${waits[attempt]}ms)`);
        await new Promise((res) => setTimeout(res, waits[attempt]));
        continue;
      }
      throw e;
    }
    clearTimeout(timer);
    if (r.ok) return r.json();
    const body = await r.text();
    const retryable = r.status === 429 || r.status >= 500;
    if (retryable && attempt < waits.length) {
      console.warn(`[taostats] ${path} → ${r.status} (retry ${attempt + 1}/${waits.length} in ${waits[attempt]}ms)`);
      await new Promise((res) => setTimeout(res, waits[attempt]));
      continue;
    }
    console.warn(`[taostats] ${path} → ${r.status}: ${body.slice(0, 200)}`);
    throw new Error(`Taostats ${path} → ${r.status}: ${body.slice(0, 200)}`);
  }
}

// iter 146: server-side TAO price cache. Iter 145 verify exposed that Vercel's
// egress to /api/price/latest/v1 stalls past 10s on healthy days even when the
// VPS direct probe returns 200 in <300ms — a stable per-IP latency floor, not
// a Taostats outage. Caching the price collapses that entire failure mode on
// the hot path: warm Vercel lambdas serving a multi-wallet sweep or a refresh
// burst hit the cache instead of re-paying the Vercel-egress tax per request.
// TAO price barely moves second-to-second (sub-1% intraday volatility is
// typical), so 60s freshness costs nothing user-visible. Cache lives at module
// scope so it survives warm-instance reuse but resets cleanly on cold starts —
// no cross-deploy poisoning risk.
//
// Stale-while-error fallback (up to 5min): if a refetch fails AND we still
// hold any non-expired stale value (older than 60s but younger than 5min),
// serve the stale value with a warning rather than failing the entire report.
// At 5min staleness the report deserves to fail loudly. Threshold tuned so a
// 4.5h outage like 2026-06-15 can't masquerade as fresh data.
const PRICE_FRESH_MS = 60_000;
const PRICE_STALE_OK_MS = 5 * 60_000;
const priceCache = { value: null, fetchedAt: 0 };

// Test-only accessors so iter-146 smoke can assert cache behavior without
// reaching into module internals.
export function _resetTaoPriceCache() {
  priceCache.value = null;
  priceCache.fetchedAt = 0;
}
export function _getTaoPriceCacheState() {
  return { value: priceCache.value, fetchedAt: priceCache.fetchedAt };
}

// Live TAO/USD price (cached 60s fresh, 5min stale-while-error).
export async function getTaoPrice() {
  const now = Date.now();
  if (priceCache.value !== null && now - priceCache.fetchedAt < PRICE_FRESH_MS) {
    return priceCache.value;
  }
  try {
    const j = await taoGet('/api/price/latest/v1', { asset: 'tao' });
    // Response shape: { data: [{ price: "278.19", ... }] }
    const row = j?.data?.[0];
    if (!row) throw new Error('Empty price response');
    const price = Number(row.price);
    priceCache.value = price;
    priceCache.fetchedAt = now;
    return price;
  } catch (e) {
    if (priceCache.value !== null && now - priceCache.fetchedAt < PRICE_STALE_OK_MS) {
      const ageS = Math.round((now - priceCache.fetchedAt) / 1000);
      console.warn(`[taostats] price fetch failed (${e.message}) — serving stale cached value $${priceCache.value} (${ageS}s old)`);
      return priceCache.value;
    }
    throw e;
  }
}

// All alpha-token holdings for a coldkey, grouped by (netuid, hotkey).
// Returns: [{ netuid, hotkey, shares, alpha, alphaTokens }]
// alphaTokens = alpha / 1e9 (Taostats stores rao = 1e-9 alpha).
export async function getHoldings(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    const j = await taoGet('/api/dtao/coldkey_alpha_shares/latest/v1', {
      coldkey,
      page,
      limit: 200,
    });
    const rows = j?.data || [];
    for (const r of rows) {
      const alpha = Number(r.alpha || 0);
      out.push({
        netuid: r.netuid,
        hotkey: r.hotkey?.ss58,
        shares: r.shares,
        alpha,
        alphaTokens: alpha / 1e9,
        blockNumber: r.block_number,
        timestamp: r.timestamp,
      });
    }
    if (rows.length < 200) break;
    page += 1;
    if (page > 20) break; // safety
  }
  return out;
}

// All delegation events (stake/unstake/move) for a coldkey, used for PnL.
// Returns flattened: [{ timestamp, netuid, action, alpha, tao, taoUsd }]
export async function getDelegationHistory(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    const j = await taoGet('/api/delegation/v1', {
      nominator: coldkey,
      page,
      limit: 200,
    });
    const rows = j?.data || [];
    for (const r of rows) {
      out.push({
        timestamp: r.timestamp,
        blockNumber: r.block_number,
        netuid: r.netuid,
        action: r.action, // 'DELEGATE' | 'UNDELEGATE' | etc
        alpha: Number(r.alpha || 0) / 1e9,
        tao: Number(r.tao || 0) / 1e9,
        taoUsd: r.tao_usd != null ? Number(r.tao_usd) : null,
        hotkey: r.hotkey?.ss58 || r.delegate?.ss58,
        extrinsicId: r.extrinsic_id,
      });
    }
    if (rows.length < 200) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

// Per-validator yield (APY) for one subnet.
// Returns: [{ hotkey, apy1d, apy7d, apy30d }]
//
// Per-netuid in-memory memo cache. Validator yields are NETWORK-level data
// (identical across coldkeys for the same subnet), so a single fetch warms
// every subsequent caller. The 6 fetched windows (1h / 1d / 7d / 30d) are
// rolling averages updated by Taostats on epoch boundaries — 10 min is well
// inside that update cadence so the cache cannot serve a stale planning
// signal. Lives on globalThis so the cache survives between requests within
// the same Vercel instance, mirroring the reportCache pattern in report.js.
// Cold starts wipe it — fine; first user on a fresh instance pays the fetch,
// subsequent coldkeys on that instance hit memo. This dampens the 429 burst
// from yieldSection's per-netuid parallel fanout (the Standard plan key was
// being throttled across iter 129/130/131/132 verifies — 4 consecutive 429s
// at 01:42Z, 02:44Z, 04:08Z on /api/delegation/v1 collisions with this
// endpoint's fanout).
const VALIDATOR_YIELD_TTL_MS = 10 * 60 * 1000;
const validatorYieldCache =
  globalThis.__validatorYieldCache || (globalThis.__validatorYieldCache = new Map());

export async function getValidatorYield(netuid) {
  const key = String(netuid);
  const entry = validatorYieldCache.get(key);
  if (entry && Date.now() - entry.at < VALIDATOR_YIELD_TTL_MS) {
    return entry.data;
  }
  const j = await taoGet('/api/dtao/validator/yield/latest/v1', { netuid });
  const rows = j?.data || [];
  const data = rows.map((r) => ({
    hotkey: r.hotkey?.ss58,
    name: r.name,
    apy1h: r.one_hour_apy != null ? Number(r.one_hour_apy) : null,
    apy1d: r.one_day_apy != null ? Number(r.one_day_apy) : null,
    apy7d: r.seven_day_apy != null ? Number(r.seven_day_apy) : null,
    apy30d: r.thirty_day_apy != null ? Number(r.thirty_day_apy) : null,
  }));
  validatorYieldCache.set(key, { at: Date.now(), data });
  // cheap LRU cap — 128 netuids is well above the live count (~80)
  if (validatorYieldCache.size > 128) {
    const firstKey = validatorYieldCache.keys().next().value;
    validatorYieldCache.delete(firstKey);
  }
  return data;
}

// Test-only: forced cache reset (for smoke tests + debug invocations).
export function _resetValidatorYieldCache() {
  validatorYieldCache.clear();
}

// Yield lookup helper: returns APY for a (netuid, hotkey) pair, or subnet
// median if that specific hotkey isn't in the response.
export async function getApyFor(netuid, hotkey) {
  try {
    const rows = await getValidatorYield(netuid);
    const pick = (r) => r.apy30d ?? r.apy7d ?? r.apy1d ?? r.apy1h;
    const m = rows.find((r) => r.hotkey === hotkey);
    if (m) {
      const v = pick(m);
      if (v != null) return v;
    }
    const all = rows.map(pick).filter((v) => v != null).sort((a, b) => a - b);
    if (all.length === 0) return null;
    return all[Math.floor(all.length / 2)]; // median
  } catch {
    return null;
  }
}

// Tax-report rows for a coldkey over the last `days` days.
// Same data source the weekly Bittensor FINAL doc uses (the "Wallet Balances"
// tab is populated from this endpoint via import_transactions.py).
// Standard-plan API key required.
// NB: endpoint ignores `limit` and `page` and always returns the full set
// for the given window — do NOT loop, or transfers will double-count.
export async function getTaxReport(coldkey, days = 365) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return getTaxReportRange(coldkey, start, end);
}

// Tax-report rows for an explicit [start, end] window. The /api/accounting/tax/v1
// endpoint caps each request at 12 calendar months, so callers wanting a wider
// view (e.g. tax-year split across two FYs) must issue one call per FY.
// start/end accept Date objects or YYYY-MM-DD strings.
//
// FREE_PNL=1 reroutes to getTaxReportRangeFree(), which rebuilds the same row
// shape from /api/account/history/v1 + /api/transfer/v1 (both available on the
// FREE Taostats tier). Iter 105 probe confirmed the mixed-semantics
// reconstruction matches paid net_profit to the rao on 30d windows.
//
// NB iter 109: free path now falls back to the OLDEST available history
// snapshot when no row exists ≤ start (the iter-107 regression on young
// coldkeys like subnets 5EKFph…). Transfers in that mode are clipped to the
// effective start (== oldest snapshot ts) so the PnL formula stays internally
// consistent.
//
// Iter 151: paid /api/accounting/tax/v1 now auto-falls-back to the free path
// when it throws after retries are exhausted. Iter 150 verify sweep on 2026-
// 06-16 confirmed that even iter 149's widened [1500, 4000, 10000] retry
// schedule (~15.5s cumulative) wasn't enough for 3 of Jai's 5 unverified
// coldkeys (Mum_root, Mum_smf, Mum_mantat) — the Taostats per-IP throttle
// window on Vercel's egress range sometimes exceeds 15.5s when the IP is
// cold-throttled. Rather than waste budget on a 4th retry, we treat the
// throw as a signal that paid tax/v1 is unavailable for this caller right
// now and reconstruct from /api/account/history/v1 + /api/transfer/v1
// (both rate-limit-friendlier on the same Vercel-egress IP, both confirmed
// working in iter 150 when tax/v1 was throwing on the same wallet at the
// same moment). FREE_PNL=1 stays as the explicit opt-in for callers who
// want to skip paid tax/v1 entirely. FREE_PNL_FALLBACK=0 disables the
// auto-fallback if Jai needs to expose the raw paid-tax/v1 throw again
// for diagnostics. Output shape is identical (iter 105 probe matched to
// the rao), so downstream consumers (pnlGroundTruth, taxYearSection) see
// no shape difference between the two paths.
export async function getTaxReportRange(coldkey, start, end) {
  if (process.env.FREE_PNL === '1') {
    return getTaxReportRangeFree(coldkey, start, end);
  }
  const fmt = (d) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
  try {
    const j = await taoGet('/api/accounting/tax/v1', {
      token: 'TAO',
      date_start: fmt(start),
      date_end: fmt(end),
      coldkey,
    });
    return j?.data || [];
  } catch (e) {
    if (process.env.FREE_PNL_FALLBACK === '0') throw e;
    // Auto-fallback. Log the underlying paid-path error to server logs so
    // Vercel runtime logs still surface the root cause for diagnostics —
    // downstream callers just see a successful free-path row set.
    try {
      console.warn(
        `[taostats] paid /api/accounting/tax/v1 threw for ${coldkey} (${String(e?.message || e)}) — falling back to free-path reconstruction`,
      );
    } catch {}
    return getTaxReportRangeFree(coldkey, start, end);
  }
}

// Free-tier equivalent of getTaxReportRange. Reconstructs the same row set
// (snapshot rows + transfer_in/transfer_out rows) from /api/account/history/v1
// + /api/transfer/v1 — both available on the FREE Taostats key.
//
// Output shape MUST match paid /api/accounting/tax/v1 so existing consumers
// (lib/report.js → pnlGroundTruth, taxYearSection) don't need to change:
//   - Snapshot row:  { transaction_type: null,  total_balance, date, ... }
//   - Transfer in:   { transaction_type: 'transfer_in',  credit_amount, date }
//   - Transfer out:  { transaction_type: 'transfer_out', debit_amount,  date }
// All amounts in TAO (not rao). Snapshot rows use rootOnly reconstruction
// (balance_free + balance_reserved + balance_staked_root) to mirror paid
// tax/v1's starting_balance semantics — iter 105 probe proved this matches to
// the rao. (Paid tax/v1 is internally inconsistent — excludes alpha-as-tao on
// starting, includes it on current. We mirror that exactly: snapshot rows
// use rootOnly, but current_balance still comes from getLatestBalance() which
// pulls balance_total = full = root + alpha-as-tao.)
//
// daily_income is DERIVED (iter 112): per UTC date, daily_income equals the
// rootOnly delta between consecutive end-of-day snapshots minus net transfers
// on that day. This populates §2's sparkline under free mode — without it the
// chart goes blank because paid tax/v1 ships daily_income as a server-computed
// field that history/v1 doesn't expose. rootOnly excludes alpha-as-tao, so the
// diff approximates root-network staking yield + alpha→root unstake events
// (alpha price moves don't contaminate). The first day in the window has no
// daily_income (it's the baseline). Per-day grouping collapses the ~12-rows-
// per-day history feed (epoch-frequency) into one row per UTC date so the
// sparkline shows true daily deltas rather than per-epoch noise.
export async function getTaxReportRangeFree(coldkey, start, end) {
  const RAO = 1e9;
  const toDate = (d) => (typeof d === 'string' ? new Date(d) : d);
  const startD = toDate(start);
  const endD = toDate(end);
  const dateStr = (ts) => new Date(ts).toISOString().slice(0, 10);

  // 1. Starting-balance snapshot — latest history row whose timestamp <= start.
  //    Same algorithm as the iter-105 probe. history/v1 returns rows
  //    timestamp-DESC by default, so we walk pages and break the first time we
  //    see a row at or before `start`. Track the OLDEST row seen as a fallback
  //    for young coldkeys whose history doesn't reach back to `start` — iter
  //    107 regressed §2 PnL on the subnets coldkey because that path emitted
  //    no snapshot at all and downstream tagged the report no_balance_snapshots.
  let startingRow = null;
  let oldestSeenRow = null;
  let newestSeenRow = null;
  // iter 112: collect every history row visited during the page walk for the
  // per-day sparkline diff. These rows are all in [startingRow.ts, endD] so
  // they cover the effective reconstruction window naturally.
  const historyRowsInWindow = [];
  let page = 1;
  outer: while (page <= 20) {
    const j = await taoGet('/api/account/history/v1', {
      address: coldkey,
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (newestSeenRow == null) newestSeenRow = r; // first row touched = most recent (DESC)
      oldestSeenRow = r; // rows are DESC — last one we touch is the oldest.
      const ts = new Date(r.timestamp).getTime();
      if (ts <= endD.getTime()) historyRowsInWindow.push(r);
      if (ts <= startD.getTime()) {
        startingRow = r;
        break outer;
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }

  // Fallback: no row at-or-before `start` → coldkey is younger than the
  // window. Use the oldest available snapshot as the effective baseline.
  // Transfers below are clipped to >= effectiveStart so the PnL formula
  // (current + transfers_out - transfers_in - starting) stays internally
  // consistent — no transfers counted from before the snapshot we're using.
  const usedFallback = !startingRow && !!oldestSeenRow;
  if (usedFallback) startingRow = oldestSeenRow;
  const effectiveStartMs = startingRow
    ? new Date(startingRow.timestamp).getTime()
    : startD.getTime();

  const rootOnly = (row) =>
    (Number(row.balance_free || 0) +
      Number(row.balance_reserved || 0) +
      Number(row.balance_staked_root || 0)) /
    RAO;

  // 2. Transfer rows in [effectiveStart, end]. Fetched BEFORE snapshot row
  // emission (iter 112) so the per-day daily_income diff can subtract net
  // transfers on each day — without that correction the sparkline would spike
  // on transfer days and undercount on send days.
  // Clipping to effectiveStartMs (not the requested start) keeps PnL consistent
  // when the snapshot fell back to oldest-available — see usedFallback above.
  page = 1;
  const transferRows = [];
  while (page <= 20) {
    const j = await taoGet('/api/transfer/v1', {
      address: coldkey,
      timestamp_start: Math.floor(effectiveStartMs / 1000),
      timestamp_end: Math.floor(endD.getTime() / 1000),
      limit: 200,
      page,
    });
    const rows = j?.data || [];
    if (rows.length === 0) break;
    for (const t of rows) {
      const amountTao = Number(t.amount || 0) / RAO;
      const to = t.to?.ss58 || t.to;
      const from = t.from?.ss58 || t.from;
      const ts = t.timestamp;
      if (to === coldkey) {
        transferRows.push({
          transaction_type: 'transfer_in',
          credit_amount: amountTao,
          date: ts ? dateStr(ts) : null,
          timestamp: ts,
          _source: 'free:transfer/v1',
        });
      } else if (from === coldkey) {
        transferRows.push({
          transaction_type: 'transfer_out',
          debit_amount: amountTao,
          date: ts ? dateStr(ts) : null,
          timestamp: ts,
          _source: 'free:transfer/v1',
        });
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }

  // 3. Per-day net transfer map for the iter-112 sparkline diff. We subtract
  // this from each day's rootOnly delta so transfers don't masquerade as
  // income (and sends don't masquerade as losses).
  const transferNetByDate = {};
  for (const t of transferRows) {
    if (!t.date) continue;
    const sign = t.transaction_type === 'transfer_in'
      ? Number(t.credit_amount || 0)
      : -Number(t.debit_amount || 0);
    transferNetByDate[t.date] = (transferNetByDate[t.date] || 0) + sign;
  }

  // 4. Group history rows by UTC date — keep the LAST (most recent) row of
  // each day as the end-of-day balance. /api/account/history/v1 emits ~12
  // rows/day (epoch frequency), so without this collapse the sparkline would
  // be 2000 noisy points instead of ~170 clean daily ones.
  const byDate = new Map();
  for (const r of historyRowsInWindow) {
    const d = dateStr(r.timestamp);
    const existing = byDate.get(d);
    if (!existing || new Date(r.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      byDate.set(d, r);
    }
  }
  // If startingRow wasn't in historyRowsInWindow (shouldn't happen — the page
  // walk pushes it before breaking — but defensive), add it as the baseline.
  if (startingRow) {
    const sd = dateStr(startingRow.timestamp);
    if (!byDate.has(sd)) byDate.set(sd, startingRow);
  }
  const snapshotsAsc = [...byDate.values()].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );

  // 5. Emit one snapshot row per day, with daily_income derived from the
  // rootOnly delta minus that day's net transfers. First row is the baseline
  // (no daily_income — it's the starting snapshot, semantically equivalent to
  // paid tax/v1's first row). Tag the first row with the existing source
  // strings (fallback-oldest vs normal start) so downstream debugging still
  // works.
  const out = [];
  let prevRoot = null;
  for (let i = 0; i < snapshotsAsc.length; i++) {
    const r = snapshotsAsc[i];
    const root = rootOnly(r);
    const row = {
      transaction_type: null,
      total_balance: root,
      date: dateStr(r.timestamp),
      timestamp: r.timestamp,
      _source:
        i === 0
          ? (usedFallback
              ? 'free:history/v1@rootOnly:fallback-oldest'
              : 'free:history/v1@rootOnly:starting')
          : 'free:history/v1@rootOnly:daily',
    };
    if (i > 0 && prevRoot != null) {
      const netT = transferNetByDate[row.date] || 0;
      row.daily_income = root - prevRoot - netT;
    }
    out.push(row);
    prevRoot = root;
  }

  // Ascending by timestamp — consumer (pnlGroundTruth) expects ascending so
  // firstSnapshotDate / lastSnapshotDate land on the right rows. Merge snapshots
  // with transfers and sort the whole thing.
  const merged = [...out, ...transferRows].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
  return merged;
}

// Daily balance series for a coldkey (ascending by date). Same endpoint as
// getLatestBalance but paginated — used for drawdown / peak / volatility math
// on §2. Caps at `days` days of history; one row per snapshot (typically daily).
export async function getBalanceHistory(coldkey, days = 365) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const RAO = 1e9;
  const out = [];
  let page = 1;
  const limit = 200;
  while (true) {
    let j;
    try {
      j = await taoGet('/api/account/history/v1', {
        address: coldkey,
        limit,
        page,
      });
    } catch (e) {
      // Mid-pagination failure: if page 1 already succeeded we have enough
      // data for §2 drawdown/vol math — return partial instead of throwing
      // away the whole series. Only re-throw if even page 1 failed.
      if (page === 1) throw e;
      console.warn(`[taostats] balance-history page ${page} failed (${e.message}); returning partial ${out.length} rows`);
      break;
    }
    const rows = j?.data || [];
    if (rows.length === 0) break;
    let hitCutoff = false;
    for (const r of rows) {
      const ts = r.timestamp;
      if (!ts) continue;
      const ms = new Date(ts).getTime();
      if (ms < cutoffMs) {
        hitCutoff = true;
        continue;
      }
      out.push({
        timestamp: ts,
        totalTao: Number(r.balance_total || 0) / RAO,
        stakedTao: Number(r.balance_staked || 0) / RAO,
      });
    }
    if (hitCutoff || rows.length < limit) break;
    page += 1;
    if (page > 10) break; // safety — 10 pages * 200 = 2000 snapshots max
  }
  out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return out;
}

// Latest staked + total balance for a coldkey, used as "Current portfolio (TAO)"
// in the FINAL doc's profit formula. Mirrors latest_staked() in wallet_balances.py.
export async function getLatestBalance(coldkey) {
  const j = await taoGet('/api/account/history/v1', {
    address: coldkey,
    limit: 1,
    page: 1,
  });
  const rec = j?.data?.[0];
  if (!rec) return null;
  const RAO = 1e9;
  return {
    stakedTao: Number(rec.balance_staked || 0) / RAO,
    totalTao: Number(rec.balance_total || 0) / RAO,
    snapshotAt: rec.timestamp,
  };
}

// tao.app subnet screener — per-subnet alpha price + 1h/1d/7d/1m %, volume,
// market cap. This is the source of truth for "what is my alpha worth in TAO"
// and for §6 broader market movers.
const TAOAPP_BASE = 'https://api.tao.app';

export async function getSubnetScreener() {
  const key = process.env.TAOAPP_API_KEY;
  const headers = { Accept: 'application/json' };
  if (key) headers['x-api-key'] = key;
  const r = await fetch(`${TAOAPP_BASE}/api/beta/subnet_screener`, { headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`tao.app screener → ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || []);
  // Index by netuid for quick lookup, but also return the raw list.
  const byNetuid = {};
  for (const r of rows) {
    if (r.netuid != null) byNetuid[r.netuid] = r;
  }
  return { rows, byNetuid };
}
