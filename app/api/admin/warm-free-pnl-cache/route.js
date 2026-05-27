import { NextResponse } from 'next/server';
import {
  getTaxReportRangeFree,
  getDelegationHistory,
  _getHistoryRowsLastSource,
  _getTransferRowsLastSource,
  _getDelegationRowsLastSource,
} from '../../../../lib/taostats.js';
import {
  historyCacheRead,
  transfersCacheRead,
  delegationCacheRead,
} from '../../../../lib/supabase.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

// iter 130: admin endpoint that pre-populates the free-PnL DB caches
// (tao_taostats_history_cache / _transfers_cache / _delegation_cache) for a
// configured set of coldkeys. Intended to be triggered every ~10 min by an
// external cron (e.g. a VPS systemd timer) so cold-lambda user reports under
// FREE_PNL=1 always hit cache=db instead of paying the page walk and racing
// Taostats' shared-IP rate limit on Vercel.
//
// iter 131: self-validating — after each warm, read the cache row back
// directly from Supabase via *CacheRead helpers and report `db_state` per
// endpoint. Closes the structural gap iter 125 flagged: "DB read path covered
// structurally" was theory; this confirms the row is materially present in
// the DB after warming. Operators (and the iter-132 cron) can now assert on
// `db_state.{history,transfers,delegation}.present === true` rather than
// trusting `cache_state.last_source === 'fetch'` as a proxy.
//
// Coldkeys come from FREE_PNL_WARM_COLDKEYS (comma-separated SS58 list).
// Auth: CRON_SECRET via ?secret= or Authorization: Bearer (same shape as
// /api/cron/weekly-emails).

// 1 year — effectively "ignore freshness, just tell me if a row exists".
// Caller can derive fresh-vs-stale from ageMs vs the 15-min TTL.
const DB_PROBE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const TTL_MS = 15 * 60 * 1000;

async function probeDbState(coldkey) {
  const probe = async (reader) => {
    try {
      const hit = await reader(coldkey, DB_PROBE_MAX_AGE_MS);
      if (!hit) return { present: false };
      return {
        present: true,
        row_count: Array.isArray(hit.rows) ? hit.rows.length : null,
        age_ms: hit.ageMs,
        fresh: hit.ageMs <= TTL_MS,
        fetched_at: hit.fetched_at,
      };
    } catch (e) {
      return { present: false, error: String(e?.message || e) };
    }
  };
  const [history, transfers, delegation] = await Promise.all([
    probe(historyCacheRead),
    probe(transfersCacheRead),
    probe(delegationCacheRead),
  ]);
  return { history, transfers, delegation };
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

function parseColdkeys() {
  const raw = process.env.FREE_PNL_WARM_COLDKEYS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function warmOne(coldkey) {
  const t0 = Date.now();
  const yearAgoIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const out = { coldkey };

  // Sequential — each call hits one Taostats endpoint walk, and Vercel's
  // shared outbound IP can't survive a parallel burst of all three (this is
  // exactly the burst-429 vector iters 121-128 chased down).
  // getTaxReportRangeFree internally warms BOTH history and transfers caches
  // in a single call (one history walk + one transfer walk via the iter-125
  // and iter-127 wrappers), so one invocation per coldkey covers two caches.
  const tasks = [
    ['tax_report_free', () => getTaxReportRangeFree(coldkey, yearAgoIso, nowIso)],
    ['delegation_history', () => getDelegationHistory(coldkey)],
  ];
  for (const [name, fn] of tasks) {
    const ts = Date.now();
    try {
      const r = await fn();
      out[name] = {
        ok: true,
        count: Array.isArray(r) ? r.length : r ? 1 : 0,
        ms: Date.now() - ts,
      };
    } catch (e) {
      out[name] = {
        ok: false,
        error: String(e?.message || e),
        ms: Date.now() - ts,
      };
    }
  }

  // Report which layer the last call resolved through — after a successful
  // warm this should be 'fetch' (cold) or 'memo' (already warm in lambda).
  out.cache_state = {
    history: _getHistoryRowsLastSource(coldkey),
    transfers: _getTransferRowsLastSource(coldkey),
    delegation: _getDelegationRowsLastSource(coldkey),
  };
  // iter 131: read each cache row back from Supabase directly to confirm the
  // write landed (not just that the wrapper claimed to write).
  out.db_state = await probeDbState(coldkey);
  out.ms_total = Date.now() - t0;
  return out;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const coldkeys = parseColdkeys();
  if (!coldkeys.length) {
    return NextResponse.json(
      { error: 'FREE_PNL_WARM_COLDKEYS not set' },
      { status: 400 },
    );
  }
  const t0 = Date.now();
  const results = [];
  // Sequential across coldkeys too — same burst-429 reason.
  for (const coldkey of coldkeys) {
    results.push(await warmOne(coldkey));
  }
  return NextResponse.json(
    {
      iter: 131,
      coldkey_count: coldkeys.length,
      ms_total: Date.now() - t0,
      results,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
