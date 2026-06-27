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

// --- Historical free balance (iter 282) ---
//
// Endpoint: https://archive.chain.opentensor.ai (anonymous HTTPS POST, serves deep history).
// Reuses System.Account storage key + 56-byte u64 LE decoder unchanged from current-state path.
// Only differences vs getFreeBalance: archive endpoint + state_getStorageAt(key, blockHash) positional.
//
// Block-time observed by iter 282 spike: 12.545s/block over a 7200-block sample.
// Probe latency: ~225ms per RPC; two RPCs per historical point (chain_getBlockHash + state_getStorageAt) ≈ 450ms.
//
// Feature-flagged off: nothing in lib/report.js or lib/pnl.js imports this yet.
// iter 283 will add the stake-leg counterpart (state_call StakeInfoRuntimeApi at blockHash),
// iter 284 will compose getHistoricalColdkeyBalance and wire as candidate startingBalanceTao.

const ARCHIVE_ENDPOINT = 'https://archive.chain.opentensor.ai';
const ARCHIVE_BLOCK_TIME_S = 12.545;

export function blockNumberForSecondsAgo(currentBlock, secondsAgo, sPerBlock = ARCHIVE_BLOCK_TIME_S) {
  return Math.max(1, Math.floor(currentBlock - secondsAgo / sPerBlock));
}

export async function getHistoricalFreeBalance(coldkey, blockHash, opts = {}) {
  const key = accountStorageKey(coldkey);
  const endpoint = opts.endpoint || ARCHIVE_ENDPOINT;
  const t0 = Date.now();
  const hex = await rpc('state_getStorageAt', [key, blockHash], { ...opts, endpoint });
  const latencyMs = Date.now() - t0;
  const { freeRao, reservedRao, bytes } = decodeAccountInfo(hex);
  return {
    coldkey,
    blockHash,
    freeTao: Number(freeRao) / 1e9,
    reservedTao: Number(reservedRao) / 1e9,
    freeRao: freeRao.toString(),
    reservedRao: reservedRao.toString(),
    rawBytes: bytes,
    latencyMs,
    source: 'archive-rpc',
    endpoint,
  };
}

export async function getArchiveFinalizedHead(opts = {}) {
  const endpoint = opts.endpoint || ARCHIVE_ENDPOINT;
  const header = await rpc('chain_getHeader', [], { ...opts, endpoint });
  return parseInt(header.number, 16);
}

export async function getArchiveBlockHash(blockNumber, opts = {}) {
  const endpoint = opts.endpoint || ARCHIVE_ENDPOINT;
  return await rpc('chain_getBlockHash', [blockNumber], { ...opts, endpoint });
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

// --- Price leg (iter 167) ---
//
// Per-subnet alpha→TAO pool reserves via SubtensorModule storage.
//
// Storage names (iter 167 VPS probe enumerated via state_getKeysPaged): the dTAO pool
// reserves live under `SubnetTAO(netuid)` and `SubnetAlphaIn(netuid)` — NOT `TaoIn` /
// `AlphaIn` as iter 165's wake plan guessed. Both are StorageMap<_, Identity, u16, u64>,
// so the storage key is `xxhash128("SubtensorModule") + xxhash128("SubnetTAO") +
// netuid_le_2bytes`. Values are SCALE-encoded u64 LE (rao-scaled, divide by 1e9 for
// human TAO / alpha).
//
// Price formula: price[netuid] = SubnetTAO(netuid) / SubnetAlphaIn(netuid)  (TAO per α).
// Root netuid 0 has no AMM pool; convention is 1.0 (1 α-root = 1 τ).
//
// Validation (iter 167 VPS probe, 2026-06-16):
//   - 12/14 sampled subnets within 1% drift of canonical screener prices
//     (most <0.3%; netuid 68 = 2.04%, netuid 95 = 1.19% — live-vs-snapshot freshness)
//   - Mantat full Σ(stakeAlpha × price) = 11.81τ vs canonical 12.28τ snapshot = 3.81% drift
//     (entirely attributable to snapshot freshness; per-subnet prices match within 0.5%)
//
// Batching: use `state_queryStorageAt` to fetch N×2 keys in one RPC round-trip — finney
// HTTPS rate-limits aggressive sequential `state_getStorage` calls (~16 in 2s triggers
// "You are sending too many requests"). One batch call for all coldkey subnets = safe.

function subnetPoolKey(item, netuid) {
  const palletHash = xxhashAsU8a('SubtensorModule', 128);
  const storageHash = xxhashAsU8a(item, 128);
  const nu = new Uint8Array(2);
  nu[0] = netuid & 0xff;
  nu[1] = (netuid >> 8) & 0xff;
  return u8aToHex(u8aConcat(palletHash, storageHash, nu));
}

function decodeU64LE(hex) {
  if (!hex || hex === '0x') return 0n;
  return Buffer.from(hex.replace(/^0x/, ''), 'hex').readBigUInt64LE(0);
}

export async function getSubnetPrices(netuids, opts = {}) {
  const targets = [...new Set(netuids.map(Number))].filter(n => Number.isInteger(n) && n > 0);
  const prices = { 0: 1.0 };
  const reserves = { 0: { taoIn: null, alphaIn: null, note: 'root: no AMM pool, 1:1 convention' } };
  if (targets.length === 0) return { prices, reserves, latencyMs: 0, source: 'finney-rpc:SubtensorModule' };
  const keys = [];
  for (const nu of targets) { keys.push(subnetPoolKey('SubnetTAO', nu)); keys.push(subnetPoolKey('SubnetAlphaIn', nu)); }
  const t0 = Date.now();
  const result = await rpc('state_queryStorageAt', [keys], opts);
  const latencyMs = Date.now() - t0;
  const byKey = {};
  for (const [k, v] of (result?.[0]?.changes || [])) byKey[k.toLowerCase()] = v;
  for (const nu of targets) {
    const taoIn = decodeU64LE(byKey[subnetPoolKey('SubnetTAO', nu).toLowerCase()]);
    const alphaIn = decodeU64LE(byKey[subnetPoolKey('SubnetAlphaIn', nu).toLowerCase()]);
    const price = alphaIn > 0n ? Number(taoIn) / Number(alphaIn) : 0;
    prices[nu] = price;
    reserves[nu] = { taoInRao: taoIn.toString(), alphaInRao: alphaIn.toString(), taoIn: Number(taoIn) / 1e9, alphaIn: Number(alphaIn) / 1e9 };
  }
  return { prices, reserves, latencyMs, source: 'finney-rpc:SubtensorModule.SubnetTAO/SubnetAlphaIn', batchSize: keys.length };
}

export async function getColdkeyStakeTao(coldkey, opts = {}) {
  const stake = await getColdkeyStakeAlpha(coldkey, opts);
  const netuids = [...new Set(stake.entries.map(e => e.netuid))];
  const { prices, reserves, latencyMs: priceLatencyMs, batchSize } = await getSubnetPrices(netuids, opts);
  let totalStakeTao = 0;
  const entries = stake.entries.map(e => {
    const price = prices[e.netuid] ?? 0;
    const stakeTao = e.stakeAlpha * price;
    totalStakeTao += stakeTao;
    return { ...e, price, stakeTao };
  });
  const byNetuid = {};
  for (const e of entries) {
    if (!byNetuid[e.netuid]) byNetuid[e.netuid] = { netuid: e.netuid, stakeAlpha: 0, stakeTao: 0, price: e.price, hotkeyCount: 0 };
    byNetuid[e.netuid].stakeAlpha += e.stakeAlpha;
    byNetuid[e.netuid].stakeTao += e.stakeTao;
    byNetuid[e.netuid].hotkeyCount += 1;
  }
  return {
    coldkey,
    totalStakeTao,
    totalStakeAlpha: stake.totalStakeAlpha,
    entries,
    byNetuid: Object.values(byNetuid).sort((a, b) => a.netuid - b.netuid),
    prices,
    reserves,
    rpcCalls: 2,
    latencyMs: { stake: stake.latencyMs, prices: priceLatencyMs, total: stake.latencyMs + priceLatencyMs },
    poolKeyBatchSize: batchSize,
    source: 'finney-rpc:StakeInfoRuntimeApi+SubtensorModule',
    note: 'free per-coldkey total_stake_tao via 2 RPC calls; price leg uses live chain pool reserves',
  };
}

export const __internals = { accountStorageKey, decodeAccountInfo, decodeStakeInfo, subnetPoolKey, decodeU64LE, rpc };
