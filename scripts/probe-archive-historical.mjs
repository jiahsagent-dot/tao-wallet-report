// iter 282 spike — archive.chain.opentensor.ai historical System.Account fetch
// Goal: verify (a) block-time post-DTAO, (b) state_getStorageAt latency at archive,
// (c) decoded free balance for known coldkey at 7d/30d/365d ago.
//
// Run: node scripts/probe-archive-historical.mjs
// Requires node_modules (npm install).

import { xxhashAsU8a, blake2AsU8a, decodeAddress } from '@polkadot/util-crypto';
import { u8aConcat, u8aToHex } from '@polkadot/util';

const ARCHIVE = 'https://archive.chain.opentensor.ai';
const COLDKEY = '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd';
const TIMEOUT_MS = 15_000;

function accountStorageKey(coldkey) {
  const pubkey = decodeAddress(coldkey);
  const palletHash = xxhashAsU8a('System', 128);
  const storageHash = xxhashAsU8a('Account', 128);
  const accountHash = blake2AsU8a(pubkey, 128);
  return u8aToHex(u8aConcat(palletHash, storageHash, accountHash, pubkey));
}

async function rpc(method, params, label = '') {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ARCHIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const json = await r.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    const ms = Date.now() - t0;
    return { result: json.result, ms };
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

function extractTimestampSeconds(extrinsicsHex) {
  // SCALE-encoded Vec<extrinsic>. First extrinsic is Timestamp.set(now: Compact<u64> millis).
  // We don't fully decode; we scan the first ~80 bytes for the timestamp.set call.
  // Easier path: use a separate RPC. We'll just return null and use block height for spacing.
  return null;
}

async function main() {
  console.log(`# Archive probe: ${ARCHIVE}`);
  console.log(`# Coldkey: ${COLDKEY}`);
  console.log('');

  // 1. Sanity — chain identity + finalized head
  const chain = await rpc('system_chain', []);
  const head = await rpc('chain_getHeader', []);
  const headNum = parseInt(head.result.number, 16);
  console.log(`chain="${chain.result}" (${chain.ms}ms)`);
  console.log(`finalized head #${headNum} (${head.ms}ms)`);
  console.log('');

  // 2. Block-time observation — sample 2 hashes 7200 blocks apart
  const earlier = await rpc('chain_getBlockHash', [headNum - 7200]);
  const headerEarlier = await rpc('chain_getHeader', [earlier.result]);
  const earlierNum = parseInt(headerEarlier.result.number, 16);
  // Use chain_getBlock to get extrinsics → first one is Timestamp.set
  const blockHead = await rpc('chain_getBlock', [head.result.hash || (await rpc('chain_getBlockHash', [headNum])).result]);
  const blockEarlier = await rpc('chain_getBlock', [earlier.result]);
  // Timestamp.set extrinsic: length-prefix(compact) + sig-flag(0x04?) + call index + Compact<u64 millis>
  // The reliable trick: take first extrinsic, strip compact length, the call body's u64 millis is at a known offset.
  function decodeTimestamp(extrinsicHex) {
    // extrinsicHex = '0x' + ... ; first extrinsic in block.block.extrinsics[0]
    const buf = Buffer.from(extrinsicHex.replace(/^0x/, ''), 'hex');
    // SCALE compact length-prefix: first byte tells mode. For >63B extrinsic use multi-byte.
    // Skip compact: mode = buf[0] & 0x03
    let offset = 0;
    const mode = buf[0] & 0x03;
    if (mode === 0) offset = 1;
    else if (mode === 1) offset = 2;
    else if (mode === 2) offset = 4;
    else offset = 1 + (buf[0] >> 2) + 1;
    // Then: version byte (0x04 unsigned)
    offset += 1;
    // Then: pallet index + call index (2 bytes)
    offset += 2;
    // Then: Compact<u64> millis. For Bittensor block time ~12s ~1e10 millis since epoch, fits in u64.
    // Compact<u64> for big values uses mode=3: first byte 0b------11, length follows.
    const cmpMode = buf[offset] & 0x03;
    let millis = 0n;
    if (cmpMode === 0) {
      millis = BigInt(buf[offset] >> 2);
      offset += 1;
    } else if (cmpMode === 1) {
      const v = (buf[offset] | (buf[offset + 1] << 8)) >>> 2;
      millis = BigInt(v);
      offset += 2;
    } else if (cmpMode === 2) {
      const v = (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 2;
      millis = BigInt(v >>> 0);
      offset += 4;
    } else {
      const nBytes = (buf[offset] >> 2) + 4;
      offset += 1;
      for (let i = 0; i < nBytes; i++) {
        millis |= BigInt(buf[offset + i]) << BigInt(8 * i);
      }
      offset += nBytes;
    }
    return Number(millis);
  }
  let secondsPerBlock = null;
  try {
    const tHead = decodeTimestamp(blockHead.result.block.extrinsics[0]);
    const tEarlier = decodeTimestamp(blockEarlier.result.block.extrinsics[0]);
    secondsPerBlock = (tHead - tEarlier) / 1000 / (headNum - earlierNum);
    console.log(`block-time sample: head ts=${new Date(tHead).toISOString()} / earlier ts=${new Date(tEarlier).toISOString()}`);
    console.log(`  → ${secondsPerBlock.toFixed(3)}s/block over ${headNum - earlierNum} blocks`);
  } catch (e) {
    console.log(`block-time decode failed: ${e.message} — falling back to 12.0s/block assumption`);
    secondsPerBlock = 12.0;
  }
  console.log('');

  // 3. Compute target blocks for 7d / 30d / 365d ago
  const sPerBlock = secondsPerBlock || 12.0;
  const targets = [
    { label: '7d ago',   secAgo: 7   * 86400 },
    { label: '30d ago',  secAgo: 30  * 86400 },
    { label: '365d ago', secAgo: 365 * 86400 },
  ];
  for (const t of targets) {
    t.blockNum = Math.max(1, Math.floor(headNum - t.secAgo / sPerBlock));
  }

  // 4. Fetch System.Account at each target
  const key = accountStorageKey(COLDKEY);
  console.log(`storage key: ${key.slice(0, 26)}…`);
  console.log('');

  for (const t of targets) {
    try {
      const hash = await rpc('chain_getBlockHash', [t.blockNum]);
      const stor = await rpc('state_getStorageAt', [key, hash.result]);
      const { freeRao, reservedRao, bytes } = decodeAccountInfo(stor.result);
      console.log(`${t.label.padEnd(10)} block #${t.blockNum}`);
      console.log(`  hash=${hash.result.slice(0, 18)}… (${hash.ms}ms)`);
      console.log(`  storage bytes=${bytes} (${stor.ms}ms)`);
      console.log(`  free=${(Number(freeRao) / 1e9).toFixed(6)}τ  reserved=${(Number(reservedRao) / 1e9).toFixed(6)}τ`);
    } catch (e) {
      console.log(`${t.label.padEnd(10)} FAIL: ${e.message}`);
    }
    console.log('');
  }

  // 5. Current-block reference for parity
  try {
    const currentHash = (await rpc('chain_getBlockHash', [headNum])).result;
    const stor = await rpc('state_getStorageAt', [key, currentHash]);
    const { freeRao, reservedRao } = decodeAccountInfo(stor.result);
    console.log(`CURRENT  block #${headNum}`);
    console.log(`  free=${(Number(freeRao) / 1e9).toFixed(6)}τ  reserved=${(Number(reservedRao) / 1e9).toFixed(6)}τ (${stor.ms}ms)`);
  } catch (e) {
    console.log(`CURRENT  FAIL: ${e.message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
