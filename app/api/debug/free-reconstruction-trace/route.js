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
const TAOSTATS_BASE = 'https://api.taostats.io';

// iter 138: raw uncached walk of /api/transfer/v1?address=X to distinguish
// (a) the rows aren't in the Taostats /transfer/v1 response at all → structural
//     API gap, real reconstruction-source bug
// from
// (b) the rows ARE returned by /transfer/v1 but our cache/filter path drops them
//     → fixable inside lib/taostats.js
// Iter 137 verify named the 3 missing rows (block_numbers 7534068, 7036937,
// 7036948 on the subnets coldkey at 180d). This walker fetches the same
// endpoint our cache uses, bypasses iter-127 memo + DB cache + retry wrapper,
// and reports whether each paid_only block_number appears in the raw response.
async function rawTransferV1Walk(coldkey, maxPages) {
  return rawTaoWalk('/api/transfer/v1', { address: coldkey }, maxPages);
}

// iter 139: shared raw walker so the new history-delta probe can hit
// /api/account/history/v1 the same uncached way the iter-138 transfer probe
// hits /api/transfer/v1 — bypassing the iter-125 memo + DB cache + lib retry
// wrapper. Sequential, 250ms-paced between pages.
async function rawTaoWalk(path, baseParams, maxPages) {
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) {
    return { ok: false, error: 'TAOSTATS_API_KEY env var unset' };
  }
  const allRows = [];
  let paginationTotal = null;
  let pagesWalked = 0;
  let stopReason = null;
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ ...baseParams, limit: '200', page: String(page) }).toString();
    const url = `${TAOSTATS_BASE}${path}?${qs}`;
    let r;
    try {
      r = await fetch(url, { headers: { Authorization: key, Accept: 'application/json' } });
    } catch (e) {
      stopReason = `transport_error page ${page}: ${e.message}`;
      break;
    }
    pagesWalked = page;
    if (!r.ok) {
      const body = await r.text();
      stopReason = `http_${r.status} page ${page}: ${body.slice(0, 120)}`;
      break;
    }
    const j = await r.json();
    const pageRows = Array.isArray(j?.data) ? j.data : [];
    if (paginationTotal == null) {
      paginationTotal = j?.pagination?.total_items ?? j?.pagination?.total ?? null;
    }
    allRows.push(...pageRows);
    if (pageRows.length === 0) { stopReason = `empty_page_${page}`; break; }
    if (pageRows.length < 200) { stopReason = `short_page_${page}_${pageRows.length}rows`; break; }
    if (page < maxPages) await new Promise((res) => setTimeout(res, 250));
  }
  return {
    ok: true,
    pages_walked: pagesWalked,
    total_rows: allRows.length,
    pagination_total: paginationTotal,
    stop_reason: stopReason,
    rows: allRows,
  };
}

// iter 139: rootOnly formula matching lib/taostats.js getTaxReportRangeFree
// L559-563 — balance_free + balance_reserved + balance_staked_root, all in
// planck, returned as TAO. This is the field the iter-109 fallback-oldest
// reconstruction reads as the snapshot's `total_balance`. A balance-delta
// reconstruction would walk these and net out transfers, so the right question
// to ask the data is: "does rootOnly jump by ~2.556τ between the snapshots
// straddling block 7534068?". If yes → balance-delta reconstruction WOULD
// capture the 2.556τ stake-credit event and we can fix lib/taostats.js without
// adding a new endpoint. If no → the event happens entirely inside
// balance_staked_alpha and balance-delta on rootOnly misses it just as much as
// /api/transfer/v1 does → next iter needs a staking-specific endpoint.
const RAO = 1e9;
function rootOnlyTao(row) {
  return (
    (Number(row?.balance_free || 0) +
      Number(row?.balance_reserved || 0) +
      Number(row?.balance_staked_root || 0)) /
    RAO
  );
}
function totalTao(row) {
  return Number(row?.balance_total || 0) / RAO;
}

// For each target block, find the latest snapshot with block_number <= target
// (the "before") and the earliest with block_number > target (the "after").
// Snapshots in history/v1 are ~12 rows/day (epoch frequency), so the gap is
// typically a few thousand blocks (~7s blocks ≈ minutes apart) — small enough
// that the delta is dominated by the event at the target block, not by
// background income.
function findSnapshotPair(snapshotsAsc, targetBlock) {
  let before = null;
  let after = null;
  for (const s of snapshotsAsc) {
    const bn = s.block_number;
    if (bn == null) continue;
    if (bn <= targetBlock) {
      if (!before || bn > before.block_number) before = s;
    } else {
      if (!after || bn < after.block_number) after = s;
    }
  }
  return { before, after };
}

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
  const includeRawWalk = url.searchParams.get('include_raw_walk') === '1';
  const includeBalanceDeltaProbe = url.searchParams.get('include_balance_delta_probe') === '1';

  const endD = new Date();
  const startD = new Date(endD.getTime() - days * 24 * 3600 * 1000);

  const out = {
    iter: 139,
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

    // iter 138: when ?include_raw_walk=1, fetch /api/transfer/v1?address=coldkey
    // directly (bypassing iter-127 transfers cache + lib/taostats.js retry
    // wrapper) and check whether the paid_only block_numbers appear in the
    // raw API response. The cache walk uses the same endpoint via taoGet, so
    // any block_number in paid_only that DOES appear here means the bug is in
    // our cache layer (iter-127 transfers cache poisoned, classification dropping
    // the row, etc.); a block_number that DOESN'T appear here means /transfer/v1
    // simply doesn't surface this transfer kind and the reconstruction needs a
    // different data source (e.g. /api/account/history/v1 balance deltas, or a
    // staking endpoint for transfers that route through Subtensor's staking pallet).
    if (includeRawWalk) {
      const tw = Date.now();
      const walk = await rawTransferV1Walk(coldkey, 5);
      out.raw_walk = {
        ok: walk.ok,
        ms: Date.now() - tw,
        pages_walked: walk.pages_walked,
        total_rows: walk.total_rows,
        pagination_total: walk.pagination_total,
        stop_reason: walk.stop_reason,
        error: walk.error || null,
      };
      if (walk.ok) {
        // Extract block_numbers from paid_only rows (they have raw.block_number)
        const paidOnlyBlocks = paidOnly
          .map((r) => r?.raw?.block_number)
          .filter((b) => b != null);
        // Index raw walk rows by block_number for fast lookup
        const rawByBlock = new Map();
        for (const row of walk.rows) {
          const bn = row.block_number ?? row.extrinsic?.block_number ?? null;
          if (bn != null) rawByBlock.set(String(bn), row);
        }
        out.raw_walk.paid_only_block_lookup = paidOnlyBlocks.map((bn) => {
          const found = rawByBlock.get(String(bn));
          return {
            block_number: bn,
            found_in_raw: !!found,
            raw_row: found ? found : null,
          };
        });
        // Also surface a small sample of the raw walk's row shape so we can see
        // exactly what fields /api/transfer/v1 returns (the iter-127 walker
        // reads t.to?.ss58 || t.to and t.from?.ss58 || t.from — confirm the
        // shape matches).
        out.raw_walk.sample_rows = walk.rows.slice(0, 5);
      }
    }

    // iter 139: balance-delta probe. For each paid_only row with a block_number,
    // fetch /api/account/history/v1 uncached (bypassing iter-125 memo + DB cache),
    // find the snapshots straddling the target block, and report the rootOnly +
    // total_balance delta. Decides between two fix paths for the iter-138 miss:
    //   (i)  rootOnly delta ≈ paid_only.amount_tao  →  balance-delta reconstruction
    //        on /api/account/history/v1 (which lib already walks) would catch the
    //        event; fix is in-lib, no new endpoint.
    //   (ii) rootOnly delta ≈ 0 but total_balance delta ≈ amount  →  event lives
    //        entirely inside balance_staked_alpha_as_tao; rootOnly walk misses it
    //        but balance_total walk catches it (semantic shift: PnL would include
    //        alpha-as-tao on starting too).
    //   (iii) both deltas ≈ 0  →  history/v1 doesn't see this event at all → must
    //         use staking-specific endpoint (/api/dtao/stake_balance_change/v1
    //         or similar).
    if (includeBalanceDeltaProbe) {
      const th = Date.now();
      // 20 pages × 200 rows ≈ enough for ~6 months of 12-rows/day history.
      const histWalk = await rawTaoWalk('/api/account/history/v1', { address: coldkey }, 20);
      out.balance_delta_probe = {
        ok: histWalk.ok,
        ms: Date.now() - th,
        pages_walked: histWalk.pages_walked,
        total_rows: histWalk.total_rows,
        pagination_total: histWalk.pagination_total,
        stop_reason: histWalk.stop_reason,
        error: histWalk.error || null,
      };
      if (histWalk.ok) {
        const snapshotsAsc = [...histWalk.rows]
          .filter((r) => r.block_number != null)
          .sort((a, b) => Number(a.block_number) - Number(b.block_number));
        const oldestBlock = snapshotsAsc[0]?.block_number ?? null;
        const newestBlock = snapshotsAsc[snapshotsAsc.length - 1]?.block_number ?? null;
        out.balance_delta_probe.oldest_block = oldestBlock;
        out.balance_delta_probe.newest_block = newestBlock;

        const TOLERANCE_TAO = 0.05; // 5τ-cents tolerance for the "matches" verdict
        out.balance_delta_probe.results = paidOnly.map((r) => {
          const targetBlock = r?.raw?.block_number;
          if (targetBlock == null) {
            return { target: r, error: 'no block_number on paid_only row' };
          }
          if (oldestBlock != null && targetBlock < oldestBlock) {
            return {
              target_block: targetBlock,
              target_date: r.date,
              target_amount_tao: r.amount_tao,
              target_direction: r.direction,
              verdict: 'pre_history_retention',
              note: `target block ${targetBlock} is older than oldest history snapshot ${oldestBlock}`,
            };
          }
          if (newestBlock != null && targetBlock > newestBlock) {
            return {
              target_block: targetBlock,
              target_date: r.date,
              target_amount_tao: r.amount_tao,
              target_direction: r.direction,
              verdict: 'post_history_newest',
              note: `target block ${targetBlock} is newer than newest history snapshot ${newestBlock}`,
            };
          }
          const { before, after } = findSnapshotPair(snapshotsAsc, targetBlock);
          if (!before || !after) {
            return {
              target_block: targetBlock,
              target_date: r.date,
              target_amount_tao: r.amount_tao,
              target_direction: r.direction,
              verdict: 'no_snapshot_pair',
              before_present: !!before,
              after_present: !!after,
            };
          }
          const beforeRoot = rootOnlyTao(before);
          const afterRoot = rootOnlyTao(after);
          const beforeTotal = totalTao(before);
          const afterTotal = totalTao(after);
          const deltaRoot = afterRoot - beforeRoot;
          const deltaTotal = afterTotal - beforeTotal;
          // Signed expected delta — inbound transfer credits balance, outbound debits.
          const expected = r.direction === 'in' ? r.amount_tao : -r.amount_tao;
          const rootMatches = Math.abs(deltaRoot - expected) <= TOLERANCE_TAO;
          const totalMatches = Math.abs(deltaTotal - expected) <= TOLERANCE_TAO;
          let verdict;
          if (rootMatches) verdict = 'root_delta_matches'; // fix path (i)
          else if (totalMatches) verdict = 'total_delta_matches_only'; // fix path (ii)
          else if (Math.abs(deltaRoot) < TOLERANCE_TAO && Math.abs(deltaTotal) < TOLERANCE_TAO)
            verdict = 'no_balance_delta'; // fix path (iii)
          else verdict = 'delta_present_but_unmatched';
          return {
            target_block: targetBlock,
            target_date: r.date,
            target_amount_tao: r.amount_tao,
            target_direction: r.direction,
            expected_signed_delta: expected,
            before_block: before.block_number,
            after_block: after.block_number,
            before_gap_blocks: targetBlock - Number(before.block_number),
            after_gap_blocks: Number(after.block_number) - targetBlock,
            before_timestamp: before.timestamp,
            after_timestamp: after.timestamp,
            before_root_tao: beforeRoot,
            after_root_tao: afterRoot,
            delta_root_tao: deltaRoot,
            before_total_tao: beforeTotal,
            after_total_tao: afterTotal,
            delta_total_tao: deltaTotal,
            verdict,
          };
        });
        // Roll-up verdict so the wake-script doesn't have to scan the array.
        const verdicts = out.balance_delta_probe.results
          .map((x) => x?.verdict)
          .filter(Boolean);
        const has = (v) => verdicts.includes(v);
        out.balance_delta_probe.rollup =
          has('delta_present_but_unmatched') ? 'mixed' :
          (verdicts.length > 0 && verdicts.every((v) => v === 'root_delta_matches')) ? 'all_root_match' :
          (verdicts.length > 0 && verdicts.every((v) => v === 'no_balance_delta')) ? 'all_invisible_to_history' :
          (has('root_delta_matches') && has('total_delta_matches_only')) ? 'mixed_root_and_total' :
          has('root_delta_matches') ? 'some_root_match' :
          has('total_delta_matches_only') ? 'some_total_only_match' :
          has('no_balance_delta') ? 'some_invisible_to_history' :
          'unclassified';
      }
    }
  }

  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
