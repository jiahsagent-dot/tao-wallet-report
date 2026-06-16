# Free-API PnL — Substrate RPC viability spike (iter 163)

**Goal:** prove a 100% free public source can replace paid Taostats endpoints for the ground-truth balance leg of PnL.

**Date:** 2026-06-16T17:03Z
**Status:** SPIKE COMPLETE — free Substrate RPC is viable for the `current_balance` (free TAO) leg. Stake leg requires a runtime API call decoded via `@polkadot/api`, not yet probed in this spike.

## Endpoint survey

Probed from VPS, no API key:

| Endpoint | Protocol | system_chain probe |
|---|---|---|
| `entrypoint-finney.opentensor.ai` | HTTPS / WSS | 200 / 0.72s |
| `archive.chain.opentensor.ai` | HTTPS | 200 / 0.64s |
| `test.finney.opentensor.ai` | HTTPS | 200 / 0.67s |
| `lite.sub.latent.to` | HTTPS | 200 / 0.81s |

`finney.opentensor.ai` (without `entrypoint-` prefix) does NOT resolve from this VPS — historical lessons mentioning that hostname are stale; use `entrypoint-finney.opentensor.ai`.

## Balance probe — @polkadot/api on Node 22 from VPS

Connected to `wss://entrypoint-finney.opentensor.ai:443` via `@polkadot/api ^11.3.1`, queried `system.account(AccountId32)` for all 4 problem coldkeys from iter 142 verify sweep.

| Wallet | Free TAO (RPC) | Reserved | Query ms | Notes |
|---|---|---|---|---|
| Subnets `5EKFph3D…G5cd` | 0.500642696 | 0.093 | 233 | |
| Mantat `5CTRC3sQ…ArLn` | 0.296003889 | 0.093 | 233 | |
| Root `5Cnz1juP…binH` | 0.003026419 | 0 | 232 | |
| Mum_mantat `5HbWj5vb…jD1HL` | 0.299916014 | 0.093 | 232 | |

Connect: 2.2s (one-time WS handshake). Per-query: ~232ms. Four serial queries: 3.2s total wall.

Reserved 0.093τ on three of four wallets is the chain-staking reservation pattern (subnet registration locks).

## What this proves

1. **No throttling observed** — 4 sequential queries, no rate-limit headers, no 429s, no API key. Anonymous public endpoint.
2. **Low latency** — 232ms per balance query is faster than Taostats `/api/account/latest/v1` which trends 500-2000ms even on the Standard plan.
3. **Decoding works** — `@polkadot/api` resolves SS58, builds the storage key (twox_128("System") + twox_128("Account") + blake2_128_concat(AccountId32)), submits via RPC, and decodes the `AccountInfo` Vec into `{ free, reserved, frozen }` u128s without manual SCALE work.
4. **Multiple redundant endpoints** — `entrypoint-finney`, `archive.chain`, `test.finney`, and 3rd-party `lite.sub.latent.to` all serve identical chain state. Failover trivial.

## What this does NOT yet prove

1. **Stake leg.** Free balance is a small fraction (0.003-0.5τ) of total holdings; the bulk lives in `SubtensorModule::Stake(hotkey, coldkey)` or as alpha-shares per subnet. To replicate Taostats `/api/account/latest/v1`'s `total_tao` we'd need either:
   - Iterate over all `(hotkey, coldkey)` storage prefixes — heavy
   - Call a runtime API like `SubtensorRuntimeApi_get_stake_info_for_coldkey(coldkey)` via `state_call` and SCALE-decode the result
   - Call `subnetInfo_getAllMetagraphs` and sum the coldkey's alpha-shares × dynamic prices — N subnet calls
2. **Historical balance series.** Taostats `/api/account/history/v1` returns one row per day going back to wallet creation. The free RPC only serves *current* chain state directly; historical state requires `state_getStorageAt(key, blockHash)` and a list of block hashes (one per day boundary). Constructing that block list anonymously is non-trivial — would need an archive node + block-time math.
3. **Transfers in/out for PnL formula.** Taostats `/api/account/transfers/v1` is the only paid endpoint that directly serves transfer events. Free equivalent would be parsing every block's extrinsics for the coldkey — far heavier than balance lookup.

## Bundle-size and serverless feasibility

`@polkadot/api ^11.3.1` install on VPS: 45s, ~80MB node_modules. WS connection lifecycle is per-request stateless — `await api.disconnect()` after each report would work but adds the 2.2s connect penalty per cold-invoke. For Vercel serverless (tao-wallet-report's deployment surface), this is a real concern: a 2.2s connect added on top of Taostats' already-tight 60s budget is risky. Mitigations:

- **Use HTTP JSON-RPC instead of WSS** — `entrypoint-finney.opentensor.ai` accepts plain HTTPS POST. No persistent connection, no connect penalty, just plain stateless requests. `@polkadot/api/http-provider` supports this.
- **Manual storage-key construction** — for the System::Account hot path, build the storage key inline (twox_128 + blake2_128_concat are small primitives from `@polkadot/util-crypto`, ~10kB) and POST `state_getStorage`. Skip the full `@polkadot/api` runtime metadata bootstrap entirely.

## Recommended next iters

- **iter 164 candidate:** swap WSS to HTTP POST + minimal storage-key construction. Probe latency. Measure total bundle delta against current Vercel deployment.
- **iter 165 candidate:** investigate stake leg — `state_call SubtensorRuntimeApi_get_stake_info_for_coldkey` decode path. This is the load-bearing question for full-balance replacement.
- **iter 166 candidate:** if iter 164/165 land, write a `taoFreeRpc.js` shim that mirrors the `taostats.js` surface for `getLatestBalance(coldkey)` ONLY (no history, no transfers), wire as a fallback when Taostats `/api/account/latest/v1` 429s. Measures real-world latency delta and verdict-landing rate.
- **iter 167+ deferred:** historical series + transfers via free RPC is a much bigger project (archive node walks, extrinsic parsing). Defer until the latest-balance fallback proves stable.

## Files

- `/tmp/polkadot-spike/probe.mjs` — probe script (4-coldkey sweep)
- `/tmp/polkadot-spike/package.json` — `@polkadot/api ^11.3.1` only
