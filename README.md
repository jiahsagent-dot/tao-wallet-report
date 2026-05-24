# Tao Wallet Report

**Paste a Bittensor coldkey. Get a personalised report in seconds.**

Free, no signup, public data only. Built on [Taostats](https://taostats.io) and [tao.app](https://tao.app).

→ **Live: https://tao-wallet-report.vercel.app**

## What the report covers

1. **Portfolio** — total τ, USD, AUD; top 10 positions with alpha price + 24h/7d change
2. **PnL** — 24h / 7d / 30d in τ and USD, plus all-time realised/unrealised from delegation history
3. **Yield** — APY per held position from Taostats validator yield endpoint, portfolio-weighted average, best & worst
4. **Flags** — rule-based concerns only (concentration >50%, 7d price drop >30%, 30d drop >50%, underwater positions). No LLM hallucinations.
5. **Recommendations** — plain-English actions derived from the flags, with the "not financial advice" disclaimer
6. **Broader market** — biggest 24h movers and TAO/USD price

## API

```bash
curl -X POST https://tao-wallet-report.vercel.app/api/report \
  -H 'Content-Type: application/json' \
  -d '{"coldkey":"5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd"}'
```

Returns JSON with all 6 sections. Typical response time: ~2s.

## Tip jar

Useful? Tip TAO to `5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH`.

## Stack

Next.js 14 (App Router) on Vercel. Three API endpoints (Taostats + tao.app screener) and one stateless route. No database, no signup, no tracking.

## License

MIT.
