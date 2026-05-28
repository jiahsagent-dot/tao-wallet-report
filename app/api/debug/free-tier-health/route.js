import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// iter 135: raw-HTTP Taostats endpoint health probe. Given a ?coldkey=,
// directly fetches each of the 3 Taostats endpoints the free-PnL
// reconstruction depends on (history/v1, transfer/v1, accounting/tax/v1)
// with limit=1, BYPASSING the lib/taostats.js retry+throw wrapper AND the
// iter-125/127/128 caches, and surfaces per-endpoint
// {http_status, body_bytes, parsed_row_count, ms, sample_row}.
//
// Reason: iter 134 verify hit `getLatestBalance returned null totalTao` and
// the inner debug endpoints (free-pnl, free-vs-paid) returned `0 rows /
// fetch-empty`, leaving us unable to tell whether:
//   (a) Taostats returned HTTP 200 with empty data[] (real wallet/window mismatch)
//   (b) Taostats returned 4xx (e.g. bad-checksum SS58 — confirmed retro that
//       iter-134 verify URL contained a malformed coldkey)
//   (c) Taostats returned 429 (rate-limited, retryable)
//   (d) Transport error
// Every variant maps to "row_count: 0, last_source: fetch-empty" in the cache
// layer, so the diagnostic was lost.
//
// This endpoint returns the raw signal — one fetch per endpoint, no retries,
// no caching, no throwing. Even a 400 with body 'Invalid SS58' is returned
// verbatim. Designed for one-curl diagnosis of "why is the free-PnL stack
// returning empty?" in <5s.
//
// Auth: FREE_PNL=1-gated like /api/debug/free-pnl — preview-only.

const TAOSTATS_BASE = 'https://api.taostats.io';
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

async function rawProbe(path, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TAOSTATS_BASE}${path}?${qs}`;
  const t0 = Date.now();
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) {
    return {
      url,
      http_status: null,
      body_bytes: 0,
      parsed_row_count: null,
      pagination_total: null,
      ms: 0,
      error: 'TAOSTATS_API_KEY env var unset',
    };
  }
  try {
    const r = await fetch(url, {
      headers: { Authorization: key, Accept: 'application/json' },
    });
    const text = await r.text();
    const ms = Date.now() - t0;
    let parsedRows = null;
    let paginationTotal = null;
    let sampleRow = null;
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j?.data)) {
        parsedRows = j.data.length;
        if (j.data[0]) sampleRow = j.data[0];
      }
      paginationTotal =
        j?.pagination?.total_items ?? j?.pagination?.total ?? null;
    } catch (_e) {
      // non-JSON response — leave parsedRows null
    }
    return {
      url,
      http_status: r.status,
      body_bytes: text.length,
      parsed_row_count: parsedRows,
      pagination_total: paginationTotal,
      ms,
      sample_row: sampleRow,
      body_preview: r.ok ? null : text.slice(0, 200),
    };
  } catch (e) {
    return {
      url,
      http_status: null,
      body_bytes: 0,
      parsed_row_count: null,
      pagination_total: null,
      ms: Date.now() - t0,
      error: `transport: ${e.message}`,
    };
  }
}

export async function GET(req) {
  if (process.env.FREE_PNL !== '1') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const coldkey = searchParams.get('coldkey');
  if (!coldkey) {
    return NextResponse.json(
      { error: 'missing ?coldkey=<SS58 address>' },
      { status: 400 }
    );
  }
  if (!SS58_RE.test(coldkey)) {
    return NextResponse.json(
      {
        error: 'invalid SS58 shape',
        coldkey,
        hint:
          'Address must match /^5[a-km-zA-HJ-NP-Z1-9]{47}$/. Confirm the address by hitting this endpoint against a known-good coldkey first.',
      },
      { status: 400 }
    );
  }

  const t0 = Date.now();
  const env_probe = {
    has_taostats_api_key: Boolean(process.env.TAOSTATS_API_KEY),
    free_pnl_warm_coldkeys_set: Boolean(
      process.env.FREE_PNL_WARM_COLDKEYS &&
        process.env.FREE_PNL_WARM_COLDKEYS.length > 0
    ),
    free_pnl_warm_coldkey_count:
      (process.env.FREE_PNL_WARM_COLDKEYS || '').split(',').filter(Boolean)
        .length,
  };

  // Three sequential probes — burst-429 vector on shared outbound IP means
  // parallel can rate-limit even in a 3-call burst. Sequential is the same
  // pattern iters 121/124/127/128/130 settled on.
  const history = await rawProbe('/api/account/history/v1', {
    address: coldkey,
    limit: '1',
    page: '1',
  });
  const transfers = await rawProbe('/api/transfer/v1', {
    address: coldkey,
    limit: '1',
    page: '1',
  });
  const tax = await rawProbe('/api/accounting/tax/v1', {
    address: coldkey,
    block_start: '1',
    block_end: '99999999',
    limit: '1',
    page: '1',
  });

  // Categorise the result for one-glance triage.
  function categorise(p) {
    if (p.error?.startsWith('transport:')) return 'transport_error';
    if (p.http_status == null) return 'no_response';
    if (p.http_status === 429) return 'rate_limited';
    if (p.http_status >= 500) return 'server_error';
    if (p.http_status >= 400) return 'client_error';
    if (p.parsed_row_count === 0) return 'ok_empty';
    if (p.parsed_row_count > 0) return 'ok_with_rows';
    return 'ok_unparsed';
  }
  const triage = {
    history: categorise(history),
    transfers: categorise(transfers),
    tax: categorise(tax),
  };

  return NextResponse.json({
    iter: 135,
    coldkey,
    env_probe,
    triage,
    history,
    transfers,
    tax,
    ms_total: Date.now() - t0,
  });
}
