// iter 283 spike — archive.chain.opentensor.ai historical stake-leg fetch
// Goal: verify state_call(StakeInfoRuntimeApi_get_stake_info_for_coldkey, pubkey, blockHash)
// and state_queryStorageAt(SubnetTAO/SubnetAlphaIn keys, blockHash) wrap at historical blocks
// on the archive node. If both work, iter 283 ships getHistoricalColdkeyStakeAlpha + getHistoricalSubnetPrices.
//
// Run: node scripts/probe-archive-stake.mjs
// Requires node_modules (npm install).

import { xxhashAsU8a, decodeAddress } from '@polkadot/util-crypto';
import { u8aConcat, u8aToHex, hexToU8a, compactFromU8a } from '@polkadot/util';

const ARCHIVE = 'https://archive.chain.opentensor.ai';
const COLDKEY = '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd';
const BLOCK_TIME_S = 12.545;
const TIMEOUT_MS = 20_000;

async function rpc(method, params) {
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
    return { result: json.result, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function decodeStakeInfo(hex) {
  if (!hex || hex === '0x') return [];
  const bytes = hexToU8a(hex);
  const [lenOff, lenBn] = compactFromU8a(bytes);
  const N = Number(lenBn.toString());
  let off = lenOff;
  const entries = [];
  for (let i = 0; i < N; i++) {
    if (off + 64 > bytes.length) break;
    const hotkey = bytes.slice(off, off + 32); off += 32;
    const coldkey = bytes.slice(off, off + 32); off += 32;
    const [nuBytes, nuBn] = compactFromU8a(bytes.slice(off)); off += nuBytes;
    const [stBytes, stBn] = compactFromU8a(bytes.slice(off)); off += stBytes;
    const [loBytes] = compactFromU8a(bytes.slice(off)); off += loBytes;
    const [emBytes] = compactFromU8a(bytes.slice(off)); off += emBytes;
    const [drBytes] = compactFromU8a(bytes.slice(off)); off += drBytes;
    const [aeBytes] = compactFromU8a(bytes.slice(off)); off += aeBytes;
    off += 1; // is_registered
    entries.push({
      hotkey: u8aToHex(hotkey).slice(0, 12),
      netuid: Number(nuBn.toString()),
      stakeAlpha: Number(stBn.toString()) / 1e9,
    });
  }
  return entries;
}

function subnetPoolKey(item, netuid) {
  const palletHash = xxhashAsU8a('SubtensorModule', 128);
  const storageHash = xxhashAsU8a(item, 128);
  const nu = new Uint8Array(2);
  nu[0] = netuid & 0xff; nu[1] = (netuid >> 8) & 0xff;
  return u8aToHex(u8aConcat(palletHash, storageHash, nu));
}

function decodeU64LE(hex) {
  if (!hex || hex === '0x') return 0n;
  return Buffer.from(hex.replace(/^0x/, ''), 'hex').readBigUInt64LE(0);
}

async function probeAt(label, blockHash, blockNum) {
  console.log(`--- ${label} (block #${blockNum} ${blockHash.slice(0, 18)}…) ---`);

  // (a) state_call StakeInfoRuntimeApi at this block
  const pubkeyHex = u8aToHex(decodeAddress(COLDKEY));
  try {
    const stake = await rpc('state_call', ['StakeInfoRuntimeApi_get_stake_info_for_coldkey', pubkeyHex, blockHash]);
    const entries = decodeStakeInfo(stake.result);
    const totalAlpha = entries.reduce((s, e) => s + e.stakeAlpha, 0);
    const byNu = {};
    for (const e of entries) byNu[e.netuid] = (byNu[e.netuid] || 0) + e.stakeAlpha;
    console.log(`  stake: ${entries.length} entries, total ${totalAlpha.toFixed(4)} α (${stake.ms}ms)`);
    console.log(`  per-netuid α: ${Object.entries(byNu).slice(0, 6).map(([n, a]) => `nu${n}=${a.toFixed(3)}`).join(', ')}${Object.keys(byNu).length > 6 ? '…' : ''}`);

    // (b) state_queryStorageAt SubnetTAO/SubnetAlphaIn at this block for the subnets they hold
    const netuids = [...new Set(entries.map(e => e.netuid))].filter(n => n > 0);
    if (netuids.length > 0) {
      const keys = [];
      for (const nu of netuids) { keys.push(subnetPoolKey('SubnetTAO', nu)); keys.push(subnetPoolKey('SubnetAlphaIn', nu)); }
      const prices = await rpc('state_queryStorageAt', [keys, blockHash]);
      const byKey = {};
      for (const [k, v] of (prices.result?.[0]?.changes || [])) byKey[k.toLowerCase()] = v;
      let totalTao = 0;
      const priceSamples = [];
      for (const nu of netuids) {
        const taoIn = decodeU64LE(byKey[subnetPoolKey('SubnetTAO', nu).toLowerCase()]);
        const alphaIn = decodeU64LE(byKey[subnetPoolKey('SubnetAlphaIn', nu).toLowerCase()]);
        const p = alphaIn > 0n ? Number(taoIn) / Number(alphaIn) : 0;
        const a = byNu[nu] || 0;
        totalTao += a * p;
        if (priceSamples.length < 5) priceSamples.push(`nu${nu}=${p.toFixed(4)}τ/α`);
      }
      console.log(`  prices: ${keys.length} keys, ${netuids.length} subnets (${prices.ms}ms)`);
      console.log(`  sample: ${priceSamples.join(', ')}${netuids.length > 5 ? '…' : ''}`);
      console.log(`  stakeTao(composed) = ${totalTao.toFixed(4)}τ`);
    } else {
      console.log(`  prices: skipped (no non-root subnets)`);
    }
  } catch (e) {
    console.log(`  FAIL: ${e.message}`);
  }
  console.log('');
}

async function probeComposer(label, secAgo) {
  const { getHistoricalColdkeyBalance } = await import('../lib/freeRpc.js');
  console.log(`--- COMPOSER ${label} (secAgo=${secAgo}) ---`);
  try {
    const t0 = Date.now();
    const r = await getHistoricalColdkeyBalance(COLDKEY, secAgo);
    const wall = Date.now() - t0;
    console.log(`  block #${r.blockNumber} ${r.blockHash.slice(0, 18)}…`);
    console.log(`  freeTao=${r.freeTao.toFixed(6)}τ reservedTao=${r.reservedTao.toFixed(6)}τ stakeTao=${r.stakeTao.toFixed(4)}τ`);
    console.log(`  totalTao=${r.totalTao.toFixed(4)}τ across ${r.byNetuid.length} subnets`);
    console.log(`  latency: head=${r.latencyMs.head}ms hash=${r.latencyMs.blockHash}ms legsParallel=${r.latencyMs.legsParallel}ms (free=${r.latencyMs.free}ms stake=${r.latencyMs.stake}ms) total=${r.latencyMs.total}ms`);
    console.log(`  wall-clock: ${wall}ms, rpcCalls=${r.rpcCalls}`);
  } catch (e) {
    console.log(`  FAIL: ${e.message}`);
  }
  console.log('');
}

async function main() {
  console.log(`# Archive stake-leg probe: ${ARCHIVE}`);
  console.log(`# Coldkey: ${COLDKEY}`);
  console.log('');

  const head = await rpc('chain_getHeader', []);
  const headNum = parseInt(head.result.number, 16);
  console.log(`finalized head #${headNum} (${head.ms}ms)`);
  console.log('');

  const targets = [
    { label: 'CURRENT',  secAgo: 0 },
    { label: '7d ago',   secAgo: 7  * 86400 },
    { label: '30d ago',  secAgo: 30 * 86400 },
  ];

  for (const t of targets) {
    const blockNum = t.secAgo === 0 ? headNum : Math.max(1, Math.floor(headNum - t.secAgo / BLOCK_TIME_S));
    const hash = await rpc('chain_getBlockHash', [blockNum]);
    await probeAt(t.label, hash.result, blockNum);
  }

  // iter 221 composer probe: getHistoricalColdkeyBalance ties iter 219 free + iter 220 stake at a shared blockHash.
  console.log('# Iter 221 composer probe (getHistoricalColdkeyBalance: free + reserved + stakeTao at single archive blockHash)');
  console.log('');
  for (const t of targets) {
    await probeComposer(t.label, t.secAgo);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
