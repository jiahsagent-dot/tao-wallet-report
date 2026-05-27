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

async function taoGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TAOSTATS_BASE}${path}${qs ? `?${qs}` : ''}`;
  // Free-tier key throttles Vercel's shared outbound IP harder than direct VPS
  // calls — even sequential bursts of 2-3 sub-second calls trip 429. Retry up
  // to 3 times on 429/5xx (or transport error) with 1.5s, 3.5s waits.
  const waits = [1500, 3500];
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { headers: authHeaders() });
    } catch (e) {
      if (attempt < waits.length) {
        console.warn(`[taostats] ${path} → transport error '${e.message}' (retry ${attempt + 1}/${waits.length} in ${waits[attempt]}ms)`);
        await new Promise((res) => setTimeout(res, waits[attempt]));
        continue;
      }
      throw e;
    }
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

// Live TAO/USD price.
// iter 121: module-level fresh+stale cache. /api/price/latest/v1 is the lightest
// Taostats endpoint we hit but it sits inside buildReport()'s first Promise.all
// alongside getHoldings + getDelegationHistory + getSubnetScreener. Under the
// parallel burst the free-tier key 429s on this endpoint just as readily as
// the heavy walkers — and when it throws, the whole report aborts before §2
// ever runs (which is what was masking iter 119's [free-pnl] instrumentation
// for mantat after iter 120 unblocked subnets). Cache strategy: 60s fresh
// (skip network on warm container reuse), 1h stale (serve last good value
// on 429/transport error instead of 500ing the whole report). Module-level
// cache only survives within a warm container, so cold boots still re-fetch.
let _taoPriceCache = null; // { value: number, ts: number (ms) }
const TAO_PRICE_FRESH_MS = 60_000;
const TAO_PRICE_STALE_MS = 60 * 60_000;
export async function getTaoPrice() {
  const now = Date.now();
  if (_taoPriceCache && now - _taoPriceCache.ts < TAO_PRICE_FRESH_MS) {
    return _taoPriceCache.value;
  }
  try {
    const j = await taoGet('/api/price/latest/v1', { asset: 'tao' });
    // Response shape: { data: [{ price: "278.19", ... }] }
    const row = j?.data?.[0];
    if (!row) throw new Error('Empty price response');
    const price = Number(row.price);
    _taoPriceCache = { value: price, ts: now };
    return price;
  } catch (e) {
    if (_taoPriceCache && now - _taoPriceCache.ts < TAO_PRICE_STALE_MS) {
      console.warn(`[taostats] price/latest failed (${e.message}); serving stale cached price=${_taoPriceCache.value} (age=${Math.round((now - _taoPriceCache.ts) / 1000)}s)`);
      return _taoPriceCache.value;
    }
    throw e;
  }
}

// All alpha-token holdings for a coldkey, grouped by (netuid, hotkey).
// Returns: [{ netuid, hotkey, shares, alpha, alphaTokens }]
// alphaTokens = alpha / 1e9 (Taostats stores rao = 1e-9 alpha).
// Page-level tolerance (iter 120): /api/dtao/coldkey_alpha_shares/latest/v1
// 429s under Vercel's shared outbound IP — when it throws mid-walk the
// orchestrator aborts the whole report, masking §2 free-PnL failure modes
// the iter-119 instrumentation was added to catch. Same pattern as iter
// 116 (delegation) + iter 117 (transfer): partial > total abort.
export async function getHoldings(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    let j;
    try {
      j = await taoGet('/api/dtao/coldkey_alpha_shares/latest/v1', {
        coldkey,
        page,
        limit: 200,
      });
    } catch (e) {
      console.warn(`[taostats] /api/dtao/coldkey_alpha_shares/latest/v1 page ${page} failed (${e.message}); returning ${out.length} holdings`);
      return out;
    }
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
// Page-level tolerance: /api/delegation/v1 is the most expensive Taostats
// endpoint and the FREE key 429s under Vercel's shared outbound IP unpredictably
// mid-walk. If any page >1 fails after taoGet's retries, return what we have so
// far (partial data > whole-report abort). Page 1 failure → empty array, lets
// pnl() degrade to zero realised/spent instead of throwing the build.
export async function getDelegationHistory(coldkey) {
  const out = [];
  let page = 1;
  while (true) {
    let j;
    try {
      j = await taoGet('/api/delegation/v1', {
        nominator: coldkey,
        page,
        limit: 200,
      });
    } catch (e) {
      console.warn(`[taostats] /api/delegation/v1 page ${page} failed (${e.message}); returning ${out.length} rows`);
      return out;
    }
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
export async function getValidatorYield(netuid) {
  const j = await taoGet('/api/dtao/validator/yield/latest/v1', { netuid });
  const rows = j?.data || [];
  return rows.map((r) => ({
    hotkey: r.hotkey?.ss58,
    name: r.name,
    apy1h: r.one_hour_apy != null ? Number(r.one_hour_apy) : null,
    apy1d: r.one_day_apy != null ? Number(r.one_day_apy) : null,
    apy7d: r.seven_day_apy != null ? Number(r.seven_day_apy) : null,
    apy30d: r.thirty_day_apy != null ? Number(r.thirty_day_apy) : null,
  }));
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
// consistent. Still opt-in (FREE_PNL=1) until validated end-to-end on all
// three coldkeys at the prod 365d window.
export async function getTaxReportRange(coldkey, start, end) {
  if (process.env.FREE_PNL === '1') {
    return getTaxReportRangeFree(coldkey, start, end);
  }
  const fmt = (d) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
  const j = await taoGet('/api/accounting/tax/v1', {
    token: 'TAO',
    date_start: fmt(start),
    date_end: fmt(end),
    coldkey,
  });
  return j?.data || [];
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
// iter 114: shared history-page memo for the free-PnL path. The lib/report.js
// orchestrator calls getTaxReportRangeFree twice in sequence (one per FY), and
// each call previously re-walked /api/account/history/v1 from page 1.
// iter 115: ALSO shared with getBalanceHistory (drawdown/vol). Pre-iter-115 the
// free-PnL walk competed with the drawdown walk for the same endpoint from a
// cold lambda, bursting past the rate ceiling — iter 114's memo only helped the
// SECOND FY call, not the first one racing with drawdown. Runtime logs on the
// iter 113/114 preview confirmed the 429 hit page-N of history/v1 mid-walk,
// getTaxReportRangeFree threw, pnlGroundTruth's .catch swallowed it, §2 shipped
// "no_tax_data". Now both code paths read from the same in-process memo:
// whichever fires first pays the walk, the other gets it free.
// Partial-rows tolerance (mid-pagination failure logs + returns what we have)
// mirrors the existing getBalanceHistory behaviour — better to render with
// ~170d of data than throw away the whole walk because page 11 of 11 was
// rate-limited.
// iter 125: cross-request cache (Supabase) layered on top of the iter 114
// in-process memo + iter 118 in-flight dedup. Survives cold lambdas — within
// a 15-min TTL window, the report endpoint can serve repeated coldkey requests
// (cold cycle, page reload, multi-coldkey burst) without re-walking the
// /api/account/history/v1 endpoint that was the burst-429 vector iters 121/122
// /123/124 chased. Hierarchy: memo (free, ~0ms) → DB (network, ~50ms) → walk.
// DB miss/error → fall through to walk; never blocks. Records the source on
// each call via _historyRowsLastSource (read by /api/debug/free-pnl).
const _historyRowsMemo = new Map(); // coldkey → { rows, ts }
const _historyRowsInFlight = new Map(); // coldkey → Promise<rows>
const _historyRowsLastSource = new Map(); // coldkey → 'memo'|'db'|'fetch'
const HISTORY_ROWS_TTL_MS = 60_000;
const HISTORY_DB_CACHE_TTL_MS = 15 * 60 * 1000;
export function _getHistoryRowsLastSource(coldkey) {
  return _historyRowsLastSource.get(coldkey) || null;
}
async function getHistoryRowsCached(coldkey) {
  const cached = _historyRowsMemo.get(coldkey);
  if (cached && Date.now() - cached.ts < HISTORY_ROWS_TTL_MS) {
    _historyRowsLastSource.set(coldkey, 'memo');
    return cached.rows;
  }
  const dbHit = await (await import('./supabase.js')).historyCacheRead(coldkey, HISTORY_DB_CACHE_TTL_MS);
  if (dbHit && Array.isArray(dbHit.rows) && dbHit.rows.length > 0) {
    _historyRowsMemo.set(coldkey, { rows: dbHit.rows, ts: Date.now() });
    _historyRowsLastSource.set(coldkey, 'db');
    return dbHit.rows;
  }
  // iter 118: in-flight promise dedup. Result-cache alone wasn't enough —
  // the orchestrator fires getBalanceHistory(coldkey, 730) and the FY24
  // getTaxReportRange concurrently (lib/report.js ~L1261 + L1265), both
  // call getHistoryRowsCached before either resolves, both kick off a
  // parallel page walk, 6+ history/v1 fetches in flight, 429, throw,
  // .catch(() => []) swallows it, §2 ships no_tax_data. iter 115's
  // sequential-cache works after the first walk resolves but does nothing
  // for concurrent first-callers. Now: second caller awaits the same
  // promise the first caller started.
  const inflight = _historyRowsInFlight.get(coldkey);
  if (inflight) return inflight;
  const p = (async () => {
    const allRows = [];
    let page = 1;
    while (page <= 20) {
      let j;
      try {
        j = await taoGet('/api/account/history/v1', {
          address: coldkey,
          limit: 200,
          page,
        });
      } catch (e) {
        if (page === 1) {
          // iter 122: was `throw e`. The throw propagated up through every
          // consumer (getBalanceHistory, both FY getTaxReportRange calls) via
          // their `.catch(() => [])` in lib/report.js — collapsed silently to
          // empty rows, never reaching iter 119's `[free-pnl] history walk
          // returned 0 rows` warning inside getTaxReportRangeFree, so the
          // burst-429 case looked indistinguishable from "no data exists" in
          // runtime logs. mantat coldkey on iter 121 preview was this exact
          // pattern. Now we log + return [] so the downstream empty-out
          // instrumentation closes the diagnostic chain. _historyRowsMemo.set
          // below is skipped because we return early — next caller after the
          // in-flight promise clears will re-walk, no poison-cache.
          console.warn(`[taostats] history-rows page 1 failed (${e.message}); returning empty rows (next caller will retry)`);
          return [];
        }
        console.warn(`[taostats] history-rows page ${page} failed (${e.message}); returning partial ${allRows.length} rows`);
        break;
      }
      const rows = j?.data || [];
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < 200) break;
      page += 1;
    }
    _historyRowsMemo.set(coldkey, { rows: allRows, ts: Date.now() });
    _historyRowsLastSource.set(coldkey, 'fetch');
    // iter 125: persist to Supabase for cross-request reuse. Only write on
    // non-empty walks — an empty array could be a transient burst-429 (page 1
    // failed silently per iter 122) and we don't want to poison the DB cache
    // with that. Fire-and-forget; failure is logged but doesn't block.
    if (allRows.length > 0) {
      (async () => {
        const { historyCacheWrite } = await import('./supabase.js');
        const ok = await historyCacheWrite(coldkey, allRows);
        if (!ok) console.warn(`[taostats] history-rows db cache write failed for ${coldkey.slice(0, 8)}…`);
      })();
    }
    return allRows;
  })();
  _historyRowsInFlight.set(coldkey, p);
  try {
    return await p;
  } finally {
    _historyRowsInFlight.delete(coldkey);
  }
}

export async function getTaxReportRangeFree(coldkey, start, end) {
  const RAO = 1e9;
  const toDate = (d) => (typeof d === 'string' ? new Date(d) : d);
  const startD = toDate(start);
  const endD = toDate(end);
  const dateStr = (ts) => new Date(ts).toISOString().slice(0, 10);

  // 1. Starting-balance snapshot — latest history row whose timestamp <= start.
  //    Same algorithm as the iter-105 probe, but page walk is now memoized via
  //    getHistoryRowsCached (iter 114 → iter 115: now shared with
  //    getBalanceHistory). Rows are timestamp-DESC, so we scan forward and
  //    pick the first row at-or-before `start`. The OLDEST row seen is the
  //    fallback for young coldkeys whose history doesn't reach back to
  //    `start` (iter 109 regression fix).
  const allRows = await getHistoryRowsCached(coldkey);
  let startingRow = null;
  let oldestSeenRow = null;
  let newestSeenRow = null;
  // iter 112: collect every history row visited during the page walk for the
  // per-day sparkline diff. These rows are all in [startingRow.ts, endD] so
  // they cover the effective reconstruction window naturally.
  const historyRowsInWindow = [];
  for (const r of allRows) {
    if (newestSeenRow == null) newestSeenRow = r; // first row = most recent (DESC)
    oldestSeenRow = r; // rows are DESC — last one we touch is the oldest.
    const ts = new Date(r.timestamp).getTime();
    if (ts <= endD.getTime()) historyRowsInWindow.push(r);
    if (ts <= startD.getTime() && startingRow == null) {
      startingRow = r;
      break;
    }
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
  // Page-level tolerance (iter 117 — mirror iter 116 fix for delegation walk).
  // /api/transfer/v1 429s mid-walk on Vercel's shared outbound IP, the same way
  // history/v1 and delegation/v1 do. Pre-iter-117 a throw here propagated up
  // through pnlGroundTruth's .catch(() => []) in lib/report.js → trailingRows
  // became [] → §2 shipped no_tax_data even though iter 116 stopped the higher
  // banner abort. Page 1 failure → empty array, lets pnl reconstruction degrade
  // cleanly; page >1 failure → keep what we have so far, log + continue.
  let page = 1;
  const transferRows = [];
  while (page <= 20) {
    let j;
    try {
      j = await taoGet('/api/transfer/v1', {
        address: coldkey,
        timestamp_start: Math.floor(effectiveStartMs / 1000),
        timestamp_end: Math.floor(endD.getTime() / 1000),
        limit: 200,
        page,
      });
    } catch (e) {
      if (page === 1) {
        console.warn(`[taostats] /api/transfer/v1 page 1 failed (${e.message}); proceeding with zero transfers`);
        break;
      }
      console.warn(`[taostats] /api/transfer/v1 page ${page} failed (${e.message}); returning partial ${transferRows.length} transfer rows`);
      break;
    }
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
  // iter 119: instrument silent-failure modes. Empty merged → pnlGroundTruth
  // ships no_tax_data with no log line explaining why. We've burned iters 114-118
  // chasing "no_tax_data on preview" without runtime visibility into which leg
  // (history walk empty? snapshots collapsed to zero? transfers walk degraded?)
  // actually failed. Cheap one-line log when this path emits empty/partial output.
  if (allRows.length === 0) {
    console.warn(`[free-pnl] ${coldkey.slice(0, 6)}.. history walk returned 0 rows (window ${dateStr(startD)}→${dateStr(endD)}, used_fallback=${usedFallback})`);
  } else if (out.length === 0) {
    console.warn(`[free-pnl] ${coldkey.slice(0, 6)}.. snapshots empty (history_rows=${allRows.length}, in_window=${historyRowsInWindow.length}, transfers=${transferRows.length})`);
  } else if (merged.length === 0) {
    console.warn(`[free-pnl] ${coldkey.slice(0, 6)}.. merged empty even though out=${out.length}, transfers=${transferRows.length}`);
  }
  return merged;
}

// Daily balance series for a coldkey (ascending by date). Same endpoint as
// getLatestBalance but paginated — used for drawdown / peak / volatility math
// on §2. Caps at `days` days of history; one row per snapshot (typically daily).
// iter 115: reads from the shared getHistoryRowsCached memo so this no longer
// races getTaxReportRangeFree for the same endpoint when FREE_PNL=1. One walk
// per coldkey per 60s, both code paths consume it.
export async function getBalanceHistory(coldkey, days = 365) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const RAO = 1e9;
  const allRows = await getHistoryRowsCached(coldkey);
  const out = [];
  for (const r of allRows) {
    const ts = r.timestamp;
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (ms < cutoffMs) continue;
    out.push({
      timestamp: ts,
      totalTao: Number(r.balance_total || 0) / RAO,
      stakedTao: Number(r.balance_staked || 0) / RAO,
    });
  }
  out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return out;
}

// Latest staked + total balance for a coldkey, used as "Current portfolio (TAO)"
// in the FINAL doc's profit formula. Mirrors latest_staked() in wallet_balances.py.
// iter 124: read from the shared getHistoryRowsCached memo instead of a separate
// /api/account/history/v1?limit=1 call. The orchestrator (lib/report.js ~L1261)
// fires getBalanceHistory + getLatestBalance in parallel — pre-iter-124 that
// was two independent hits on the burst-429-prone /api/account/history/v1
// endpoint per coldkey per report. iter 123's diagnostic confirmed subnets
// coldkey's latest_balance leg was the one losing the race. Shared memo + in-
// flight dedup means both callers now share one walk; getLatestBalance returns
// allRows[0] (rows are DESC, first = most recent). On page-1 fetch failure
// getHistoryRowsCached returns [] (iter 122), so allRows[0] is undefined and
// we return null — exact same null-on-failure contract as before.
export async function getLatestBalance(coldkey) {
  const allRows = await getHistoryRowsCached(coldkey);
  const rec = allRows[0];
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
