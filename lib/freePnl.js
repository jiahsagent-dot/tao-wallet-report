// Free-API PnL composer (iter 168) — first slice of priority #1.
//
// Composes the three legs shipped in iters 164/165/167 into a single
// per-coldkey `total_tao` reading from public finney HTTPS RPC, with
// zero Taostats dependency:
//
//   freeTao     = System::Account.data.free                (iter 164)
//   reservedTao = System::Account.data.reserved            (iter 257)
//   stakeTao    = Σ StakeInfo.stake × SubnetTAO/SubnetAlphaIn (iters 165 + 167)
//   totalTao    = freeTao + reservedTao + stakeTao
//
// Surface shape mirrors `pnlGroundTruth` minimally so a future shadow-mode
// flag (iter 169 candidate) can drop this into report.js without reshaping.
//
// Iter 257 — pre-flight fix for iter 258 graduation. Iter 256 validation on
// 3 wallets showed a stable 93 mτ shortfall vs Taostats `balance_total`
// caused by omitting `System::Account.data.reserved` (a locked subnet-reg
// bond). freeRpc.getFreeBalance already decodes and returns `reservedTao`;
// this iter just adds it to totalTao and the return shape so shadow drift
// on the total matches Taostats within ±10 mτ (2 of 3 probed wallets;
// third wallet's residual ~30 mτ is same-block AMM drift, tracked for
// iter 258+).

import { getFreeBalance, getColdkeyStakeTao } from './freeRpc.js';

export async function getColdkeyBalance(coldkey, opts = {}) {
  const t0 = Date.now();
  const [free, stake] = await Promise.all([
    getFreeBalance(coldkey, opts),
    getColdkeyStakeTao(coldkey, opts),
  ]);
  const reservedTao = free.reservedTao || 0;
  const totalTao = free.freeTao + reservedTao + stake.totalStakeTao;
  return {
    coldkey,
    totalTao,
    freeTao: free.freeTao,
    reservedTao,
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
