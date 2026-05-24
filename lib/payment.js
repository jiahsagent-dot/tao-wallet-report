// Payment session helpers: unique amount generation, Taostats transfer lookup.
import crypto from 'node:crypto';

const TIP_ADDRESS = '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH';

// Generate a unique micro-amount that's hard to collide:
// 0.0100 τ base + random 0001..0099 in the 4th decimal = 0.0101..0.0199 τ.
// At $280/τ that's ~$2.80–$5.60 per payment. Good enough for $3-ish unlock.
export function generateUniqueAmount() {
  const extra = (crypto.randomInt(1, 100)) / 10000; // 0.0001 .. 0.0099
  const amount = 0.01 + extra;
  return Number(amount.toFixed(4));
}

// Compute session expiry (10 min default).
export function expiryFromNow(minutes = 10) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// Poll Taostats for an inbound transfer to the tip address with the exact amount.
// Returns the matching extrinsic_id if found, else null.
//
// Taostats transfer endpoint:
//   GET /api/transfer/v1?to=<addr>&page=1&limit=50
//
// Amount in TAO. Taostats returns amount in rao (10^-9 τ).
export async function findMatchingTransfer({ amountTao, sinceIso }) {
  const key = process.env.TAOSTATS_API_KEY;
  if (!key) throw new Error('TAOSTATS_API_KEY missing');

  const url = new URL('https://api.taostats.io/api/transfer/v1');
  url.searchParams.set('to', TIP_ADDRESS);
  url.searchParams.set('limit', '100');
  url.searchParams.set('page', '1');

  const r = await fetch(url, { headers: { Authorization: key, Accept: 'application/json' } });
  if (!r.ok) {
    throw new Error(`Taostats transfer ${r.status}`);
  }
  const j = await r.json();
  const rows = j?.data || [];

  const sinceMs = new Date(sinceIso).getTime();
  // Allow 0.00005 τ rounding tolerance (= 50000 rao)
  const targetRao = Math.round(amountTao * 1e9);
  const tolerance = 50_000;

  for (const row of rows) {
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
    if (ts < sinceMs) continue;
    const amountRao = Number(row.amount || 0);
    if (Math.abs(amountRao - targetRao) <= tolerance) {
      return {
        extrinsicId: row.extrinsic_id || row.id || `${row.block_number}-${row.extrinsic_index}`,
        block: row.block_number,
        timestamp: row.timestamp,
        actualAmountTao: amountRao / 1e9,
      };
    }
  }
  return null;
}

export const TIP_ADDRESS_STR = TIP_ADDRESS;
