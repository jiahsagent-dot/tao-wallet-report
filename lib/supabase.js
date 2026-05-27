// Minimal Supabase REST wrapper — no SDK dependency, just fetch against PostgREST.
// All ops use the service-role key (server-side only).

const URL_BASE = process.env.TAO_SUPABASE_URL;
const KEY = process.env.TAO_SUPABASE_SERVICE_KEY;

function assertConfigured() {
  if (!URL_BASE || !KEY) throw new Error('TAO_SUPABASE_URL / TAO_SUPABASE_SERVICE_KEY missing');
}

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

// Insert one row, return the row (representation).
export async function insert(table, row) {
  assertConfigured();
  const r = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase insert ${table} → ${r.status}: ${t.slice(0, 200)}`);
  }
  const arr = await r.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

// Patch by primary key match. Filters is an array of "col=eq.value" strings.
export async function update(table, filters, patch) {
  assertConfigured();
  const qs = filters.join('&');
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase update ${table} → ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// Select with filters and optional order/limit.
export async function select(table, { filters = [], order, limit, select: cols = '*' } = {}) {
  assertConfigured();
  const params = new URLSearchParams();
  params.set('select', cols);
  for (const f of filters) {
    const [k, v] = f.split('=', 2);
    params.append(k, v);
  }
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?${params.toString()}`, {
    headers: headers(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase select ${table} → ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// Call a Postgres function via PostgREST RPC.
export async function rpc(fn, args = {}) {
  assertConfigured();
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase rpc ${fn} → ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// iter 125: read-through cache for Taostats /api/account/history/v1 row walks.
// Cross-request, survives cold lambdas, spreads load across the TTL window.
// `null` return = miss (no row, or row stale). Caller fetches + writes back.
// Failure (network, DB down) returns null so the caller fetches fresh — never
// throws, never blocks the report on cache infra.
const HISTORY_CACHE_TABLE = 'tao_taostats_history_cache';
export async function historyCacheRead(coldkey, maxAgeMs) {
  if (!URL_BASE || !KEY) return null;
  try {
    const params = new URLSearchParams({
      select: 'rows,row_count,fetched_at',
      coldkey: `eq.${coldkey}`,
      limit: '1',
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${HISTORY_CACHE_TABLE}?${params}`, {
      headers: headers(),
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const hit = arr[0];
    const age = Date.now() - new Date(hit.fetched_at).getTime();
    if (age > maxAgeMs) return null;
    return { rows: hit.rows, fetched_at: hit.fetched_at, ageMs: age };
  } catch {
    return null;
  }
}
export async function historyCacheWrite(coldkey, rows) {
  if (!URL_BASE || !KEY) return false;
  try {
    const body = JSON.stringify({
      coldkey,
      rows,
      row_count: rows.length,
      fetched_at: new Date().toISOString(),
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${HISTORY_CACHE_TABLE}?on_conflict=coldkey`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body,
    });
    return r.ok;
  } catch {
    return false;
  }
}

// iter 127: same shape as historyCache* above, but for /api/transfer/v1 walks.
// Transfers are cached all-time per coldkey (no window in the API call) so a
// single cached row serves BOTH FY24 and FY25 reconstructions plus any future
// time-window query — consumer filters in-memory.
const TRANSFERS_CACHE_TABLE = 'tao_taostats_transfers_cache';
export async function transfersCacheRead(coldkey, maxAgeMs) {
  if (!URL_BASE || !KEY) return null;
  try {
    const params = new URLSearchParams({
      select: 'rows,row_count,fetched_at',
      coldkey: `eq.${coldkey}`,
      limit: '1',
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${TRANSFERS_CACHE_TABLE}?${params}`, {
      headers: headers(),
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const hit = arr[0];
    const age = Date.now() - new Date(hit.fetched_at).getTime();
    if (age > maxAgeMs) return null;
    return { rows: hit.rows, fetched_at: hit.fetched_at, ageMs: age };
  } catch {
    return null;
  }
}
export async function transfersCacheWrite(coldkey, rows) {
  if (!URL_BASE || !KEY) return false;
  try {
    const body = JSON.stringify({
      coldkey,
      rows,
      row_count: rows.length,
      fetched_at: new Date().toISOString(),
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${TRANSFERS_CACHE_TABLE}?on_conflict=coldkey`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body,
    });
    return r.ok;
  } catch {
    return false;
  }
}

// iter 128: same shape as history/transfers caches above, but for
// /api/delegation/v1 walks (stake/unstake/move events). Third and last endpoint
// in the burst-429 triplet (history, transfer, delegation) closed onto the
// cache shape. Delegation rows are cached all-time per coldkey; consumers
// filter in-memory by window when needed.
const DELEGATION_CACHE_TABLE = 'tao_taostats_delegation_cache';
export async function delegationCacheRead(coldkey, maxAgeMs) {
  if (!URL_BASE || !KEY) return null;
  try {
    const params = new URLSearchParams({
      select: 'rows,row_count,fetched_at',
      coldkey: `eq.${coldkey}`,
      limit: '1',
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${DELEGATION_CACHE_TABLE}?${params}`, {
      headers: headers(),
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const hit = arr[0];
    const age = Date.now() - new Date(hit.fetched_at).getTime();
    if (age > maxAgeMs) return null;
    return { rows: hit.rows, fetched_at: hit.fetched_at, ageMs: age };
  } catch {
    return null;
  }
}
export async function delegationCacheWrite(coldkey, rows) {
  if (!URL_BASE || !KEY) return false;
  try {
    const body = JSON.stringify({
      coldkey,
      rows,
      row_count: rows.length,
      fetched_at: new Date().toISOString(),
    });
    const r = await fetch(`${URL_BASE}/rest/v1/${DELEGATION_CACHE_TABLE}?on_conflict=coldkey`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body,
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Upsert into subscribers — primary key conflict on email.
export async function upsert(table, row, onConflict = 'email') {
  assertConfigured();
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase upsert ${table} → ${r.status}: ${t.slice(0, 200)}`);
  }
  const arr = await r.json();
  return Array.isArray(arr) ? arr[0] : arr;
}
