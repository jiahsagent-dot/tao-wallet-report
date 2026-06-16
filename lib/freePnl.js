// Free-API PnL composer (iter 168) — first slice of priority #1.
//
// Composes the three legs shipped in iters 164/165/167 into a single
// per-coldkey `total_tao` reading from public finney HTTPS RPC, with
// zero Taostats dependency:
//
//   freeTao     = System::Account.data.free                (iter 164)
//   stakeTao    = Σ StakeInfo.stake × SubnetTAO/SubnetAlphaIn (iters 165 + 167)
//   totalTao    = freeTao + stakeTao
//
// Surface shape mirrors `pnlGroundTruth` minimally so a future shadow-mode
// flag (iter 169 candidate) can drop this into report.js without reshaping.
// This module is currently UNUSED by buildReport — feature-flag wiring is
// the next iter. Keeping it isolated keeps the production blast radius nil.

import { getFreeBalance, getColdkeyStakeTao } from './freeRpc.js';

export async function getColdkeyBalance(coldkey, opts = {}) {
  const t0 = Date.now();
  const [free, stake] = await Promise.all([
    getFreeBalance(coldkey, opts),
    getColdkeyStakeTao(coldkey, opts),
  ]);
  const totalTao = free.freeTao + stake.totalStakeTao;
  return {
    coldkey,
    totalTao,
    freeTao: free.freeTao,
    stakeTao: stake.totalStakeTao,
    stakeAlpha: stake.totalStakeAlpha,
    latencyMs: {
      free: free.latencyMs,
      stake: stake.latencyMs.total,
      wallClock: Date.now() - t0,
    },
    rpcCalls: 1 + stake.rpcCalls, // free balance + (stake leg + price leg)
    source: 'finney-rpc:freePnl',
    legs: { free, stake },
  };
}

export async function getColdkeyBalances(coldkeys, opts = {}) {
  const out = [];
  for (const ck of coldkeys) {
    try {
      out.push(await getColdkeyBalance(ck, opts));
    } catch (err) {
      out.push({ coldkey: ck, error: err.message, source: 'finney-rpc:freePnl' });
    }
  }
  return out;
}
