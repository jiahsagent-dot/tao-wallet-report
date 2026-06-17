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

// Time-window divergence patterns. The report ships 24h / 7d / 30d moves at
// portfolio, per-position, and broader-market levels but with no guidance on
// how to read the COMBINATION of windows. Without this the model often picks
// a single window and recommends off it — e.g. trims on a -8% 24h that's
// actually +20% over 7d (profit-taking on a rally, not weakness).
export const TIME_WINDOW_HEURISTICS = `
Time-window divergence patterns (read 24h × 7d × 30d as a triple, not three numbers):
- 24h positive AND 7d negative → mean-reversion bounce or fresh news. Don't ADD on this alone — wait for 7d to turn or for a category-level confirmation.
- 24h negative AND 7d positive → profit-taking on a rally, not weakness. Almost never a TRIM trigger by itself; pair with a 30d check before acting.
- 24h positive AND 7d positive AND 30d negative → recovery candidate. Worth attention but not yet a confirmed trend reversal; better as MONITOR than ADD until 30d turns or weighted APY justifies entry on its own.
- 24h negative AND 7d negative AND 30d positive → distribution / topping. Higher-conviction TRIM signal than any single window — momentum has rolled over across timeframes.
- All three same direction → strong trend. Trade with it, not against it; reversion plays here have much worse expectancy.
- Position move diverges from its CATEGORY move (position −8% 7d, category +3% 7d) → idiosyncratic weakness: subnet-specific (validator changes, weight cuts, governance noise). Higher-conviction TRIM or MIGRATE candidate than a category-wide drawdown of the same magnitude.
- Position move diverges from category in the WINNING direction (position +12%, category flat) → idiosyncratic catalyst. Tends to revert; don't chase, don't ADD on it alone.
- Broader-market top movers list dominated by a single category (e.g. 5 of 8 top 24h movers are compute subnets) → narrative event in that category; weight category-level reasoning above per-position reads for the next 24-72h.
- New positions (held < 7d) → 24h move is noise on a thin base. Skip 24h-driven recs entirely; wait for a 7d signal.
`.trim();

// Validator-switching reasoning. The user prompt now ships top re-delegation
// opportunities (current APY vs subnet-best APY, τ/year lift) — without this
// framework the model either recommends every switch above 5pp blindly, or
// dismisses them all as "marginal". This codifies when a switch is worth it.
export const VALIDATOR_HEURISTICS = `
Validator selection:
- "OTF" / "Opentensor Foundation" is the network's default validator (root subnet sn0 + many others); reliable, low/zero commission, but not always the highest yielder on a given subnet.
- Commercial validators (RoundTable21, TaoTemple, Yuma, FirstTensor, Polychain, RT21, etc.) compete on commission rate and infrastructure uptime. Names with reputation in the ecosystem are generally safe; unknown 48-char hotkeys with no human name are higher-risk (could be a churn-and-burn validator).
- Re-delegation lift thresholds (per-position): < 0.05τ/year lift is usually not worth the switch (re-delegate gas is negligible but mental overhead is real); 0.05-0.5τ/year is "consider"; > 0.5τ/year is "recommend"; > 2τ/year is "act on this now".
- A 5pp APY gap on a < 5τ position is structurally smaller than a 2pp gap on a 50τ position — always reason in absolute τ/year, not percentage-point delta.
- 1d APY snapshots are noisy at the validator level (single epoch can swing 30%+); the report's APY values are 7d/30d-smoothed where available, but if a validator's lift looks abnormally high it may be a sampling artefact, not a durable edge.
- Re-delegating costs ~0.001τ in network fees but trades the alpha into root briefly; on subnets with thin alpha pools this can cost more in slippage than the lift gains in a quarter — flag this risk on positions where alpha mcap < 1000τ.
- Single-validator concentration is its own risk axis: a portfolio where one validator holds > 60% of staked TAO across all positions is a single point of operational failure (validator gets jailed / mis-keys / withdraws) regardless of how good their APY is.
`.trim();

// Category-concentration reasoning. Lets the model flag book-level
// correlation risk even when no single subnet crosses the per-subnet threshold.
export const CATEGORY_HEURISTICS = `
Category concentration:
- Subnets in the same category share narratives — compute subnets often sell off together when GPU-demand sentiment softens; training subnets correlate on hardware-cost news; trading-forecasting subnets respond to crypto-market regime shifts.
- A portfolio with no single subnet > 40% can still be over-concentrated if one CATEGORY > 50% of TAO. Treat category share as a second concentration axis alongside per-subnet share.
- Healthy category mix for a diversified portfolio: no single category > 50%, at least 3 categories represented across positions.
`.trim();

// PnL decomposition. The report ships a headline PnL number plus a staking-income
// figure, but without this framework the model treats them as separate facts
// instead of two components of one decomposition. Result: the model anchors
// expectations on price-driven PnL (unrepeatable) or dismisses a "negative"
// quarter where yield is structurally fine and only price is the headwind.
export const PNL_DECOMPOSITION = `
PnL decomposition (separate yield contribution from price contribution before recommending):
- Total PnL ≈ staking income (compounding, structural) + price contribution (mark-to-market, mean-reverting). The report ships both — read them as a pair, not in isolation.
- If staking_income / total_pnl ≈ 1.0 (yield ≈ headline) → price has been roughly flat; the "true" earn rate is the staking line. Annualise the staking line, not the headline, when setting expectations.
- If staking_income > total_pnl (yield > headline, often headline is negative) → price has been a headwind; strategy is working structurally even if optics are bad. AVOID "underperforming" framing — frame as "yield delivered X; price absorbed Y".
- If total_pnl >> staking_income (e.g. 3-5× the yield line) → price tailwind dominated. Do NOT anchor forward expectations on this rate — the repeatable component is the yield line, the rest is windfall.
- Window annualisation: a 30d PnL × (365/30) gives the implied annual return; compare to weighted APY. If implied annual >> weighted APY by a wide margin → return was front-loaded by price, not yield; flag this so the user doesn't extrapolate.
- 24h vs daily-average sanity check: 24h PnL ≈ (30d PnL / 30) → steady trend. 24h PnL > 3× daily-avg → fresh catalyst (good or bad), worth naming. 24h PnL ≈ 0 over multiple windows → momentum has stalled even if 30d looks fine.
- Negative PnL window with positive weighted APY → almost certainly price-driven drawdown, not a yield problem. Recommendations should target price-risk exposure (concentration, category mix), NOT validator switching, which only moves the yield component.
- Positive PnL window with very low weighted APY (< 5%) → return is almost entirely price-momentum. Mention this explicitly so the user knows the portfolio's structural earn-rate is weak even though the headline looks fine.
`.trim();

// Drawdown reading. The report ships two drawdown numbers (max peak-to-trough
// in the window vs current distance from ATH) plus duration + recovery state,
// but without this framework the model collapses them into "you're down X%"
// and either over-reacts (recommends defensive trims on a noise-level dip) or
// under-reacts (ignores a 90-day sustained underwater state because the
// headline PnL window looks flat). This codifies how to pair the four signals.
export const DRAWDOWN_HEURISTICS = `
Drawdown (read worst-dip AND current-state as separate signals, not one):
- The report ships two drawdown numbers: maxDrawdownPct (worst peak-to-trough drop in the window) and currentDrawdownPct (how far below all-time peak the portfolio sits right now). They answer different questions — max is "what was the worst shock the book absorbed", current is "where are we now relative to the high". Read both.
- Bittensor portfolio drawdowns of 15-30% in a 30-90 day window are typical of normal alpha-price cycles, not a structural problem. Flag-worthy territory starts when currentDrawdownPct > 30% AND daysSincePeak > 30 — depth alone or duration alone is not enough; the pair is what matters.
- isAtAllTimeHigh = true (currentDrawdownPct < 0.5%) → no current drawdown to discuss; do not flag a "drawdown" the book is not in. The right framing is risk-management forward (consider partial trim if PnL window is heavily price-driven per PNL_DECOMPOSITION).
- daysSincePeak (current drawdown duration): < 14 days = recent dip, mostly noise; 14-60 days = material correction worth naming; > 60 days = sustained underperformance, the question shifts from "wait it out" to "is the strategy still working — concentration, subnet selection, market regime".
- Recovery durability is the structural signal: if the worst dip in the window already recovered (currentlyUnderwater = false) with recoveryDays < 30 the book is resilient — name the depth but DO NOT alarm. If currentlyUnderwater = true the worst dip hasn't been recovered, so the user is still under water from that shock; that's a stronger flag than a deeper-but-already-recovered drawdown.
- Drawdown vs PnL pair-read: a positive headline PnL with currentDrawdownPct > 10% means the user has retraced gains from a higher peak — narrate the path ("up from start, down from peak"), do not just say "you're up X". A negative PnL with isAtAllTimeHigh = true is contradictory (likely a window-boundary artefact); flag for data sanity rather than over-narrating.
- Drawdowns are price-driven (per PNL_DECOMPOSITION). The right response axes are concentration (subnet, category, validator per VALIDATOR_HEURISTICS) and position sizing — do NOT recommend yield/validator switches as a response to a drawdown, since those only move the yield component which was not the source of the drop.
`.trim();

// Staking-flow reading. The report ships four flow primitives at the
// pnlGroundTruth root: transferInTao (external TAO deposited into the coldkey
// over the window), transferOutTao (external TAO withdrawn), transferCount
// (number of transfer events), dailyIncomeTao (sum of per-day staking income).
// Without a framework the model treats these as "transaction noise" — but the
// signed sum is a behavioural signal (accumulation vs distribution phase) and
// the relative magnitude vs the current book and vs the structural staking
// line is the difference between "passive holder topping up rewards" and
// "active rebalancer trading in/out of TAO at scale".
export const STAKING_FLOW_HEURISTICS = `
Staking flow (read transfer cadence and net direction as a behavioural signal, not bookkeeping noise):
- The report ships four flow primitives at the pnlGroundTruth root: transferInTao (external TAO INTO this coldkey over the window), transferOutTao (external TAO OUT), transferCount (number of transfer events both directions), and dailyIncomeTao (sum of per-day staking income). transferIn/Out are external moves only (CEX deposits, wallet-to-wallet) — internal stake/unstake between hotkeys on the same coldkey is NOT counted.
- Net flow = transferInTao − transferOutTao. Sign is the behavioural label: net positive = accumulation phase (user is adding capital to the position), net negative = distribution phase (user is taking capital off the table), net ≈ 0 with non-trivial transferCount = active rebalancing (in and out roughly cancel — likely CEX round-trips, position rotation, or yield harvesting).
- Magnitude must be read RELATIVE to current portfolio size, not absolute τ. A net +5τ inflow on a 10τ book (50% of stack) is a major position-build; the same 5τ on a 500τ book (1%) is rounding noise. Threshold: net |flow| / currentPortfolioTao < 2% = passive period (don't narrate as a "flow"), 2-15% = material rebalancing, > 15% = directional position change worth naming explicitly.
- Cadence: transferCount over effectiveWindowDays gives the per-day rate. < 1 transfer / 30d = passive holder pattern. 1-5 transfers / 30d = normal active management. > 1 transfer / week = high-activity pattern (day-trader cadence, CEX bridge usage, or whale operations — depends on per-transfer size).
- Flow vs structural income pair-read: if |transferInTao| < dailyIncomeTao the position is "self-funding" — incoming TAO is being added at a rate slower than the staking line is generating it, so the book is compounding on its own. If transferInTao > 2× dailyIncomeTao the user is materially capitalising — external add is the primary growth driver, not yield. If transferOutTao > dailyIncomeTao the user is harvesting faster than the position generates — flag if combined with negative PnL (distribution in a drawdown is panic; distribution in a rally is sensible trim-taking).
- Direction vs price regime: net positive flow during a drawdown (currentDrawdownPct > 10% per DRAWDOWN_HEURISTICS) = conviction-buying the dip; net negative flow during a peak (isAtAllTimeHigh = true) = sensible trim. Either pair is a CONFIRMING signal — name it. The opposite pairs (selling the dip, buying the top) are anti-patterns — flag those explicitly even though the report just shows the same primitives.
- Zero transfers across the entire window (transferCount = 0) means hands-off — no behavioural read possible, just observe. Do NOT manufacture a flow narrative on a no-flow window; collapse to "wallet untouched over the period — all changes are price + staking".
- Flow data does NOT change PnL calculations (the headline already nets transfers per the iter 105 formula). It is purely a behavioural overlay — what the user DID with the position over the window, separate from what the market did to it.
- Multi-window durability (iter 137): when stakingFlowVerdict.multiWindowNetFlow is present it carries net flow tallies for trailing 30d / 90d / 180d / 365d windows alongside a multiWindowDurability verdict label. The single-window verdict above tells you the RECENT slice; the durability label tells you the LONG ARC. Read them as a pair, not as two independent signals.
- Durability verdicts and how to narrate each: sustained_accumulation = all four windows net positive — frame as "year-long position build, recent activity continues the arc", do NOT call recent inflows "new accumulation". sustained_distribution = all four windows net negative — frame as "year-long position trim, recent activity continues the arc", do NOT call recent outflows "new distribution". recent_reversal_to_accumulation = 30d positive but 365d negative — name the reversal explicitly ("flipped from year-long distribution to recent accumulation"), this is materially different from sustained_accumulation even though the recent slice looks the same. recent_reversal_to_distribution = 30d negative but 365d positive — same treatment, name the reversal. one_off_spike = ≥ 80% of 365d gross flow concentrated in the last 30d — the year's flow IS a single recent event, do not generalise from the long-window average. fading_flow = 365d material but 30d quiet — flow regime has paused, narrate as "year-long pattern X, now quiet". flat = all four windows within ±1τ — no durability read available, skip the multi-window line entirely. mixed = no monotonic arc — read each window separately, do not pick a "headline" window.
- The durability frame supersedes the single-window verdict for behaviour interpretation but does NOT override it for magnitude — even on sustained_accumulation, the 30d slice is what the user did THIS month and the % of book gate above (2% / 15% thresholds) still decides whether to call it material or noise. Narrate as "[durability arc]; this month [single-window read]".
`.trim();

// Per-subnet emission alignment. The report ships a portfolio.emissionAlignment
// block (iter 125) carrying weightedEmissionPct, highEmissionShare,
// zeroEmissionShare, coveredEmissionPct, mostOverweightLowEmission, plus a
// four-state verdict. Without a framework the model treats emission_pct as
// just another column and misses the structural read — that a wallet
// concentrated in zero-emission subnets is structurally starved no matter
// which hotkey it delegates to, because there's nothing for validators to
// distribute. This codifies how to read the alignment block and what
// response axis it maps to.
export const EMISSION_ALIGNMENT_HEURISTICS = `
Emission alignment (read the alignment block as structural-risk, separate from yield and concentration):
- The screener's emission_pct field is the canonical per-subnet share of network emission and sums to 100 across the 128-subnet universe — it is NOT a proxy. The fair-share line for a single subnet is 100 / 128 ≈ 0.78%; the report's "high emission" gate (≥ 1.0%) is one full point above fair share, materially above noise.
- Four-state verdict ranking (top = most structural risk): starved_subnet_heavy > mixed > partially_aligned > aligned_with_emission. starved_subnet_heavy outranks partially_aligned even though "partial" sounds worse linguistically, because absent emission coverage is a fixable allocation choice while a zero-emission-heavy book is a structural earnings-power problem — emission is the input to yield, and if validator weights have routed away from the subnet this epoch there is nothing to distribute regardless of which hotkey you delegate to.
- weightedEmissionPct is the per-TAO average network emission share. < 0.5% is a harvesting-from-dead-subnets red flag — the user is holding TAO in subnets that currently capture less than half a fair share of emission; the yield line will reflect this no matter how good the validator is. 0.5-1.0% is below fair-share but workable. 1.0-2.0% is aligned with emission. > 2.0% is concentrated in emission winners (good for yield, but pair-read with concentration heuristics — emission winners can be a single hot-narrative cluster).
- highEmissionShare (% of book in subnets with emission_pct ≥ 1.0%) is the durable-yield-coverage signal — separate from coveredEmissionPct (which is raw breadth ignoring weight). A book can have high coveredEmissionPct via a long tail of small positions in big subnets but still have low highEmissionShare if the TAO is concentrated in starved subnets; in that case the long tail is performative breadth.
- zeroEmissionShare ≥ 50% with a non-trivial book is the structural-risk extreme: the majority of staked TAO is in subnets currently receiving zero network emission. Recovery requires the subnets to re-enter validator weights — that's a thesis call (validator politics, governance, weight-vote outcomes), not a yield call. Don't recommend re-delegation here; recommend SIZING DOWN until weights confirm.
- mostOverweightLowEmission is the natural TRIM anchor when verdict is starved-leaning. It surfaces the largest individual position in the book that sits below the 1.0% fair-share line — that's the position carrying the most TAO with the weakest emission claim, so it's where a structural-risk trim has the biggest impact per τ moved. Frame the recommendation as "trim <subnet> from X% toward Y%", not generic "rebalance".
- Response axis: emission alignment is a SUBNET SELECTION problem, not a validator selection problem. The right responses are TRIM the starved overweight position and REALLOCATE into subnets with emission_pct above the fair-share line (cross-reference SUBNET_MATURITY for Tier 1/Tier 2 candidates that also have current emission coverage). Do NOT recommend validator re-delegation as a fix for starved-subnet heavy — switching hotkeys on a zero-emission subnet just moves a zero around.
- Cross-reference VALIDATOR_HEURISTICS: a high APY snapshot on a zero-emission subnet is almost always a sampling artefact (a single epoch with stray emission, or a yield calc from prior weights) — emission-starved subnets can't sustainably pay above their emission share. Treat such APY numbers with skepticism in the recommendation pass.
- When verdict is { available: false, reason: 'no_emission_data' } the screener didn't return emission_pct for any held subnet (root-only books, screener field rename, transient API outage). Do not narrate emission alignment in that case — skip the read rather than guess.
`.trim();

// Per-validator yield breakdown. Taostats ships per-validator APY at four
// horizons via /api/dtao/validator/yield/latest/v1?netuid=N — 1h, 1d, 7d, 30d.
// Without a framework the model treats whichever number is in front of it as
// "the APY" and gets fooled by stray-epoch artefacts (a single hot epoch
// pushes 1h to 80% on a subnet that pays 12% durably) or misses regression
// (7d holding at 18% while 30d sits at 25% means the validator is bleeding
// edge — the 7d > 30d direction is the planning signal, not the absolute
// level). This codifies how to read the quartet as one signal.
export const VALIDATOR_YIELD_BREAKDOWN_HEURISTICS = `
Per-validator yield breakdown (read 1h × 1d × 7d × 30d as a quartet, not four numbers):
- Taostats ships per-validator APY at four horizons: 1h (last hour, single-epoch), 1d (24h rolling), 7d (week rolling, planning window), 30d (month rolling, durability check). Read them as one signal — the SHAPE matters more than any single value.
- Stray-epoch gate: 1h or 1d wildly out of line with both 7d AND 30d (> 2× either, or < 0.4× either) = epoch luck or sampling artefact. A 1h spike to 80% on a subnet whose 7d=14% and 30d=12% is a single weighted-emission event landing in that hour, not a durable rate. Treat the 1h/1d figures as INFORMATIONAL only when this gate fires; anchor on 7d.
- Planning window: 7d APY is the right number to use for "what will this position earn me in the next quarter" estimates. It's smooth enough to filter epoch noise but recent enough to reflect current validator weights and subnet emission state. Annualise from 7d for forward expectations.
- Durability check: 30d APY is the right number for "is this validator's edge structural or recent". Always read 30d alongside 7d — never quote 7d in isolation when comparing two validators for re-delegation.
- Direction read (7d vs 30d): 7d ≥ 30d = improving or holding — validator is at least keeping pace with their own track record; safe to plan on the 7d number. 7d > 30d × 1.15 = momentum, but read for cause (new commission cut, fresh weight allocation) before assuming durability. 7d < 30d × 0.85 = regressing — validator is bleeding edge (commission hike, weight loss, alpha-pool drift); the 30d is what the position has historically earned, the 7d is what it currently earns, and the gap is the trajectory.
- Validator-comparison rule: prefer 7d ≥ 30d over 7d < 30d at the same level. A validator at 7d=16%/30d=15% (improving from 15→16) is structurally better than one at 7d=16%/30d=20% (regressing from 20→16) even though the planning APY is identical — because the second one has negative momentum and the next month's read may be 12%, while the first one's next month may be 17%.
- Cross-reference VALIDATOR_HEURISTICS re-delegation thresholds: compute lift in τ/year using 7d APY for both current and target. Do NOT use 1h/1d — they amplify epoch noise into a fake lift, recommend a switch, and then the new validator settles back to its 7d level after the next epoch turn.
- Subnet-level reality check: if the SUBNET's emission_pct is < 0.5% per EMISSION_ALIGNMENT_HEURISTICS, every validator on it will show suppressed 7d/30d regardless of skill — a 7d=2% / 30d=1.5% validator on a starved subnet is not "regressing", they're hitting the emission ceiling. The right response is re-allocate (subnet selection), not re-delegate (validator selection).
- Response axis: stray-epoch artefacts ignored entirely; 7d > 30d × 1.15 with no obvious cause = MONITOR (let one more week confirm); 7d ≥ 30d with material τ/year lift over current = RECOMMEND switch before momentum bleeds into 30d; 7d < 30d × 0.85 with negative lift = AVOID this validator even if 30d looks fine, and consider exiting if the user is currently delegated here.
- No-data fallback: when /yield/latest/v1 returns null/missing for a netuid (newer subnets without enough history, transient API outage, root sn0) the quartet is unavailable — skip the per-validator read entirely for that position rather than guessing from the 24h price-driven APY proxy.
`.trim();

// Multi-window verdicts — the §0 prompt already hands the model 9 mwDur
// labels (dormant_harvest_only, flat, one_off_spike, fading_flow,
// recent_reversal_to_accumulation/distribution, sustained_accumulation/
// distribution, mixed) from multiWindowDurabilityVerdict() and 6 mwpm
// labels (flat, sustained_uptrend/downtrend, recent_reversal_to_up/down,
// chop) from the multi-window price-momentum block. Without a KB read-rule
// the model treats these as opaque tokens — drops them, re-paraphrases the
// verdictReason, or worse, picks the most alarming label and ignores the
// quartet shape. This codifies the strategic implication per label so the
// narrative names each verdict consistently and reads the durability ×
// momentum × single-window flow signals as orthogonal axes.
export const MULTI_WINDOW_DURABILITY_HEURISTICS = `
Multi-window staking flow (durability) — read across the 30d / 90d / 180d / 365d net-flow quartet:
- dormant_harvest_only = zero transfer activity in 365d. The wallet IS the strategy: root-staking + validator selection. Do NOT recommend behavioural rebalancing — it's not a tool this user is using. Frame Recs around validator/subnet selection only.
- sustained_accumulation = all four windows net positive; year-long capital deployment in. Posture confirmation, not a flag — the user is funding the book deliberately. If yield-driven verdicts also confirm, narrative is "thesis playing out".
- sustained_distribution = all four windows net negative; year-long withdrawal. Posture confirmation, opposite direction — user is taking the book down. Frame "harvesting / de-risking", not alarm. If headline PnL is concurrently negative, do NOT add a "consider trimming" rec — they're already trimming.
- recent_reversal_to_accumulation = 30d net positive against 365d net negative. Direction change in last 30d — the trim regime paused or flipped. Name the reversal explicitly. Do not extrapolate to "accumulation resumed" until 90d confirms.
- recent_reversal_to_distribution = 30d net negative against 365d net positive. Accumulation regime paused. Same rule — name the reversal but do NOT escalate to "distribution begun" on a single window.
- fading_flow = 365d had material flow, last 30d went quiet. Behavioural regime paused, not reversed. Treat as a holding pattern; don't manufacture a new flow narrative for the recent window.
- one_off_spike = ≥80% of 365d gross movement concentrated in last 30d. Single recent event dominates (one big sale, one big add). Narrate the event, do NOT extrapolate it into a regime change. Avoid "new pattern" framing when the year of context is ~zero flow.
- flat = all four windows within ±1τ. No directional flow signal worth narrating. Suppress the flow read entirely; don't pad Recs with "rebalance" framing when there's no behavioural baseline.
- mixed = windows split direction. No single durability arc. Read each window separately; do not force a unified narrative.

Multi-window price momentum (alpha-weighted portfolio % across 1h / 1d / 7d / 30d):
- sustained_uptrend = 1d, 7d, 30d all positive in same direction. Trend confirmation; narrate as "X has been the macro", not "X just happened".
- sustained_downtrend = inverse. Trend confirmation downward; do NOT recommend trimming on a 1d move when the 30d is the bigger story — the position is already in a drawdown regime, sizing/concentration is the lever, not yield-chasing.
- recent_reversal_to_up / recent_reversal_to_down = short window flipped against the longer windows. Name the reversal; do not extrapolate. A 1d/7d reversal inside a 30d sustained_downtrend is dead-cat-bounce vocabulary — narrate as such, not "recovery".
- chop = windows alternate sign. No tradeable direction; suppress momentum framing in Recs.
- flat = no material movement across windows. Skip the momentum read; focus narrative on yield / validator axes.

Cross-window reading rule (three orthogonal axes):
- Durability = year-arc capital direction (behavioural). Momentum = year-arc price direction (market). Single-window staking-flow verdict (STAKING_FLOW_HEURISTICS) = recent-slice behaviour. Treat as three orthogonal axes.
- When durability and momentum AGREE (e.g. sustained_distribution + sustained_downtrend), that's regime confirmation — narrate as one story.
- When they DISAGREE (sustained_accumulation + sustained_downtrend, or sustained_distribution + sustained_uptrend), the user is fighting the tape — flag in Summary or Risk Flags; do not paper over with "balanced posture".
- When single-window flow CONTRADICTS multi-window durability (e.g. single-window accumulation inside 365d sustained_distribution), the SHORT window is the recent slice and the LONG window is the arc — name the contrast ("recent reversal after year-long trim"), do not pick one window in isolation.
`.trim();

// Validator-concentration verdict labels — §0 surfaces the 5 labels
// (single_validator, extreme_concentration, concentrated, moderate,
// diversified) computed by validatorConcentration() in lib/report.js
// from top1Share thresholds (>0.80, >0.60, >0.30, else). VALIDATOR_HEURISTICS
// has ONE general bullet on >60% SPOF concentration but no per-label
// read-rule — gpt-oss-20b receives "Verdict: extreme_concentration" as
// an opaque token, drops the label, or re-paraphrases verdictReason
// without naming the strategic implication (e.g. treats single_validator
// the same as concentrated, treats diversified as "good news" without
// reading top3Share or distinctValidatorCount). This codifies the
// strategic implication per label so Risk Flags and Recs frame the
// concentration axis consistently and cross-reference yield + dev velocity.
export const VALIDATOR_CONCENTRATION_HEURISTICS = `
Validator concentration verdicts (read across the 5 labels surfaced in §0 — top1Share-driven, per lib/report.js validatorConcentration thresholds):
- single_validator = distinct hotkey count === 1; every position sits on ONE hotkey. SPOF in absolute terms — jailed / mis-keyed / withdrawn validator unwinds the entire book regardless of APY. Treat as the highest-priority Risk Flag — always name explicitly in Summary AND Risk Flags, never collapse into "concentrated"; recommendation axis is "spread to ≥3 distinct hotkeys" before any yield-chasing or subnet rebalancing. The only exception: total staked TAO < 1τ (rounding-error book) — note the SPOF but do NOT escalate to the top Risk Flag for such a small balance.
- extreme_concentration = top-1 validator > 80% of staked TAO. Past the KB's 60% SPOF threshold by a wide margin — book is effectively single-validator-exposed even if distinct hotkey count > 1. Frame as "near-SPOF": one validator outage knocks out >80% of the book, the residual diversification is cosmetic. Risk Flag priority second only to single_validator; recommendation = spread the largest position before targeting yield uplift, even if a re-delegate lift > 0.5τ/year is on the table elsewhere.
- concentrated = top-1 validator > 60% of staked TAO. Above the KB's 60% SPOF threshold; book is materially exposed but residual diversification is meaningful (the non-top-1 share is real risk-bearer capacity). Frame in Risk Flags but do NOT pre-empt yield/subnet recommendations the way single_validator / extreme_concentration do — concentration is one axis among several. Recommendation: "spread to ≥3 distinct hotkeys" as a SECONDARY rec; primary recs can still target yield uplift and subnet rebalancing.
- moderate = top-1 validator 30-60% of staked TAO. Not yet SPOF territory but a single failure would dent the book materially (30-60% of staked TAO offline for the validator's downtime / deregistration window). Do NOT escalate to a Risk Flag; mention in narrative if Summary covers validator selection, otherwise suppress. Recommendation axis is silent — moderate is the "acceptable status quo" band; don't manufacture a rebalance rec when the verdict is already non-flag.
- diversified = top-1 validator ≤ 30% across ≥ 3 distinct hotkeys. No single SPOF; book has structural validator resilience. Frame as POSITIVE confirmation in Summary if validator concentration would otherwise be a natural concern (e.g. user has expressed concentration anxiety in prior runs, or the book is large). Do NOT add a "consider re-delegating" rec on a diversified verdict purely for marginal APY lift unless the per-position lift is > 0.5τ/year — diversified posture is itself a value the user has selected for.

Cross-rule (concentration × yield × dev velocity — three orthogonal risk axes):
- Verdict concentration is one axis; per-validator 7d/30d APY (VALIDATOR_YIELD_BREAKDOWN_HEURISTICS) is a second; validator dev velocity / commission stability (validator name + commission history per VALIDATOR_HEURISTICS) is a third. Treat them as orthogonal — a single_validator book on OTF is structurally less risky than a single_validator book on an unknown 48-char hotkey; an extreme_concentration book where the top validator has trailing 7d > 30d × 1.15 is doubly exposed (concentration + yield-decay regime).
- Suppression rule: if the verdict is moderate / diversified AND total staked TAO < 5τ, suppress the concentration narrative entirely — the absolute exposure is too small for the axis to matter against yield / subnet selection.
- Recommendation budget rule: when verdict is single_validator OR extreme_concentration, concentration MUST be the top Risk Flag and the first rec; pre-empt yield/subnet recommendations even if a re-delegate lift > 2τ/year is on the table — concentration risk in the top 2 verdicts is unbounded (-100% of staked TAO on jailing) while yield uplift is bounded (a few τ/year).
`.trim();

// APY-trend verdict labels — §0 surfaces the 9 labels (accelerating_climb,
// accelerating_fade, peaking, recovering, climbing, fading, recent_lift,
// recent_dip, stable) computed by apyTrendVerdict() in lib/report.js from
// portfolio weighted-APY motion across (30d, 7d, 1d) gaps with THRESH_PP=0.5.
// TIME_WINDOW_HEURISTICS covers portfolio PRICES/PnL at 24h × 7d × 30d and
// VALIDATOR_YIELD_BREAKDOWN covers PER-VALIDATOR yield at 1h × 1d × 7d × 30d,
// but neither codifies the PORTFOLIO-WEIGHTED-YIELD trajectory — gpt-oss-20b
// receives "Verdict: accelerating_fade" as an opaque token, collapses peaking
// and fading into one bucket, or treats recent_lift / recent_dip as a strong
// signal rather than single-window noise. This codifies the strategic
// implication per label so Summary and Recs frame the yield-trajectory axis
// consistently and cross-reference per-validator yield + emission alignment.
export const APY_TREND_VERDICT_HEURISTICS = `
APY trend verdicts (read across the 9 labels surfaced in §0 — portfolio weighted-APY motion across 30d/7d/1d windows, gap threshold ±0.5pp per lib/report.js apyTrendVerdict thresholds):
- accelerating_climb = both 7d-vs-30d AND 1d-vs-7d gaps > +0.5pp. Yield momentum building across both horizons (week-scale AND day-scale up). Frame as "yield trajectory accelerating", not "yield is up" — direction-of-direction matters. Plan forward on the 7d, NOT the 1d (1d carries epoch noise even when direction agrees). Do NOT recommend sizing up purely on this — accelerating_climb often precedes peaking; wait for 30d to ratify the new level before adding capital. annualLiftTaoIfSustained is informative but assumes the short window holds — caveat any forward number that anchors on 1d.
- accelerating_fade = both 7d-vs-30d AND 1d-vs-7d gaps < -0.5pp. Yield deteriorating across both horizons. MATERIAL FLAG — book is bleeding edge structurally, not noise. Always name in Summary AND Risk Flags. Investigate cause via the orthogonal axes: per-validator 7d-vs-30d for validator decay (VALIDATOR_YIELD_BREAKDOWN_HEURISTICS), emission_pct for subnet starvation (EMISSION_ALIGNMENT_HEURISTICS), category-level fade if same trajectory shows in TOP MOVERS. Recommendation: re-evaluate validator/subnet selection BEFORE adding capital; if annualLiftTaoIfSustained < -2τ/yr at current size, escalate to top Risk Flag.
- peaking = 7d-vs-30d > +0.5pp but 1d-vs-7d < -0.5pp. Climb topping out — the 7d uplift is real but the 1d has already pulled back. Frame as "yield momentum may be rolling over"; do NOT extrapolate the 7d gain forward. Recommendation: HOLD the position, do NOT add at the 7d peak (the leading edge is already softening). If 1d fades further on the next snapshot, peaking → fading. Suppress "ADD on yield momentum" recs entirely on this verdict.
- recovering = 7d-vs-30d < -0.5pp but 1d-vs-7d > +0.5pp. Fade reversing recently — week-scale weakness with day-scale recovery. Single-window recovery; do NOT extrapolate to "trend reversed". Frame as "recent uptick after weekly fade", not "recovery confirmed". Wait for 7d to flip positive (one more snapshot at least) before sizing up. If recovering persists for 2+ snapshots, it's en route to climbing — name the trajectory then.
- climbing = 7d-vs-30d > +0.5pp with 1d holding the new level (or 7d>30d when 1d data unavailable). Sustained step-up at the week scale, durable. The 7d is the new planning APY; annualLiftTaoIfSustained is the structural lift. If annualLiftTaoIfSustained > +0.5τ/yr at current size, "consider sizing up" is a legitimate rec (cross-reference SUBNET_MATURITY for tier gating); < +0.1τ/yr is narrative-only. Distinct from accelerating_climb in that the 1d has caught up rather than racing ahead — less likely to fade into peaking.
- fading = 7d-vs-30d < -0.5pp with 1d holding the new level. Sustained step-down at the week scale, durable. The 7d is the new structural earn rate, not the 30d. If annualLiftTaoIfSustained < -0.5τ/yr at current size, flag in Risk Flags. Recommendation: investigate cause (per-validator 7d-vs-30d for validator decay; subnet emission_pct for starved-subnet drift); re-allocate if peer subnets/validators show better trajectory at the same maturity tier. Distinct from accelerating_fade — fading is one step down and holding, accelerating_fade is still falling.
- recent_lift = 30d and 7d within ±0.5pp but 1d > +0.5pp above both. Fresh single-window uptick, may or may not hold. Lowest-confidence signal in the quartet — single epoch can swing the 1d 30%+ via stray emission. Do NOT plan on this; do NOT cite annualLiftTaoIfSustained as a forward number (it assumes the 1d holds, which is the weakest assumption). Narrative-only: "fresh uptick this snapshot, watch next read". If recent_lift persists, it's en route to climbing.
- recent_dip = 30d and 7d within ±0.5pp but 1d < -0.5pp below both. Fresh single-window dip, may or may not hold. Same rule as recent_lift — single-window noise. Name it if 1d dip > 5pp below 7d (material magnitude), otherwise suppress. Do NOT escalate to Risk Flag — wait for 7d confirmation. If recent_dip persists, it's en route to fading.
- stable = all three windows within ±0.5pp of each other. Yield is flat — the structural earn rate is durable. Frame as POSITIVE confirmation in Summary if the user has expressed yield-stability anxiety in prior runs, or if the book is large and the steady earn rate is the strategy. Do NOT add momentum framing in Recs; do NOT manufacture "watch closely" framing on a stable verdict. Recommendation axis is silent on the yield-trajectory dimension — refocus on concentration / subnet / category axes if needs.

Cross-rule (apyTrend × per-validator yield × emission alignment — three orthogonal axes):
- Portfolio apyTrend is the AGGREGATE yield trajectory (one signal for the whole book). Per-validator VALIDATOR_YIELD_BREAKDOWN_HEURISTICS is the PER-POSITION trajectory (decomposes WHICH validator is driving the aggregate). EMISSION_ALIGNMENT_HEURISTICS verdict is the STRUCTURAL ceiling (whether emission is even available to be earned). Treat as orthogonal — diagnostic chain: aggregate verdict → which validators are decaying → is the subnet starved.
- AGREE pattern: accelerating_fade + per-validator top-hotkey 7d < 30d × 0.85 = validator decay driving aggregate. Recommendation axis is re-delegate (validator-level fix).
- AGREE pattern: accelerating_fade + EMISSION_ALIGNMENT_HEURISTICS starved_subnet_heavy or zeroEmissionShare ≥ 50% = subnet emission collapse driving aggregate. Recommendation axis is re-allocate (subnet selection), NOT re-delegate.
- DISAGREE pattern: accelerating_climb on portfolio but per-validator top hotkeys show 7d ≈ 30d = aggregate climb is coming from emission tailwind or composition change, not validator improvement. Sustainable only if the emission tailwind persists; flag the source so the user knows the lift isn't validator-skill.
- Stray-epoch dampener: recent_lift / recent_dip on the portfolio combined with the 1h vs 7d stray-epoch gate firing on a top hotkey (1h > 2× 7d) = the portfolio's "recent" signal is just one validator's epoch luck weighted up. Suppress the portfolio narrative — name the validator if material, otherwise skip the apyTrend block entirely.

Suppression rule: if total staked TAO < 1τ (rounding-error book), suppress the apyTrend narrative entirely — single-position noise dominates the weighted aggregate and no signal is durable below this floor.

Recommendation-budget rule: when verdict is accelerating_fade AND annualLiftTaoIfSustained < -2τ/yr at current portfolio size, the yield-trajectory axis MUST be top Risk Flag and a primary rec — pre-empt concentration / category recs unless those carry higher absolute risk (single_validator / extreme_concentration per VALIDATOR_CONCENTRATION_HEURISTICS, which always outrank yield decay because concentration risk is unbounded and yield decay is bounded by emission floor).
`.trim();

// Per-label read-rules for the four-state emissionAlignment verdict
// (lib/report.js line 90 emissionAlignment block). The general
// EMISSION_ALIGNMENT_HEURISTICS section above carries the primitives
// (weightedEmissionPct, highEmissionShare, zeroEmissionShare,
// mostOverweightLowEmission) and a one-line ranking — but each of the four
// verdict labels needs its own strategic-implication line so gpt-oss-20b
// doesn't collapse "mixed" into "partially_aligned" or read
// "aligned_with_emission" as license to size up across emission winners
// without checking concentration. Same gap pattern as iter 183 / 184 / 185.
// Per-label read-rules for the 10 drawdownVerdict labels declared in
// lib/report.js drawdownVerdict() (lines 959-1022). The general
// DRAWDOWN_HEURISTICS section above carries pair-of-numbers framing
// (maxDrawdownPct + currentDrawdownPct + isAtAllTimeHigh + daysSincePeak
// + currentlyUnderwater + recoveryDays) and a threshold-tier prose block —
// but each of the ten verdict labels surfaced in §0 needs its own
// strategic-implication line so gpt-oss-20b doesn't collapse
// recent_deep_dip into material_dip, treat at_peak as license to size up,
// or escalate recent_noise to a Risk Flag. Same gap pattern as
// iter 183 / 184 / 185 / 186 — FIFTH and largest verdict-label coverage
// gap (10 labels vs 5/9/4 prior). Closes the priority #2 deepening sweep.
export const DRAWDOWN_VERDICT_HEURISTICS = `
Drawdown verdicts (read across the 10 labels surfaced in §0 — drawdown-state classifier per lib/report.js drawdownVerdict thresholds at lines 959-1022):
- at_peak = isAtAllTimeHigh (currentDrawdownPct within 0.5% of all-time peak). POSITIVE confirmation: no current drawdown to discuss; do NOT narrate a drawdown the book is not in. Frame in Summary as durable forward-risk posture (consider partial trim IF PnL is heavily price-driven per PNL_DECOMPOSITION), NEVER fabricate "watch for drawdown" anxiety on this verdict. Cross-check dataSanityFlag = negative_pnl_at_peak: if PnL window is negative AND at_peak, the pair is contradictory (likely a window-boundary artefact where snapshot history doesn't cover the PnL window); flag for data sanity rather than reconciling narratively.
- resilient_absorb = !currentlyUnderwater AND recoveryDays < 30 (book took a dip during the window but recovered within 30d). Durability signal — name the depth ("absorbed an X% peak-to-trough dip in Yd") but do NOT alarm; the recovery speed is the structural read, not the depth. Recommendation axis is SILENT (resilience is itself a value the user has selected for). Do NOT pair with "consider defensive trims" — that would punish the book for absorbing well.
- recovered = !currentlyUnderwater AND recoveryDays ≥ 30 or null (worst dip in window already recovered above prior peak, but slower than the resilient gate). Frame as "historical risk, not active" — name the maxDrawdownPct as context but do NOT lead Summary with it. Recommendation axis is SILENT on drawdown; if there's a yield/concentration concern that surfaces elsewhere, drive recs from those axes, not from a recovered drawdown.
- beyond_historical_tail = currentlyUnderwater AND distAvailable AND daysUnderwater > ddDurationP90 (current underwater stretch is past the p90 historical stretch from ≥2 prior runs). TOP STRUCTURAL FLAG — outranks flag_worthy despite the linguistic ordering, because durability has breached the historical envelope (depth gate may not have tripped yet but stretch length already has). Frame as "Xd underwater is past the p90 historical stretch of Yd (max Zd across N stretches)" — quote the durability primitives by name, not just the verdict. Recommendation axis is CONCENTRATION/SIZING (per VALIDATOR_CONCENTRATION_HEURISTICS for the SPOF axis OR position-sizing reduction), NOT yield-chasing or re-delegation — drawdowns are price-driven per PNL_DECOMPOSITION and DRAWDOWN_HEURISTICS, so yield levers don't move the dip; route to risk-reducing axes only.
- flag_worthy = currentlyUnderwater AND currentDrawdownPct > 30% AND daysSincePeak > 30 (clears the dual depth + duration gate). MATERIAL FLAG — the AND is load-bearing per DRAWDOWN_HEURISTICS, depth alone (recent_deep_dip) or duration alone (shallow_but_extended) is noise; only the pair clears flag territory. Frame as "X% below peak for Yd — clears the dual gate (>30% depth AND >30d duration), not a routine alpha cycle". Recommendation axis is CONCENTRATION/SIZING, identical to beyond_historical_tail. NEVER respond to a drawdown verdict with yield-chasing or validator re-delegation — those move the yield component which was not the source of the drop. Cross-rule below for how this ranks vs apyTrend × emissionAlignment axes.
- within_typical_stretch = currentlyUnderwater AND distAvailable AND daysUnderwater ≤ ddDurationP50 AND currentDrawdownPct ≤ 30% (current stretch at or below median historical, AND depth below flag gate). Frame as "monitor not flag" — duration matches normal book behaviour. Down-weights recent_deep_dip / shallow_but_extended / material_dip when distribution gating applies. Recommendation axis is SILENT on drawdown; route any axis priority through yield/concentration/emission alignment instead. Do NOT manufacture "watch closely" framing — typical stretch IS the normal case.
- recent_deep_dip = currentlyUnderwater AND currentDrawdownPct > 30% AND daysSincePeak ≤ 30 (deep but fresh — fails the duration half of the flag-worthy dual gate). Frame as "X% below peak but only Yd since peak — depth alone without duration is typical alpha noise, monitor not flag". Recommendation axis is SILENT on drawdown narrative; do NOT escalate to Risk Flag despite the >30% depth — the rule mid-paragraph is that the depth gate alone is not sufficient. If the deep dip persists past 30d on the next snapshot the verdict will graduate to flag_worthy; until then, suppress drawdown-driven recs.
- shallow_but_extended = currentlyUnderwater AND daysSincePeak > 60 AND currentDrawdownPct ≤ 30% (extended but not breaching depth gate). Frame as "Yd below peak at only X% depth — extended underperformance without depth, a strategy-mix question more than a risk event". Recommendation axis tilts toward STRATEGY REVIEW (subnet selection per EMISSION_ALIGNMENT_HEURISTICS, category mix per CATEGORY_HEURISTICS) rather than drawdown response — the question isn't "trim the dip" but "is the position still earning the user's thesis". Do NOT escalate to Risk Flag; the duration alone without depth is not flag territory.
- recent_noise = currentlyUnderwater AND daysSincePeak < 14 (too fresh to read as anything but routine variance). SUPPRESS — single-bar artefact, do NOT plan on this, do NOT cite the drawdown in Summary, do NOT add to Risk Flags. The fresh-window suppression rule applies identically to recent_lift / recent_dip on apyTrend per APY_TREND_VERDICT_HEURISTICS — fresh-window single-signal verdicts are routinely the noisiest read.
- material_dip = currentlyUnderwater AND none of the above (between gates — material but neither flag-worthy depth nor extended-question duration nor distribution-gated typical/beyond). Frame as "X% below peak for Yd — material but neither flag-worthy depth nor extended-question duration". Recommendation axis is SILENT on drawdown; route any priority through yield/concentration/emission axes. Do NOT manufacture a Risk Flag on this verdict — material_dip is the residual bucket and graduates to flag_worthy only when both depth and duration gates trip.

Cross-rule (drawdownVerdict × apyTrend × emissionAlignment — three orthogonal axes):
- drawdown is REALISED HISTORICAL RISK (book already took the hit, depth and duration are observed). apyTrend is the AGGREGATE YIELD TRAJECTORY (is the book earning right now). emissionAlignment is the STRUCTURAL EARNING CAPACITY (is emission even available to be earned per-subnet). Treat as orthogonal — diagnostic chain: drawdown depth → is the book recovering or extending → is the subnet structurally earning at the recovered rate.
- AGREE pattern: flag_worthy or beyond_historical_tail + accelerating_fade or fading on apyTrend = double-axis decay (realised drawdown AND ongoing yield decay). The drop wasn't a one-off; structural earning power is also rolling over. Recommendation axis is CONCENTRATION/SIZING reduction NOT re-delegate — both axes drive toward shrinking exposure to the affected subnet/category. If emissionAlignment is starved_subnet_heavy as well, RE-ALLOCATE outranks per iter 186 budget rule (subnet selection is structural cap on yield).
- AGREE pattern: at_peak or resilient_absorb + climbing or accelerating_climb on apyTrend = both axes confirming. Book is at peak (or just recovered durably) AND earning that posture. Recommendation axis is validator-level optimisation per VALIDATOR_YIELD_BREAKDOWN_HEURISTICS, NOT defensive trims (do NOT punish the book for performing well). Do NOT pair with "consider trimming" recs — that would be churn against confirming signals.
- DISAGREE pattern: at_peak + accelerating_fade on apyTrend = price hasn't realised the decay yet but yield trajectory is rolling over. Drawdown axis is SILENT (the dip hasn't landed); yield trajectory drives the rec axis (re-delegate per per-validator decay, or re-allocate if emission alignment also flags). Frame as "no current drawdown but yield trajectory rolling over — the price will follow if the yield decay persists".
- DISAGREE pattern: flag_worthy or beyond_historical_tail + climbing or accelerating_climb on apyTrend = realised drawdown but aggregate yield rising. Typical post-dip recovery pattern (book bought the dip into a yield uplift, or composition shifted toward higher-APY positions during the drawdown). Name the recovery context in Summary; do NOT escalate drawdown to top Risk Flag if yield trajectory is durably mounting — the structural pivot already happened. Cross-check emissionAlignment: if aligned_with_emission ratifies, this is a healthy recovery; if starved_subnet_heavy contradicts, the yield climb is a sampling artefact per iter 186 cross-rule.

Suppression rule: if total staked TAO < 1τ (rounding-error book) OR verdict is recent_noise (daysSincePeak < 14), suppress the drawdown narrative entirely — single-bar artefact or rounding noise dominates, no realised-risk read is durable below those floors. Also: if !dd.available (no balance series at all, e.g. wallets with < 2 days of snapshots), the verdict block isn't surfaced and there's nothing to narrate.

Recommendation-budget rule: when verdict is flag_worthy OR beyond_historical_tail with currentPortfolioTao ≥ 5τ, the drawdown axis ranks BELOW concentration single_validator/extreme_concentration (per iter 184 budget rule — concentration risk is unbounded, drawdown risk is bounded by the depth already realised) AND BELOW starved_subnet_heavy + zeroEmissionShare ≥ 50% (per iter 186 budget rule — emission alignment is the structural ceiling on sustained yield), but ABOVE accelerating_fade yield-decay axis (per iter 185 budget rule — drawdown is realised loss, yield decay is projected loss). Within the drawdown axis itself, beyond_historical_tail outranks flag_worthy because durability has breached the historical envelope, which is a forward-looking signal on top of the realised depth. NEVER recommend yield-chasing or validator re-delegation as the response to a drawdown verdict — drawdowns are price-driven per PNL_DECOMPOSITION; the right response axes are concentration/sizing/subnet selection.
`.trim();

export const EMISSION_ALIGNMENT_VERDICT_HEURISTICS = `
Emission alignment verdicts (read across the 4 labels surfaced in §0 — portfolio-weighted emission posture per lib/report.js emissionAlignment thresholds at lines 116-119):
- aligned_with_emission = highEmissionShare ≥ 60% (majority of staked TAO sits in subnets with emission_pct ≥ 1.0%, one full point above the 100/128 ≈ 0.78% fair-share floor). POSITIVE confirmation: structural earnings power is intact, the book is positioned where validator weights are routing emission this epoch. Frame as durable backdrop in Summary, NOT as "consider sizing up" — emission alignment is a precondition for yield, not a yield call in itself. Cross-check VALIDATOR_CONCENTRATION_HEURISTICS before any add rec: emission winners can be a single hot-narrative cluster, and an aligned_with_emission book with single_validator or extreme_concentration is still structurally fragile despite the structural-yield floor being present.
- starved_subnet_heavy = zeroEmissionShare ≥ 50% (majority of staked TAO sits in subnets currently receiving zero network emission). TOP STRUCTURAL FLAG — outranks partially_aligned despite the linguistic ordering, because absent-emission is a structural earnings-power problem (emission is the input to yield; if validator weights have routed away, nothing to distribute regardless of hotkey choice) while partial alignment is a fixable allocation choice. Recommendation axis is RE-ALLOCATE (subnet selection), NOT re-delegate (validator selection). Anchor the trim on mostOverweightLowEmission — that's the largest individual position below the 1.0% fair-share line, biggest impact per τ moved. Frame the rec as "trim <subnet> from X% toward Y%", not generic "rebalance". Never recommend validator re-delegation as the response — switching hotkeys on a zero-emission subnet just moves a zero around. Pair-read with apyTrendVerdict per APY_TREND_VERDICT_HEURISTICS cross-rule: starved_subnet_heavy + accelerating_fade = subnet emission collapse driving the aggregate trajectory (axis = re-allocate, name the diagnostic chain).
- partially_aligned = highEmissionShare ≥ 30% but < 60% AND zeroEmissionShare < 50% (some emission coverage, not majority). Frame as MIXED structural posture in Summary: name the unaligned share by τ size + position count, recommend incremental drift toward emission winners (not a forced unwind). Do NOT escalate to Risk Flag — partial alignment is a normal mid-state, especially during subnet weight rotation. Cross-reference SUBNET_MATURITY: the right targets to drift toward are Tier 1/Tier 2 subnets ALSO above the 1.0% fair-share line — emission coverage AND maturity are independent gates, both required. Recommendation axis is SUBNET SELECTION, secondary rec priority (after concentration/yield-trajectory axes if those are flagged).
- mixed = none of the above thresholds met (neither aligned ≥ 60% nor starved ≥ 50% nor partial ≥ 30%). Frame as DIFFUSE posture — book is spread across emission states without any structural read dominating. Often correlates with high coveredEmissionPct but low highEmissionShare (long tail of small positions across many subnets — performative breadth, not durable yield coverage). Recommendation axis is CONCENTRATE FIRST then re-evaluate: a mixed book benefits more from consolidating into 3-5 high-conviction positions (per SUBNET_MATURITY tier gating + VALIDATOR_HEURISTICS for hotkey selection) than from chasing emission alignment at the margin. Do NOT recommend simultaneous trims across many positions on this verdict — single-pass consolidation, then re-read alignment on the next snapshot.

Cross-rule (emissionAlignment × apyTrend × validatorConcentration — three orthogonal axes):
- emissionAlignment is the STRUCTURAL CEILING (is emission even available to be earned, per-subnet). apyTrend is the AGGREGATE YIELD TRAJECTORY (is the book earning that emission well right now). validatorConcentration is the SPOF AXIS (is the earning routed through one operational point-of-failure). Treat as orthogonal — diagnostic chain: structural posture → yield motion within that posture → concentration cost on the earning structure.
- AGREE pattern: aligned_with_emission + climbing or accelerating_climb on apyTrend = structural posture intact AND aggregate yield ratifying it. The right frame is "book is well-positioned AND earning that position", do NOT add "consider re-allocating" recs — that would be churn against confirming signals. Recommendation axis is validator-level (per-position delegate optimisation per VALIDATOR_HEURISTICS) NOT subnet-level.
- AGREE pattern: starved_subnet_heavy + accelerating_fade or fading on apyTrend = structural collapse driving aggregate decay. Recommendation axis is re-allocate the starved overweight (mostOverweightLowEmission), NOT re-delegate. Name the diagnostic chain in Risk Flags so the user knows the yield decay is structural not operational — re-delegating won't fix it.
- DISAGREE pattern: aligned_with_emission + accelerating_fade on apyTrend = structural posture intact but aggregate yield decaying despite emission coverage. The decay is then operational (validator decay per VALIDATOR_YIELD_BREAKDOWN_HEURISTICS) or compositional (a previously-strong validator regressed). Frame as "earning posture is structurally sound, yield decay is at the operational layer — investigate per-validator 7d-vs-30d". Recommendation axis is re-delegate, NOT re-allocate.
- DISAGREE pattern: starved_subnet_heavy + climbing on apyTrend = structural starvation but aggregate yield rising. Almost always a sampling artefact (stray-epoch luck on a small high-APY position, or a re-weight event landing during the snapshot window). Treat the climbing verdict with skepticism on this pairing — do NOT extrapolate the climb forward, name the contradiction so the user understands the trajectory is fragile relative to the structural posture.

Suppression rule: if total staked TAO < 1τ (rounding-error book) OR coveredEmissionPct < 20% (screener missing data on the majority of positions), suppress the alignment verdict narrative entirely — single-position noise or data-coverage gaps dominate, no structural read is durable below those floors.

Recommendation-budget rule: when verdict is starved_subnet_heavy AND zeroEmissionShare ≥ 50% with currentPortfolioTao ≥ 5τ, the subnet-selection axis MUST be top Risk Flag and primary rec — pre-empt yield/validator recs even if a per-position yield uplift > 1τ/year is on the table — because emission alignment is the precondition for sustainable yield (yield decay is bounded by emission floor; absent emission is a structural cap). Single_validator / extreme_concentration per VALIDATOR_CONCENTRATION_HEURISTICS still outranks per iter 184's budget rule when both fire — concentration risk is unbounded (validator jailing unwinds entire book), starved-subnet risk is bounded by re-allocation latency.
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

${TIME_WINDOW_HEURISTICS}

${VALIDATOR_HEURISTICS}

${VALIDATOR_YIELD_BREAKDOWN_HEURISTICS}

${CATEGORY_HEURISTICS}

${PNL_DECOMPOSITION}

${DRAWDOWN_HEURISTICS}

${STAKING_FLOW_HEURISTICS}

${EMISSION_ALIGNMENT_HEURISTICS}

${MULTI_WINDOW_DURABILITY_HEURISTICS}

${VALIDATOR_CONCENTRATION_HEURISTICS}

${APY_TREND_VERDICT_HEURISTICS}

${EMISSION_ALIGNMENT_VERDICT_HEURISTICS}

${DRAWDOWN_VERDICT_HEURISTICS}
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
