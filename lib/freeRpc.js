// Free Substrate RPC reader for the ground-truth balance leg.
// Feature-flagged off: nothing in lib/report.js imports this yet (iter 165+ will wire it in).
//
// Endpoint: https://entrypoint-finney.opentensor.ai (HTTPS POST, anonymous, no API key).
// Replaces paid Taostats /api/account/latest/v1 for current free + reserved balance.
//
// Decode reference (Bittensor finney specVersion 417, verified by iter 164 VPS probe):
//   System::Account = StorageMap(twox_128("System") + twox_128("Account")
//                                 + blake2_128_concat(AccountId32))
//   AccountInfo SCALE bytes (56 bytes observed for active accounts):
//     nonce u32 + consumers u32 + providers u32 + sufficients u32      (16 bytes)
//     data.free u64 LE       @ offset 16   (8 bytes)
//     data.reserved u64 LE   @ offset 24   (8 bytes)
//     data.misc_frozen u64 + data.fee_frozen u64 + data.flags u64       (24 bytes, ignored)
//
// Inactive coldkeys return result=null → treat as zero balance.

import { xxhashAsU8a, blake2AsU8a, decodeAddress } from '@polkadot/util-crypto';
import { u8aConcat, u8aToHex } from '@polkadot/util';

const DEFAULT_ENDPOINT = 'https://entrypoint-finney.opentensor.ai';
const DEFAULT_TIMEOUT_MS = 10_000;

function accountStorageKey(coldkey) {
  const pubkey = decodeAddress(coldkey);
  const palletHash = xxhashAsU8a('System', 128);
  const storageHash = xxhashAsU8a('Account', 128);
  const accountHash = blake2AsU8a(pubkey, 128);
  return u8aToHex(u8aConcat(palletHash, storageHash, accountHash, pubkey));
}

async function rpc(method, params, { endpoint = DEFAULT_ENDPOINT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`finney RPC ${method} → http ${r.status}`);
    const json = await r.json();
    if (json.error) throw new Error(`finney RPC ${method} → ${json.error.message || JSON.stringify(json.error)}`);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

function decodeAccountInfo(hex) {
  if (!hex || hex === '0x') return { freeRao: 0n, reservedRao: 0n, bytes: 0 };
  const buf = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  if (buf.length < 32) throw new Error(`AccountInfo SCALE too short: ${buf.length} bytes`);
  return {
    freeRao: buf.readBigUInt64LE(16),
    reservedRao: buf.readBigUInt64LE(24),
    bytes: buf.length,
  };
}

export async function getFreeBalance(coldkey, opts = {}) {
  const key = accountStorageKey(coldkey);
  const t0 = Date.now();
  const hex = await rpc('state_getStorage', [key], opts);
  const latencyMs = Date.now() - t0;
  const { freeRao, reservedRao, bytes } = decodeAccountInfo(hex);
  return {
    coldkey,
    freeTao: Number(freeRao) / 1e9,
    reservedTao: Number(reservedRao) / 1e9,
    freeRao: freeRao.toString(),
    reservedRao: reservedRao.toString(),
    rawBytes: bytes,
    latencyMs,
    source: 'finney-rpc',
    endpoint: opts.endpoint || DEFAULT_ENDPOINT,
  };
}

export async function getFreeBalances(coldkeys, opts = {}) {
  const out = [];
  for (const ck of coldkeys) {
    try {
      out.push(await getFreeBalance(ck, opts));
    } catch (err) {
      out.push({ coldkey: ck, error: err.message, source: 'finney-rpc' });
    }
  }
  return out;
}

export const __internals = { accountStorageKey, decodeAccountInfo, rpc };
