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
import { u8aConcat, u8aToHex, hexToU8a, compactFromU8a } from '@polkadot/util';

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

// --- Stake leg (iter 165) ---
//
// Runtime API: `StakeInfoRuntimeApi_get_stake_info_for_coldkey(AccountId32)`
// (NOT `SubtensorRuntimeApi_*` — iter 163 spike named the wrong pallet; iter 165 VPS
// probe of finney enumerated the available runtime APIs and confirmed StakeInfoRuntimeApi
// is the correct namespace post-dTAO).
//
// Returns Vec<StakeInfo> where each StakeInfo entry is SCALE-encoded as:
//   hotkey            AccountId32  (32 bytes raw)
//   coldkey           AccountId32  (32 bytes raw, always == query coldkey)
//   netuid            Compact<u16> (1–3 bytes)
//   stake             Compact<u128>(1–17 bytes — alpha-share atoms, scaled 1e9)
//   locked            Compact<u128>(1–17 bytes — typically 0 for delegators)
//   emission          Compact<u128>(1–17 bytes — pending alpha emission)
//   drain             Compact<u128>(1–17 bytes — typically 0)
//   alpha_emission    Compact<u128>(1–17 bytes — separate from emission)
//   is_registered     bool         (1 byte: 0x00 false / 0x01 true)
//
// iter 165 VPS probe (Mantat coldkey 5CTRC3sQ…ArLn): 879ms round-trip, 1278-byte hex
// blob, 16 entries decoded, all sharing the same delegated hotkey 5876320…e403.
// Decoded netuid=0 stake = 2403351462 atoms = 2.403τ (matches canonical Mantat netuid=0
// alpha_shares=2.402892534 with ~459k atom drift = live chain vs api_snapshot.json
// freshness gap — within tolerance, confirms decode shape is correct).
//
// LIMITATION: this returns RAW ALPHA-SHARE atoms per (hotkey, netuid). Converting to
// TAO requires per-subnet alpha→TAO pool reserves (TaoIn / AlphaIn) via state_getStorage
// on SubtensorModule storage keys — that is iter 166's scope. Until then, this reader
// stays feature-flagged off because raw alpha sums are not directly comparable to
// canonical total_tao without the price conversion step.

function decodeStakeInfo(hex) {
  if (!hex || hex === '0x') return [];
  const bytes = hexToU8a(hex);
  const [lenOff, lenBn] = compactFromU8a(bytes);
  const N = Number(lenBn.toString());
  let off = lenOff;
  const entries = [];
  for (let i = 0; i < N; i++) {
    if (off + 64 > bytes.length) break;
    const hotkey = bytes.slice(off, off + 32);
    off += 32;
    const coldkey = bytes.slice(off, off + 32);
    off += 32;
    const [nuBytes, nuBn] = compactFromU8a(bytes.slice(off)); off += nuBytes;
    const [stBytes, stBn] = compactFromU8a(bytes.slice(off)); off += stBytes;
    const [loBytes, loBn] = compactFromU8a(bytes.slice(off)); off += loBytes;
    const [emBytes, emBn] = compactFromU8a(bytes.slice(off)); off += emBytes;
    const [drBytes, drBn] = compactFromU8a(bytes.slice(off)); off += drBytes;
    const [aeBytes, aeBn] = compactFromU8a(bytes.slice(off)); off += aeBytes;
    const reg = bytes[off]; off += 1;
    entries.push({
      hotkey: u8aToHex(hotkey),
      coldkey: u8aToHex(coldkey),
      netuid: Number(nuBn.toString()),
      stakeAlphaAtoms: stBn.toString(),
      stakeAlpha: Number(stBn.toString()) / 1e9,
      lockedAlpha: Number(loBn.toString()) / 1e9,
      emissionAlpha: Number(emBn.toString()) / 1e9,
      alphaEmissionAlpha: Number(aeBn.toString()) / 1e9,
      isRegistered: reg === 1,
    });
  }
  return entries;
}

export async function getColdkeyStakeAlpha(coldkey, opts = {}) {
  const pubkeyHex = u8aToHex(decodeAddress(coldkey));
  const t0 = Date.now();
  const hex = await rpc('state_call', ['StakeInfoRuntimeApi_get_stake_info_for_coldkey', pubkeyHex, null], opts);
  const latencyMs = Date.now() - t0;
  const entries = decodeStakeInfo(hex);
  const totalStakeAlpha = entries.reduce((s, e) => s + e.stakeAlpha, 0);
  return {
    coldkey,
    entries,
    entryCount: entries.length,
    totalStakeAlpha,
    latencyMs,
    source: 'finney-rpc:StakeInfoRuntimeApi',
    note: 'raw alpha-share atoms per (hotkey, netuid); iter 166 will convert to TAO via per-subnet pool reserves',
  };
}

export const __internals = { accountStorageKey, decodeAccountInfo, decodeStakeInfo, rpc };
