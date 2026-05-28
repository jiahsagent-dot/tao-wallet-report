// Bittensor knowledge base loaded into the AI Insights system prompt.
//
// Goal: give the model real domain context — subnet purposes, yield bands,
// flag interpretations, recommendation heuristics — so the narrative reads
// like an analyst who actually understands Bittensor, not a generic LLM
// dressing up a CSV.
//
// Kept conservative: facts the model can cite without inventing.

// Top subnets by recognition / activity. One-line purpose each.
// Used both for prompt context AND to inject targeted dossier lines into
// the user prompt when these netuids appear in the top10.
export const SUBNET_DOSSIER = {
  0: { name: 'Root', purpose: 'Root staking pool — validator-delegated TAO. Baseline yield ~10-14% APY; emissions split across all subnets.' },
  1: { name: 'Apex', purpose: 'Original text-generation subnet. Long history, established miner pool.' },
  3: { name: 'Templar', purpose: 'Distributed pre-training of foundation models. Compute-heavy, high-variance emissions.' },
  4: { name: 'Targon', purpose: 'LLM inference at scale. Established yielder, frequently cited for reliable returns.' },
  5: { name: 'Open Kaito', purpose: 'Decentralised web search index. Crawler/indexer miners.' },
  6: { name: 'Infinite Games', purpose: 'Forecasting markets — miners predict event outcomes, scored on calibration.' },
  8: { name: 'Proprietary Trading Network (PTN)', purpose: 'Crypto trading-signal subnet. Miners run trading strategies, scored on PnL.' },
  9: { name: 'Pretraining', purpose: 'Foundation model pretraining. Heavy-compute, validator-driven scoring.' },
  10: { name: 'Sturdy', purpose: 'DeFi yield optimisation subnet. Miners route liquidity across protocols.' },
  11: { name: 'Dippy', purpose: 'Roleplay / character chat models.' },
  13: { name: 'Data Universe (Dataverse)', purpose: 'On-chain data marketplace — miners scrape and serve structured data.' },
  18: { name: 'Cortex.t', purpose: 'Text-generation API gateway. Established subnet with stable yield history.' },
  19: { name: 'Vision', purpose: 'Multimodal compute (vision + LLM). Active dev cadence.' },
  20: { name: 'Bitagent', purpose: 'LLM tool-use / agent framework subnet.' },
  21: { name: 'Any-to-Any', purpose: 'Cross-modality conversion (text↔image↔audio↔video).' },
  23: { name: 'Social Tensor', purpose: 'Image-generation subnet, social-content focus.' },
  25: { name: 'Distributed Training (Macrocosmos)', purpose: 'Coordinated training across geographically-distributed miners.' },
  27: { name: 'Compute (Neural Internet)', purpose: 'Raw compute marketplace — GPU rental, scored by uptime + benchmark.' },
  32: { name: "It's AI", purpose: 'Anti-AI detection — distinguish AI-generated from human text.' },
  34: { name: 'BitMind', purpose: 'Deepfake / synthetic-media detection.' },
  37: { name: 'Finetuning', purpose: 'On-demand model fine-tuning subnet.' },
  41: { name: 'Sportstensor', purpose: 'Sports outcome prediction markets.' },
  42: { name: 'Masa', purpose: 'Decentralised data scraping (X / web).' },
  50: { name: 'Synth', purpose: 'Synthetic data generation for downstream training.' },
  51: { name: 'Compute (Celium)', purpose: 'GPU marketplace — competitor to sn27, lease-based pricing model.' },
  52: { name: 'Dojo', purpose: 'Human-in-the-loop RLHF data collection at scale.' },
  56: { name: 'Gradients', purpose: 'Training-as-a-service — turnkey model training jobs. High-emission subnet in 2026.' },
  64: { name: 'Chutes', purpose: 'Compute marketplace with serverless inference focus. High activity, fast-moving.' },
  75: { name: 'Hippius', purpose: 'Decentralised storage subnet. Newer cohort, growing TVL.' },
};

// Category groupings for the dossier'd subnets. Fall back to "other" for any
// netuid we haven't classified yet so portfolio category math stays
// total-accurate even when the report holds subnets not in the dossier.
export const SUBNET_CATEGORIES = {
  0: 'root',
  1: 'foundation-text',
  3: 'training',
  4: 'inference',
  5: 'data',
  6: 'trading-forecasting',
  8: 'trading-forecasting',
  9: 'training',
  10: 'trading-forecasting',
  11: 'inference',
  13: 'data',
  18: 'inference',
  19: 'vision-multimodal',
  20: 'inference',
  21: 'inference',
  23: 'vision-multimodal',
  25: 'training',
  27: 'compute',
  32: 'detection',
  34: 'detection',
  37: 'training',
  41: 'trading-forecasting',
  42: 'data',
  50: 'data',
  51: 'compute',
  52: 'training',
  56: 'training',
  64: 'compute',
  75: 'storage',
};

export const CATEGORY_INFO = {
  root: { label: 'Root staking', purpose: 'Baseline-yield TAO bonded to validators; no per-subnet alpha price exposure.' },
  'foundation-text': { label: 'Foundation text-gen', purpose: 'Original / general-purpose text generation; longest-running subnet cohort.' },
  inference: { label: 'LLM inference', purpose: 'Subnets serving LLM inference, roleplay, agent tool-use, multimodal-conversion APIs.' },
  training: { label: 'Training / fine-tuning', purpose: 'Compute-heavy subnets running pretraining, distributed training, fine-tuning jobs.' },
  compute: { label: 'Compute marketplaces', purpose: 'GPU rental / serverless inference marketplaces. Highly correlated with each other and with broader GPU-demand narratives.' },
  data: { label: 'Data / scraping', purpose: 'Decentralised search indexes, scrapers, structured-data marketplaces, synthetic-data generation.' },
  'trading-forecasting': { label: 'Trading / forecasting', purpose: 'Subnets whose miners run trading strategies, prediction markets, or sports/event forecasting.' },
  'vision-multimodal': { label: 'Vision / multimodal', purpose: 'Image and video generation, multimodal models, social-content subnets.' },
  detection: { label: 'Detection', purpose: 'Anti-AI text detection, deepfake / synthetic-media detection.' },
  storage: { label: 'Storage', purpose: 'Decentralised storage subnets.' },
  other: { label: 'Other / uncategorised', purpose: 'Subnets without a KB category mapping yet. May still be material to the portfolio.' },
};

// Quick glossary the model can lean on without us re-defining every report.
export const TERMINOLOGY = `
Key terms:
- TAO: native Bittensor asset, used for emission rewards and root staking.
- Alpha (α) tokens: per-subnet currency. Staking into a subnet's alpha pool earns yield in that alpha; price is TAO-denominated and varies per subnet.
- dTAO: dynamic TAO — Bittensor's tokenomics rewrite (active since early 2025). Each subnet has its own alpha token with its own price discovery and emission curve.
- Root staking: staking TAO directly to the root subnet (netuid 0). Baseline yield from network-wide emissions. Lower risk than subnet alpha, no token price exposure.
- Hotkey / coldkey: a coldkey holds funds; hotkeys are operational keys that validate or mine on subnets. A coldkey can have many hotkeys.
- Emission: the per-block TAO release split across subnets via root weights, then within a subnet across miners + validators.
- Validator yield (APY here): the effective annualised return a delegator earns when their TAO is bonded to a validator on a given subnet.
`.trim();

// What we treat as normal / worth flagging at the network level.
// These are guidance bands — the model should cite the actual number and
// reason about it, not parrot the band edges.
export const YIELD_BANDS = `
Yield context (post-dTAO, 2026 norms):
- Root staking baseline: ~10-14% APY. Anything sustainably above 14% on root is suspicious; below 8% suggests validator under-performance.
- Subnet alpha yield: highly variable. Healthy bands by subnet maturity:
  • Established subnets (>6mo, top 20 by alpha mcap): 12-25% APY typical, sometimes higher during emission ramps.
  • Newer subnets (<3mo): 30-100%+ APY plausible but volatile; alpha price drift can wipe out the yield premium.
- Sustained sub-5% APY on a position you're paying network fees on is generally a sell or migrate signal.
- 7d alpha price drawdowns >20% are common and not automatically a sell signal in a young subnet — but pair with falling weights or shrinking validator count for a real warning.
`.trim();

// How to interpret the deterministic flags surfaced from lib/report.js so
// the model adds reasoning instead of merely echoing them.
export const FLAG_HEURISTICS = `
Flag interpretation:
- "concentration > X%": a single subnet > 40% of portfolio TAO is meaningful concentration risk — a 30% alpha drawdown on that one position swings the whole portfolio. Acceptable for conviction trades; flag-worthy if user said they wanted diversification.
- "low yield coverage": means fewer than ~70% of positions have a measurable APY signal. Common for new subnets where validator yield data lags emission start. Not a red flag on its own.
- "drawdown vs 7d": a position down >10% on 7d AND down on 30d, while broader market is up, indicates subnet-specific weakness.
- "negative APY position": a position whose effective yield is below zero usually means the alpha price is falling faster than emissions can compensate — sell or trim is the typical answer unless the subnet has a credible recovery thesis.
`.trim();

// Heuristic playbook the model can pattern-match against rather than
// generating generic "consider rebalancing" boilerplate.
export const RECOMMENDATION_HEURISTICS = `
Recommendation heuristics:
- TRIM when: position > 40% of portfolio AND 7d alpha drawdown > 15% AND no fresh catalyst. Recommend trimming back toward 25-30%.
- ADD when: established subnet (>6mo) with stable APY > 15%, position under 5% of portfolio, AND broader market shows the subnet outperforming its category.
- MIGRATE when: position has negative effective yield over 30d AND a peer subnet in the same category shows positive yield. Frame as "swap into <peer>", not abstract "reallocate".
- HOLD / MONITOR when: portfolio is balanced (no single position > 35%), weighted APY > 10%, no negative-yield positions. Say so plainly — do not invent action.
- NEVER recommend chasing a 24h move alone. Pair any 24h-driven recommendation with a 7d or 30d trend confirmation, or say so.
- AVOID generic phrases ("consider rebalancing", "monitor closely") unless they're tied to a specific number from the data.
`.trim();

// Maturity tier mapping — concrete grounding for the "established" /
// "newer subnet" references in YIELD_BANDS and RECOMMENDATION_HEURISTICS.
// Without this the model has to guess; with this it can cite "sn4 (Tier 1)"
// when applying ADD gating instead of hand-waving "an established subnet".
// Buckets reflect dossier-level signals (longest-running miner pools, recognised
// ecosystem subnets vs late-cycle launches) — not a stake-mcap snapshot, which
// would drift; the tier is a structural claim about emission/track-record depth.
export const SUBNET_MATURITY = `
Subnet maturity tiers (concrete grounding for "established" vs "newer" references):
- Tier 1 — Foundation cohort (longest-running, deepest miner pools, multi-quarter emission record):
  • 0 (Root), 1 (Apex), 3 (Templar), 4 (Targon), 9 (Pretraining), 18 (Cortex.t), 19 (Vision), 27 (Compute / Neural Internet)
  • Yield signals on these are the most reliable. Multi-quarter APY > 15% on Tier 1 → high-confidence ADD candidate.
- Tier 2 — Established cohort (recognised ecosystem subnets with material emission history but shorter than Tier 1):
  • 5 (Open Kaito), 6 (Infinite Games), 8 (PTN), 10 (Sturdy), 11 (Dippy), 13 (Dataverse), 20 (Bitagent), 21 (Any-to-Any), 23 (Social Tensor), 25 (Macrocosmos), 32 (It's AI), 34 (BitMind), 37 (Finetuning), 41 (Sportstensor), 42 (Masa)
  • Reliable enough for material allocations; alpha-price drawdowns more common than Tier 1.
- Tier 3 — Rising cohort (newer launches, narrative-driven volatility, high emission but unproven through a cycle):
  • 50 (Synth), 51 (Celium), 52 (Dojo), 56 (Gradients), 64 (Chutes), 75 (Hippius)
  • Tighter individual cap appropriate (e.g. < 10% per position) given yield/price volatility.

Apply this when:
- "ADD when established subnet…" → only Tier 1 / Tier 2 satisfy this gating.
- "MIGRATE to a peer subnet…" → prefer same-category peer at the same OR higher tier.
- A Tier 3 position > 15% of portfolio is concentration-worthy even when the per-subnet 40% threshold isn't tripped.
`.trim();

// Category-concentration reasoning. Lets the model flag book-level
// correlation risk even when no single subnet crosses the per-subnet threshold.
export const CATEGORY_HEURISTICS = `
Category concentration:
- Subnets in the same category share narratives — compute subnets often sell off together when GPU-demand sentiment softens; training subnets correlate on hardware-cost news; trading-forecasting subnets respond to crypto-market regime shifts.
- A portfolio with no single subnet > 40% can still be over-concentrated if one CATEGORY > 50% of TAO. Treat category share as a second concentration axis alongside per-subnet share.
- Healthy category mix for a diversified portfolio: no single category > 50%, at least 3 categories represented across positions.
`.trim();

// Pre-composed KB string appended to the SYSTEM_PROMPT.
// Keep it tight — every token here is paid for in inference cost (zero $ on
// Pollinations, but still latency).
export const KB_TEXT = `
You have access to the following Bittensor reference knowledge. Use it to add specificity; do NOT redefine terms the reader already knows.

${TERMINOLOGY}

${YIELD_BANDS}

${FLAG_HEURISTICS}

${RECOMMENDATION_HEURISTICS}

${SUBNET_MATURITY}

${CATEGORY_HEURISTICS}
`.trim();

// Look up the category for a given netuid. Unknown netuids → "other".
export function categoriseSubnet(netuid) {
  const id = Number(netuid);
  if (!Number.isFinite(id)) return 'other';
  return SUBNET_CATEGORIES[id] || 'other';
}

// Aggregate positions by category. Each entry: { category, label, count,
// subnets, taoTotal, pctOfPort } sorted by pctOfPort desc. Caller renders
// this as targeted context so the model can reason about category-level
// concentration alongside per-subnet concentration.
export function portfolioCategoryBreakdown(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return [];
  const buckets = new Map();
  for (const p of positions) {
    const id = Number(p?.netuid);
    if (!Number.isFinite(id)) continue;
    const cat = categoriseSubnet(id);
    let b = buckets.get(cat);
    if (!b) {
      b = {
        category: cat,
        label: CATEGORY_INFO[cat]?.label || cat,
        count: 0,
        subnets: [],
        taoTotal: 0,
        pctOfPort: 0,
      };
      buckets.set(cat, b);
    }
    b.count += 1;
    b.subnets.push(id);
    if (Number.isFinite(p?.taoValue)) b.taoTotal += Number(p.taoValue);
    if (Number.isFinite(p?.pctOfPortfolio)) b.pctOfPort += Number(p.pctOfPortfolio);
  }
  return [...buckets.values()].sort((a, b) => b.pctOfPort - a.pctOfPort);
}

// Look up dossier entries for an array of {netuid} objects (e.g. top10).
// Returns only the netuids we have entries for, deduped, in input order.
// Caller renders these as targeted prompt context so the model knows what
// the specific subnets in this report actually DO.
export function dossierForPositions(positions) {
  if (!Array.isArray(positions)) return [];
  const seen = new Set();
  const out = [];
  for (const p of positions) {
    const id = Number(p?.netuid);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    const entry = SUBNET_DOSSIER[id];
    if (!entry) continue;
    seen.add(id);
    out.push({ netuid: id, name: entry.name, purpose: entry.purpose });
  }
  return out;
}
