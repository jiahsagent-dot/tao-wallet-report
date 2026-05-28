import { NextResponse } from 'next/server';
import {
  getTaxReportRangePaid,
  getTaxReportRangeFree,
  getLatestBalance,
} from '../../../../lib/taostats.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// iter 137: forensic side-by-side transfer-row dump. iter 136 verify confirmed
// the iter-134 retry-on-429 worked structurally but the narrow-window comparison
// is NON-PARITY — at free's effective window (173d from 2025-12-06), paid sees
// transfers_in=6.4τ vs free's 0.25τ. 6.15τ of inbound is missing from free
// entirely, and that gap matches the net_profit divergence exactly. The
// reclassification path is doing its job (the divergence isn't a labeling
// artifact — it's a real reconstruction bug). To attack it we need the raw
// transfer rows side-by-side so the MISSING rows are explicitly named.
//
// Two hypotheses:
//   (a) endpoint-scope bug: paid /api/accounting/tax/v1 flattens stake
//       movements (add_stake / remove_stake) into transfers_in/_out; free's
//       /api/transfer/v1 walk only sees pure account-to-account transfers
//       and never surfaces those rows at all.
//   (b) aggregation bug: free's /api/transfer/v1 DOES return the rows, but
//       getTaxReportRangeFree's classification logic (to === coldkey check,
//       SS58 nesting handling) drops them on the floor.
//
// This endpoint runs both paths over the same window, extracts the transfer
// rows from each, normalizes them to a shared key shape ({date, direction,
// amount_tao}), and emits four arrays:
//   - paid_transfers:  paid's transfer rows in window (raw shape preserved)
//   - free_transfers:  free's transfer rows in window (raw shape preserved)
//   - paid_only:       rows present in paid but not in free (by key)
//   - free_only:       rows present in free but not in paid (by key)
//
// If hypothesis (a) is correct, paid_only will contain rows that have no
// counterpart in free at all — and we'll see their original transaction_type
// (e.g. 'stake_add', 'subnet_register') because paid tax/v1 doesn't always
// pure-rename them to transfer_in. If hypothesis (b) is correct, free_only
// will have the rows but they'll be unclassified (or the SS58 nesting will be
// visible in the raw shape).
//
// Each side capped at 50 rows after DESC date sort to keep payload sane.
// FREE_PNL=1-gated preview-only same as the other debug endpoints.

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;
const AMOUNT_KEY_PRECISION = 1e6; // 6dp matching ~rao precision after τ scaling
const ROW_CAP = 50;

function transferKey(direction, dateStr, amountTao) {
  const rounded = Math.round(Number(amountTao || 0) * AMOUNT_KEY_PRECISION);
  return `${direction}|${dateStr}|${rounded}`;
}

// Extract transfer rows from a tax/v1-shaped row set (paid or free reconstruction).
// Both paths emit rows with transaction_type === 'transfer_in' | 'transfer_out'
// (free mirrors paid's shape by design — see lib/taostats.js getTaxReportRangeFree).
function extractTransferRows(rows) {
  const out = [];
  for (const r of rows) {
    const t = r.transaction_type;
    if (t === 'transfer_in') {
      out.push({
        direction: 'in',
        date: r.date || (r.timestamp ? String(r.timestamp).slice(0, 10) : null),
        amount_tao: Number(r.credit_amount || 0),
        raw: r,
      });
    } else if (t === 'transfer_out') {
      out.push({
        direction: 'out',
        date: r.date || (r.timestamp ? String(r.timestamp).slice(0, 10) : null),
        amount_tao: Number(r.debit_amount || 0),
        raw: r,
      });
    }
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}

function sumTao(rows, direction) {
  let s = 0;
  for (const r of rows) if (r.direction === direction) s += r.amount_tao;
  return s;
}

function indexByKey(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = transferKey(r.direction, r.date, r.amount_tao);
    const arr = m.get(k) || [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

function diff(rowsA, rowsB) {
  // Multiset-style diff: same key can appear multiple times (e.g. two 0.5τ
  // inbound transfers on the same day). Match greedily so duplicates aren't
  // collapsed into one.
  const bIdx = indexByKey(rowsB);
  const onlyA = [];
  for (const r of rowsA) {
    const k = transferKey(r.direction, r.date, r.amount_tao);
    const matches = bIdx.get(k);
    if (matches && matches.length > 0) {
      matches.shift();
    } else {
      onlyA.push(r);
    }
  }
  return onlyA;
}

export async function GET(req) {
  if (process.env.FREE_PNL !== '1') {
    return new NextResponse('not found', { status: 404 });
  }

  const url = new URL(req.url);
  const coldkey = url.searchParams.get('coldkey');
  if (!coldkey || !SS58_RE.test(coldkey)) {
    return NextResponse.json(
      { error: 'invalid or missing ?coldkey (must be SS58)' },
      { status: 400 },
    );
  }
  const days = Math.max(1, Math.min(730, Number(url.searchParams.get('days') || 180)));

  const endD = new Date();
  const startD = new Date(endD.getTime() - days * 24 * 3600 * 1000);

  const out = {
    iter: 137,
    coldkey,
    days,
    startIso: startD.toISOString(),
    endIso: endD.toISOString(),
  };

  // Shared current balance so the surrounding context (snapshot semantics)
  // matches what getTaxReportRangeFree saw — not strictly needed for the
  // transfer-row diff, but useful for confirming we're looking at the same
  // wallet state both sides.
  try {
    const tb = Date.now();
    const balance = await getLatestBalance(coldkey);
    out.latest_balance = {
      ok: true,
      ms: Date.now() - tb,
      tao: balance?.totalTao ?? null,
    };
  } catch (e) {
    out.latest_balance = { ok: false, error: String(e?.message || e) };
  }

  let paidRows = null;
  try {
    const t0 = Date.now();
    paidRows = await getTaxReportRangePaid(coldkey, startD, endD);
    out.paid = { ok: true, ms: Date.now() - t0, total_rows: paidRows.length };
  } catch (e) {
    out.paid = { ok: false, error: String(e?.message || e) };
  }

  let freeRows = null;
  try {
    const t0 = Date.now();
    freeRows = await getTaxReportRangeFree(coldkey, startD, endD);
    out.free = { ok: true, ms: Date.now() - t0, total_rows: freeRows.length };
    const firstSnap = freeRows.find((r) => !r.transaction_type);
    out.free.first_snapshot_date = firstSnap?.date || null;
    out.free.first_snapshot_source = firstSnap?._source || null;
  } catch (e) {
    out.free = { ok: false, error: String(e?.message || e) };
  }

  if (paidRows && freeRows) {
    const paidTransfers = extractTransferRows(paidRows);
    const freeTransfers = extractTransferRows(freeRows);

    const paidOnly = diff(paidTransfers, freeTransfers);
    const freeOnly = diff(freeTransfers, paidTransfers);

    out.summary = {
      paid_transfer_count: paidTransfers.length,
      free_transfer_count: freeTransfers.length,
      paid_transfers_in_tao: sumTao(paidTransfers, 'in'),
      paid_transfers_out_tao: sumTao(paidTransfers, 'out'),
      free_transfers_in_tao: sumTao(freeTransfers, 'in'),
      free_transfers_out_tao: sumTao(freeTransfers, 'out'),
      paid_only_count: paidOnly.length,
      free_only_count: freeOnly.length,
      paid_only_in_tao: sumTao(paidOnly, 'in'),
      paid_only_out_tao: sumTao(paidOnly, 'out'),
      free_only_in_tao: sumTao(freeOnly, 'in'),
      free_only_out_tao: sumTao(freeOnly, 'out'),
    };

    out.paid_transfers = paidTransfers.slice(0, ROW_CAP);
    out.free_transfers = freeTransfers.slice(0, ROW_CAP);
    out.paid_only = paidOnly.slice(0, ROW_CAP);
    out.free_only = freeOnly.slice(0, ROW_CAP);
    out.row_cap = ROW_CAP;
    out.truncated = {
      paid_transfers: paidTransfers.length > ROW_CAP,
      free_transfers: freeTransfers.length > ROW_CAP,
      paid_only: paidOnly.length > ROW_CAP,
      free_only: freeOnly.length > ROW_CAP,
    };
  }

  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
