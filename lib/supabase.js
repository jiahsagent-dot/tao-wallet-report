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
    'Accept-Profile': 'tao',
    'Content-Profile': 'tao',
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
