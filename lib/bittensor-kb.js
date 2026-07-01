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
  1: { name: 'Apex', purpose: 'Original text-generation subnet. Long history, established miner pool.', priceRange6mo: { min: 0.008832, p10: 0.009359, median: 0.010506, p90: 0.0117, max: 0.013448, samples: 180, asOf: '2026-06-27' } },
  3: { name: 'Templar (deprecated)', purpose: 'Originally distributed pre-training of foundation models; netuid 3 currently flagged deprecated on live data — avoid citing as an active strategy and flag any sustained holding as legacy exposure.', priceRange6mo: { min: 0.021314, p10: 0.022568, median: 0.031192, p90: 0.069623, max: 0.095702, samples: 180, asOf: '2026-06-27' } },
  4: { name: 'Targon', purpose: 'LLM inference at scale. Established yielder, frequently cited for reliable returns.', priceRange6mo: { min: 0.041337, p10: 0.041895, median: 0.050483, p90: 0.059459, max: 0.067408, samples: 180, asOf: '2026-06-27' } },
  5: { name: 'Hone', previouslyKnownAs: 'Open Kaito', purpose: 'Hierarchical AI pretraining subnet — miners train models that learn/reason in levels (multi-level world understanding rather than flat pattern-match) as a distinct path to AGI. Rebranded Aug 2025 after ownership transfer to Manifold Labs / Latent Holdings; the original Open Kaito web-search index mission is retired. Live rank tracks with early-cohort peers (~55.2k τ market cap, ~0.0144 τ price on 2026-07-01).', priceRange6mo: { min: 0.013817, p10: 0.014396, median: 0.017174, p90: 0.020378, max: 0.023043, samples: 180, asOf: '2026-06-27' } },
  6: { name: 'Infinite Games', purpose: 'Forecasting markets — miners predict event outcomes, scored on calibration.', priceRange6mo: { min: 0.003557, p10: 0.003926, median: 0.005903, p90: 0.008309, max: 0.009879, samples: 180, asOf: '2026-06-27' } },
  8: { name: 'Vanta', previouslyKnownAs: 'Proprietary Trading Network (PTN)', purpose: 'Decentralised proprietary-trading network operated by Taoshi, Inc. (founded 2023 by Arrash Yasavolian). Miners submit ML models / trading strategies generating predictions across multi-asset markets (originally Bitcoin-only intraday prediction under the PTN branding; rebranded to Vanta in 2024–2025 as coverage expanded to crypto, forex and equities). Validators score miner outputs on advanced financial metrics (returns, drawdown, Sharpe, Omega) against actual market movements over a rolling 90-day performance window; miners must pass a 60-day on-chain challenge (top-25% performance, ≤10% drawdown) to earn long-term participation. Framed as a "decentralised hedge fund / prop firm" democratising hedge-fund-quality signals to retail via the Glitch Financial consumer platform (closed alpha → beta through 2025). Live rank on 2026-07-01: ~144.3k τ market cap, price ~0.0305 τ, symbol θ.', priceRange6mo: { min: 0.030339, p10: 0.030806, median: 0.035675, p90: 0.043503, max: 0.044149, samples: 180, asOf: '2026-06-27' } },
  9: { name: 'iota', previouslyKnownAs: 'Pretraining', purpose: 'Incentivised Orchestrated Training Architecture (IOTA) — decentralised pretraining of large language models on massive web datasets, operated by Macrocosmos (Will Squires CEO, Steffen Cruz CTO, ex-Opentensor Foundation). The August 2024 IOTA rebrand transformed the previously isolated per-miner "biggest single-model wins" competition into a single cooperating pipeline: miners contribute GPU compute/memory/bandwidth to train assigned model sections (forward-pass losses + backward-pass gradients, gradients prioritised), rewarded on throughput and work quality; validators verify via computational reproducibility (rerun training portions and compare forward/backward passes on cosine similarity), monitoring miners covertly during synchronisation, with pooled consensus scoring. Prior wave reached 14B-parameter decentralised models outperforming OpenAI GPT-2 Large and Falcon-7B on perplexity; February 2026 "Train at Home" consumer beta pulled 815 GPU-contributing participants into a live 1.5B run, with 15B → 50B → 100B on the roadmap. Live rank on 2026-07-01: ~148.9k τ market cap, price ~0.0336 τ, symbol ι.', priceRange6mo: { min: 0.022156, p10: 0.02275, median: 0.025988, p90: 0.031916, max: 0.040229, samples: 180, asOf: '2026-06-27' } },
  10: { name: 'Sturdy', purpose: 'DeFi yield optimisation subnet. Miners route liquidity across protocols.', priceRange6mo: { min: 0.004708, p10: 0.005083, median: 0.005867, p90: 0.006564, max: 0.007706, samples: 180, asOf: '2026-06-27' } },
  11: { name: 'Dippy', purpose: 'Roleplay / character chat models.', priceRange6mo: { min: 0.006624, p10: 0.007557, median: 0.009778, p90: 0.013551, max: 0.015189, samples: 180, asOf: '2026-06-27' } },
  13: { name: 'Data Universe (Dataverse)', purpose: 'On-chain data marketplace — miners scrape and serve structured data.', priceRange6mo: { min: 0.006975, p10: 0.007149, median: 0.008041, p90: 0.009072, max: 0.010701, samples: 180, asOf: '2026-06-27' } },
  14: { name: 'Cacheon', purpose: 'Live open competition for optimising large language model (LLM) inference, operated by Latent-to (cacheon.ai, github.com/latent-to/cacheon, @cacheon_ai, hello@cacheon.ai). Miners submit containerised inference servers competing on speed and correctness when serving the Qwen2.5-72B-Instruct model on high-end GPU clusters, aiming to outperform a vllm baseline. Validators evaluate end-to-end response time and accuracy, with the fastest correct server earning the majority of token emissions. Any tech stack supported. Roadmap: evolve from competitive arena into a production inference provider with an intelligent routing layer. Competition-format sibling to sn17 404—GEN (3D-gen) and sn27 Compute (raw GPU), but LLM-inference-modality. Live rank on 2026-07-01: ~46.0k τ market cap, price ~0.01075 τ (between 6mo median and p90 — upper-mid band, NARROW 1.87× spread reflects competition-subnet cohort trading tighter than open compute-marketplace cohort like sn28 gm and sn95 Actual at ~5.6× spreads).', priceRange6mo: { min: 0.008861053, p10: 0.009062997, median: 0.00959126881868578, p90: 0.013143281, max: 0.016590991, samples: 180, asOf: '2026-07-01' } },
  17: { name: '404—GEN', purpose: 'Decentralised 3D content-generation competition subnet operated by 404 Repo (404.xyz, github.com/404-Repo/404-gen-subnet, @404gen_). Miners submit open-source AI models that generate 3D assets from text prompts; validators run transparent, auditable pairwise competitions scored by a vision-language model with a winner-stays-in format, and all competition state is stored in a public git repository for full auditability. Rigorous verification pipelines gate submissions. Aims to democratise 3D content creation for immersive worlds, games and AR/VR/XR experiences. Category-adjacent to sn23 Social Tensor (image generation) but 3D-modality rather than 2D. Live rank-19 by TAO market cap on 2026-07-01 (~50.5k τ effective mcap, price ~0.01005 τ, near 6mo p10 — low band, NARROW 1.7× spread reflects 3D-generation cohort trading tighter than compute-marketplace cohort).', priceRange6mo: { min: 0.009615, p10: 0.009988, median: 0.011368, p90: 0.014677, max: 0.016217, samples: 180, asOf: '2026-07-01' } },
  18: { name: 'Cortex.t', purpose: 'Text-generation API gateway. Established subnet with stable yield history.', priceRange6mo: { min: 0.005637, p10: 0.005989, median: 0.00727, p90: 0.008365, max: 0.009966, samples: 180, asOf: '2026-06-27' } },
  19: { name: 'blockmachine', previouslyKnownAs: 'Vision', purpose: 'Decentralised blockchain RPC + archive-node marketplace (blockmachine.io) — positioned as a Bittensor-native replacement for centralised API providers Alchemy and Infura. Mark Davison is the sole maintainer / principal developer. Mainnet-launched in early 2026, the subnet currently serves real Bittensor RPC traffic through Taostats. Miners operate RPC and archive nodes, register endpoints, and declare per-epoch USD pricing bids per Compute Unit (CU) per geographic region — earnings scale with successful JSON-RPC requests routed through the protocol gateway. Validators assess miners with a composite quality score (p95 response latency + per-epoch success rate + long-term reliability) and verify correctness by replaying requests against reference infrastructure before submitting on-chain weights. Roadmap expands beyond Bittensor to Ethereum and Binance Smart Chain plus developer onboarding. The rebrand from Vision is a full mission shift — retired the vision + LLM multimodal-compute framing entirely; alpha-token continuity is on the same netuid. Live rank on 2026-07-01: ~48.8k τ market cap, price ~0.0109 τ (near 6mo p10, category rerating in progress post-rebrand).', priceRange6mo: { min: 0.010801, p10: 0.011417, median: 0.013902, p90: 0.016272, max: 0.017188, samples: 180, asOf: '2026-06-27' } },
  20: { name: 'Bitagent', purpose: 'LLM tool-use / agent framework subnet.', priceRange6mo: { min: 0.002828, p10: 0.003341, median: 0.003944, p90: 0.004652, max: 0.005087, samples: 180, asOf: '2026-06-27' } },
  21: { name: 'Any-to-Any', purpose: 'Cross-modality conversion (text↔image↔audio↔video).', priceRange6mo: { min: 0.002951, p10: 0.003411, median: 0.004666, p90: 0.005609, max: 0.006389, samples: 180, asOf: '2026-06-27' } },
  23: { name: 'Social Tensor', purpose: 'Image-generation subnet, social-content focus.', priceRange6mo: { min: 0.002941, p10: 0.003363, median: 0.004303, p90: 0.005781, max: 0.007351, samples: 180, asOf: '2026-06-27' } },
  24: { name: 'Quasar', purpose: 'Silx AI\'s decentralised pretraining subnet for the Quasar open-weight foundation-model series (silxinc.com, github.com/SILX-LABS/QUASAR-SUBNET, @quasarmodels) — miners collaboratively pretrain long-context language models using novel continuous-time, linear-scaling attention architectures capable of handling millions of tokens efficiently; validators verify and score checkpoint quality. All released weights under Apache 2.0. Aims to advance state-of-the-art LLMs without centralised GPU clusters. Foundation-model training cohort with sn9 (Pretraining) and sn25 (Distributed Training / Macrocosmos), long-context specialisation as the differentiator. Live rank-20 by TAO market cap on 2026-07-01 (~45.1k τ effective mcap, price ~0.009385 τ, right at 6mo median). WIDE 5.77× priceRange6mo spread (max/min) places SN24 in the open-marketplace cohort (SN28 gm 5.6×, SN95 Actual 5.6×) rather than the tight competition-format cohort (SN14 Cacheon 1.87×, SN17 404—GEN 1.7×) — consistent with the pattern that open-ended optimisation (long-horizon training with varied strategies) exhibits wider miner-economics dispersion than tight-task competition arenas.', priceRange6mo: { min: 0.003245, p10: 0.004206, median: 0.009441, p90: 0.015217, max: 0.018732, samples: 180, asOf: '2026-07-01' } },
  25: { name: 'Distributed Training (Macrocosmos)', purpose: 'Coordinated training across geographically-distributed miners.', priceRange6mo: { min: 0.003767, p10: 0.003995, median: 0.004821, p90: 0.005267, max: 0.005729, samples: 180, asOf: '2026-06-27' } },
  27: { name: 'Compute (Neural Internet)', purpose: 'Raw compute marketplace — GPU rental, scored by uptime + benchmark.', priceRange6mo: { min: 0.003001, p10: 0.003342, median: 0.00398, p90: 0.004564, max: 0.004964, samples: 180, asOf: '2026-06-27' } },
  28: { name: 'gm (Good Morning)', purpose: 'Privacy-preserving AI-inference gateway (saygm.com, github.com/taostat/gm-miner) — drop-in access to leading proprietary models (Claude, GPT, Gemini) behind a single OpenAI/Anthropic/Gemini-SDK-compatible endpoint. Miners run inference-relaying nodes inside Intel TDX Trusted Execution Environments; user prompts and provider API keys are decrypted only within attested hardware enclaves, blocking operators and hosts from reading traffic. Validators score miners on availability, latency, and TEE-attestation integrity. Positioned as the privacy-focused sibling to sn64 Chutes serverless inference — inference-marketplace category, TEE moat differentiator. Live rank-16 by TAO market cap on 2026-07-01 (~56.5k τ effective mcap, price ~0.01345 τ, near 6mo p90).', priceRange6mo: { min: 0.003426, p10: 0.003878, median: 0.008699, p90: 0.015656, max: 0.019059, samples: 180, asOf: '2026-07-01' } },
  32: { name: "It's AI", purpose: 'Anti-AI detection — distinguish AI-generated from human text.', priceRange6mo: { min: 0.00322, p10: 0.003361, median: 0.003781, p90: 0.004317, max: 0.005042, samples: 180, asOf: '2026-06-27' } },
  34: { name: 'BitMind', purpose: 'Deepfake / synthetic-media detection.', priceRange6mo: { min: 0.012454, p10: 0.012826, median: 0.014172, p90: 0.016854, max: 0.017267, samples: 180, asOf: '2026-06-27' } },
  37: { name: 'Finetuning', purpose: 'On-demand model fine-tuning subnet.', priceRange6mo: { min: 0.003118, p10: 0.003458, median: 0.004154, p90: 0.004622, max: 0.004892, samples: 180, asOf: '2026-06-27' } },
  41: { name: 'Almanac (formerly Sportstensor)', purpose: 'Netuid 41 was rebranded mid-2026; the original Sportstensor ran sports-outcome prediction markets. The new "Almanac" branding suggests a knowledge/reference framing — treat current spec as unconfirmed until verified against the canonical subnet directory before citing specifics.', priceRange6mo: { min: 0.004993, p10: 0.005424, median: 0.006322, p90: 0.010798, max: 0.013843, samples: 180, asOf: '2026-06-27' } },
  42: { name: 'Masa', purpose: 'Decentralised data scraping (X / web).', priceRange6mo: { min: 0.003061, p10: 0.003288, median: 0.003684, p90: 0.004291, max: 0.004823, samples: 180, asOf: '2026-06-27' } },
  44: { name: 'Score (Score Vision)', purpose: 'Decentralised computer-vision subnet built by Score Technologies (github.com/score-technologies/score-vision). Miners annotate football/soccer footage — object detection (players, ball, referees, goalkeepers) plus keypoint detection for on-pitch player positions. Validators filter frames via pitch detection, then run hybrid scoring: keypoint accuracy graded globally on stability, plausibility, and reprojection error; selected frames verified through CLIP-based semantic object checks. Aims to make advanced sports-video analysis cheap and scalable via aligned-incentive lightweight validation. Rank-4 by TAO market cap as of 2026-07-01 (~190k τ, price ~0.039 τ).', priceRange6mo: { min: 0.016832, p10: 0.023276, median: 0.033567, p90: 0.042281, max: 0.046262, samples: 180, asOf: '2026-06-27' } },
  50: { name: 'Synth', purpose: 'Synthetic data generation for downstream training.', priceRange6mo: { min: 0.005349, p10: 0.00665, median: 0.009502, p90: 0.011199, max: 0.012348, samples: 180, asOf: '2026-06-27' } },
  51: { name: 'Compute (Celium)', purpose: 'GPU marketplace — competitor to sn27, lease-based pricing model.', priceRange6mo: { min: 0.040378, p10: 0.041108, median: 0.047603, p90: 0.057503, max: 0.063729, samples: 180, asOf: '2026-06-27' } },
  52: { name: 'Dojo', purpose: 'Human-in-the-loop RLHF data collection at scale.', priceRange6mo: { min: 0.006342, p10: 0.006652, median: 0.007216, p90: 0.008731, max: 0.009415, samples: 180, asOf: '2026-06-27' } },
  53: { name: 'EfficientFrontier', purpose: 'SignalPlus × Bittensor collaboration ranking risk-weighted crypto trading strategies (github.com/EfficientFrontier-SignalPlus/EfficientFrontier). Miners submit trading strategies executed against live market data; validators score with a transparent risk-adjusted metric emphasising consistent returns and minimal drawdowns, distributing daily rewards by recent performance. Category-adjacent to sn8 PTN (proprietary trading network) but broader strategy-ranking framing with public scoring rubric. Tight-competition cohort (well-defined risk-adjusted single-metric scoring on real market data). Live 0.008684 τ sits AT six-month max — SN53 currently trading at its 6-month high; NARROW 1.95× spread (max/min) places it in the competition-format cohort (SN14 Cacheon 1.87×, SN17 404—GEN 1.7×) not the open-marketplace cohort (SN24 5.77×, SN28 5.6×, SN95 5.6×) — reinforces the pattern that tight task specification ⇒ narrow miner-economics dispersion.', priceRange6mo: { min: 0.004450746, p10: 0.004949601, median: 0.005678098, p90: 0.006814564, max: 0.008683977, samples: 180, asOf: '2026-07-01' } },
  56: { name: 'Gradients', purpose: 'Training-as-a-service — turnkey model training jobs. High-emission subnet in 2026.', priceRange6mo: { min: 0.018314, p10: 0.019427, median: 0.022207, p90: 0.02554, max: 0.026697, samples: 180, asOf: '2026-06-27' } },
  62: { name: 'Ridges', purpose: 'AI coding-agent subnet — miners ship code-generation / SWE-bench-style task solutions, scored by validators on solve rate. Popular cohort in late 2025 / 2026; sibling framing to Bitagent (sn20) but coding-specialised rather than general tool-use.', priceRange6mo: { min: 0.011918, p10: 0.013338, median: 0.030325, p90: 0.045637, max: 0.049231, samples: 180, asOf: '2026-06-27' } },
  64: { name: 'Chutes', purpose: 'Compute marketplace with serverless inference focus. High activity, fast-moving.', priceRange6mo: { min: 0.064207, p10: 0.068118, median: 0.085397, p90: 0.100323, max: 0.108634, samples: 180, asOf: '2026-06-27' } },
  68: { name: 'NOVA', purpose: 'Decentralised drug-discovery subnet built by Metanova Labs. Miners compete to submit novel molecular compounds (search algorithms), validators run the open-source PSICHIC oracle to score binding affinity to therapeutic targets while penalising toxicity — quality-over-quantity incentive. As of 2026 the subnet has screened ~4.8M molecules against ~7k targets (~65B combinatorial candidate space). Registration-fee-gated (miners + validators pay TAO for a UID). Rank-10 by TAO market cap as of 2026-07-01 (~95.9k τ, price ~0.021 τ).', priceRange6mo: { min: 0.011772, p10: 0.012315, median: 0.017285, p90: 0.022808, max: 0.025897, samples: 180, asOf: '2026-07-01' } },
  75: { name: 'Hippius', purpose: 'Decentralised storage subnet. Newer cohort, growing TVL.', priceRange6mo: { min: 0.016481, p10: 0.017709, median: 0.024361, p90: 0.035239, max: 0.038796, samples: 180, asOf: '2026-06-27' } },
  88: { name: 'Investing', purpose: 'Decentralised asset-management subnet (@Investing88ai, led by Jake / Glenn / Josh) — miners contribute portfolio strategies across TAO staking, alpha-token positioning, US equities, forex and adjacent markets; validators score each strategy against a scoring algorithm with results transparently displayed on StakingAlpha.com. Framed as "decentralised Wall Street / BlackRock alternative"; actively building the 88 Quant Fund (AI-driven portfolio manager) bridging crypto with traditional-finance techniques. Live rank-75 by TAO market cap on 2026-07-01 (~6.4k τ effective mcap, price ~0.0035 τ, 7-day flat).', priceRange6mo: { min: 0.003477, p10: 0.003606, median: 0.004007, p90: 0.004873, max: 0.006886, samples: 180, asOf: '2026-06-27' } },
  93: { name: 'Bitcast', purpose: 'Decentralised content-marketing / creator-economy subnet (stats.bitcast.network / github.com/bitcast-network/bitcast) — "The Decentralized Creators Economy". Brands publish content briefs; content creators produce videos primarily on YouTube and Stitch3 (X/Twitter) to fulfil the briefs, earning rewards based on genuine audience engagement plus YouTube premium revenue share. Validators verify content quality and engagement authenticity; a dynamic scoring and reward system with anti-exploitation controls distributes emissions fairly across creators. Supports agency operations, multiple content formats, and transparent on-chain compensation. Tags: [content-marketing, creator-economy, reward, validation]. Rank ~40.2k τ mcap on 2026-07-01, live price ~0.01152 τ sitting near six-month min end. NARROW 1.73× naive spread (max/min) and 1.47× IQR spread (p90/p10) — tight COMPETITION-FORMAT cohort with SN14 Cacheon 1.87×, SN17 404—GEN 1.7×, SN53 EfficientFrontier 1.95× — reinforces pattern that well-defined validator scoring rubric (engagement authenticity + anti-exploitation controls on quantifiable YouTube metrics) ⇒ narrow miner-economics dispersion.', priceRange6mo: { min: 0.011364739, p10: 0.011887289, median: 0.013183565, p90: 0.017433001, max: 0.019607230, samples: 180, asOf: '2026-07-01' } },
  95: { name: 'Actual', purpose: 'Decentralised AI-inference / compute-marketplace subnet operated by Actual Computer Inc. (Venice, CA). Miners contribute underutilised consumer-grade hardware into a distributed compute pool addressing datacenter energy/cost bottlenecks; validators route AI-inference / compute workloads to miners and score on performance + uptime. Positioned as a lower-barrier complement to enterprise GPU rentals (sn27 Neural Internet / sn51 Celium) and serverless inference (sn64 Chutes). Rank-9 by TAO market cap as of 2026-07-01 (~107.6k τ, price ~0.048 τ).', priceRange6mo: { min: 0.010141, p10: 0.011369, median: 0.019473, p90: 0.049072, max: 0.057232, samples: 180, asOf: '2026-07-01' } },
  107: { name: 'Minos', purpose: 'Decentralised genomics subnet — "The Foundational Layer of Genomics" (theminos.ai / github.com/minos-protocol/minos_subnet / @theminos_ai) — coordinates competitive rounds for genomic variant calling and benchmarking. Miners submit hyperparameter configurations (and later custom algorithms) for state-of-the-art genomic variant-calling tools to detect synthetic mutations in challenge genomes; validators execute the configurations and score results using industry-standard tooling for clinical-grade accuracy. Merit-based rewards, continuous benchmarking, AI-driven analysis for precision medicine. Tags: [genomics, ai-driven-analysis, benchmarking, precision-medicine]. Live rank ~42.6k τ mcap, price ~0.0434 τ on 2026-07-01. HISTORICAL SPIKE ANOMALY: 6-day parabolic run early-Feb 2026 (2026-02-02 through 2026-02-08, price 1.21 → 2.30 τ before mean-reverting) — 6mo max/min spread of ~917× is NOT a cohort signal, driven by that one-week spike; excluding the anomaly the post-spike range settled around 0.025-0.045 τ. Categorically sibling to sn68 NOVA (drug discovery) as the second decentralised-science / life-sciences subnet with clinical-grade validator scoring.', priceRange6mo: { min: 0.002509, p10: 0.003404, median: 0.016310, p90: 0.040312, max: 2.299992, samples: 180, asOf: '2026-07-01' } },
  120: { name: 'Affine', purpose: 'Model-tournament subnet — miners submit fine-tuned models graded by validators on Pareto-frontier performance across RL environments (program synthesis, code generation). Sybil/decoy/copy/overfit-proof scoring; winning models hosted for inference via Chutes (SN64). Top-5 subnet by TAO market cap as of 2026-07-01.', priceRange6mo: { min: 0.053101, p10: 0.056626, median: 0.069533, p90: 0.083017, max: 0.089457, samples: 180, asOf: '2026-07-01' } },
  121: { name: 'sundae_bar', purpose: 'Decentralised AI-agent marketplace subnet operated by Sundae Bar PLC (LSE AIM: SBAR — publicly listed on the London Stock Exchange). Businesses submit real-world briefs; miners (developers) publish generalist AI agents to solve them; validators benchmark submissions via the Agent Eval Test Suite (AETS) under a winner-takes-all incentive. Emissions split 41/41/18 miners/validators/subnet-owner. Beta platform launched June 2025 (Jill Kenney CEO, Jonathan Bixby chair); positioned as the discovery/reward layer for autonomous agents across HR, marketing, finance workflows — inference-adjacent but incentive-shape closer to sn20 Bitagent than to raw serving subnets. Live rank-82 by TAO market cap on 2026-07-01 (~14.4k τ, price ~0.0053 τ, 1-month down ~9%).', priceRange6mo: { min: 0.005409, p10: 0.005714, median: 0.007191, p90: 0.009342, max: 0.011342, samples: 180, asOf: '2026-06-27' } },
  128: { name: 'ByteLeap', purpose: 'Decentralised GPU-compute subnet operated by ByteLeap (byteleap.ai) — blockchain-enhanced, three-layer trustless architecture connecting GPU providers with AI researchers, developers and enterprises for high-performance training and inference. Miners aggregate one-or-more GPU workers that automatically launch CUDA binaries for GPU-challenge execution (active compute-lease + on-demand challenge rewards); validators apply the subnet incentive rubric to score worker performance and submit weights on-chain. Positioned in the compute-marketplace family alongside sn27 Neural Internet, sn51 Celium, sn64 Chutes, sn95 Actual (correlated to broader GPU-demand narratives). Live rank-83 by TAO market cap on 2026-07-01 (~13.9k τ effective mcap, price ~0.00386 τ, 7-day ~flat, 1-month ~-18%).', priceRange6mo: { min: 0.002715, p10: 0.003305, median: 0.003718, p90: 0.00402, max: 0.00441, samples: 180, asOf: '2026-06-27' } },
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
  19: 'data',
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
  44: 'vision-multimodal',
  50: 'data',
  51: 'compute',
  52: 'training',
  56: 'training',
  62: 'inference',
  64: 'compute',
  68: 'other',
  75: 'storage',
  88: 'trading-forecasting',
  95: 'compute',
  120: 'training',
  121: 'inference',
  128: 'compute',
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

// Per-label read-rules for the 3 annualVsApyVerdict labels surfaced in §0
// pnlAttribution per lib/report.js lines 454-458. The general PNL_DECOMPOSITION
// section above carries the implied-vs-structural framing in prose
// ("annualised window PnL vs weightedApy"), but doesn't enumerate the 3
// labels (far_above_structural / below_structural / roughly_structural) with
// per-label strategic-implication phrases. Without per-label rules
// gpt-oss-20b reads the gap number directly and misses the asymmetric
// thresholds (+20pp vs -10pp) — far_above is harder to clear because some
// upside drift above weightedApy is structural (emission tailwind), but
// below_structural at only -10pp matters more because yield is a floor not
// a target. Smallest verdict-label gap remaining after the iter 183-187
// sweep (3 labels vs 4-10 prior). Same gap pattern as iter 183/184/185/186/187.
export const ANNUAL_VS_APY_VERDICT_HEURISTICS = `
Implied-vs-structural verdicts (read across the 3 labels surfaced in §0 pnlAttribution — annualVsApyGapPp is implied window-annualised return minus weightedApy in percentage points, asymmetric thresholds per lib/report.js lines 456-458):
- far_above_structural = annualVsApyGapPp > +20 (window-annualised return is 20+ pp above weightedApy). PRICE-TAILWIND DOMINANCE: the headline rate has detached upward from the structural yield engine — return is being driven by mark-to-market price gains, not by the staking line. Frame in Summary as "implied window-annualised return X% vs structural Y% — the gap is price tailwind, anchor forward expectations on the structural rate". NEVER cite the implied annualised return as a forward number on this verdict — it assumes the price tailwind repeats, which is the weakest extrapolation. Cross-check pnlVerdict: far_above_structural pairs naturally with windfall (stakingShare < 0.30 AND profit ≥ 3× staking) or price_tailwind (stakingShare < 0.30 without the 3× gate); the verdict pair is consistent and should be narrated as one read. Recommendation axis: do NOT add capital on this verdict (sizing up after a price tailwind is buying the top). If position is heavily price-driven AND at_peak per DRAWDOWN_VERDICT_HEURISTICS, consider partial trim — that's the only "act on price gap" rec; otherwise hold and watch for the gap to narrow on the next snapshot.
- below_structural = annualVsApyGapPp < -10 (window-annualised return is 10+ pp BELOW weightedApy). PRICE-HEADWIND or YIELD OUTPERFORMING headline: the structural yield engine is delivering above what the window PnL reflects — strategy is working under the hood even if optics are bad. Frame in Summary as "structural rate Y% vs implied annualised X% — yield is delivering above the headline, durable engine intact". Pair with pnlVerdict: below_structural maps to price_headwind (profit < 0 AND staking > 0) when the window PnL is negative, or to stalled / yield_driven when the window PnL is near-zero or yield-dominated. Recommendation axis: do NOT recommend defensive trims on below_structural — the structural earning rate is the read, not the price drag. NEVER frame as "underperforming" — that ignores the structural yield delivery. If pnlVerdict is also underperforming (both yield AND price negative), the gap is misleading; route the rec axis through emissionAlignment + per-validator yield decomposition per APY_TREND_VERDICT_HEURISTICS cross-rule.
- roughly_structural = annualVsApyGapPp between -10 and +20 (window-annualised return roughly matches structural rate). CLEAN READ: headline and yield-engine are in agreement, no extrapolation discount needed. Frame in Summary as "implied window-annualised return X% roughly matches structural Y%" — either number is usable for forward expectations. Pair with pnlVerdict: roughly_structural usually pairs with balanced (staking and price each materially contributed) or yield_driven (stakingShare ≥ 0.85). Recommendation axis is silent on the implied-vs-structural dimension — refocus on apyTrend / emission / concentration axes if there are signals elsewhere. Do NOT manufacture "watch closely" or "consider adding" framing on this verdict — clean reads are the normal case, not a trigger for action. Note the asymmetric thresholds: roughly_structural covers a wider upside range (+0 to +20pp) than downside (-10 to 0pp) because emission tailwind on aligned positions can naturally push some upside above weightedApy without it being windfall — calibrated to call out structural divergence, not noise.

Cross-rule (annualVsApyVerdict × pnlVerdict × apyTrend — three orthogonal axes):
- annualVsApyVerdict is the IMPLIED-VS-STRUCTURAL GAP magnitude (how far is the headline from the staking rate this window). pnlVerdict is the DECOMPOSITION SOURCE (what category of contribution drove the window PnL — yield-driven, price-tailwind, stalled, etc). apyTrend is the FORWARD STRUCTURAL trajectory (where the yield engine is going next snapshot). Treat as orthogonal — diagnostic chain: how big is the gap → which side drove the window → will the structural rate confirm or refute the headline.
- AGREE pattern: far_above_structural + windfall or price_tailwind on pnlVerdict + stable or climbing on apyTrend = the gap is real (price drove the window) but the structural floor is durable. Frame in Summary as "headline boosted by price; structural rate intact and trending up". Do NOT recommend acting on the gap (no trim, no size-up) — it self-resolves as the structural rate compounds or the price reverts. Recommendation axis is silent on the gap; route any priority through orthogonal axes (concentration, emission, drawdown).
- AGREE pattern: below_structural + price_headwind or stalled on pnlVerdict + stable or climbing on apyTrend = yield delivered while price absorbed, and structural rate is durable. Frame as "strategy structurally working — price headwind masking the staking line". Recommendation axis is HOLD or ADD (if at_peak per drawdown is also false and emissionAlignment is aligned) — the structural read is positive. Explicitly NEVER frame as "underperforming" on this AGREE pattern; that misreads the diagnostic chain.
- DISAGREE pattern: far_above_structural + stalled or balanced on pnlVerdict (no clear windfall) = gap exists but decomposition doesn't ratify a single driver. Often a composition-change artefact (e.g. a heavy position rotated mid-window) or a single-epoch yield calc on weightedApy that lags the actual earning. Treat the gap with skepticism on this pairing — name the contradiction, do NOT extrapolate either annualised number forward.
- DISAGREE pattern: below_structural + accelerating_fade on apyTrend = current yield outperforming the trending-down structural rate, transient overshoot. The forward read is: structural rate is rolling over to meet the headline, not the headline catching up to structural. Frame as "gap will resolve via structural decay, not price recovery — investigate validator/subnet drivers per APY_TREND_VERDICT_HEURISTICS axes". Recommendation axis routes through re-delegate or re-allocate per apyTrend cross-rule.

Suppression rule: if total staked TAO < 1τ (rounding-error book) OR pnlGroundTruth.available = false (no PnL window — single-snapshot wallets) OR weightedApy is null (no yield data for the window) suppress the implied-vs-structural narrative entirely — the gap requires both window PnL AND weightedApy to be valid, and below those floors the gap is noise dominated by per-position rounding.

Recommendation-budget rule: when verdict is far_above_structural with currentPortfolioTao ≥ 5τ AND drawdownVerdict is at_peak AND stakingShare < 0.30, the partial-trim axis is a LEGITIMATE primary rec (price-driven peak with no structural buffer) — but it ranks BELOW concentration single_validator/extreme_concentration (per iter 184 budget rule — concentration risk is unbounded, price gap risk is bounded by mean reversion) AND BELOW starved_subnet_heavy + zeroEmissionShare ≥ 50% (per iter 186 — structural ceiling outranks price-cycle timing). When verdict is below_structural, the implied-vs-structural axis is SILENT in the rec budget — yield outperforming headline is not a flag, it's the strategy working, so no rec is owed to this axis. NEVER recommend "wait for the gap to close" or "trim because implied > structural" without the drawdown + low-stakingShare AND clause — gaps close on their own, the rec budget is for risk-reducing actions only.
`.trim();

export const STAKING_FLOW_VERDICT_HEURISTICS = `
Staking-flow verdicts (read across the 8 single-window labels surfaced in §0 + 4 patternFlag overlays — behavioural classifier per lib/report.js stakingFlowVerdict thresholds at lines 1101-1175):
- hands_off = transferCount === 0 over the window. NO BEHAVIOURAL READ available — the wallet was untouched, every balance change is price + staking income. Frame in Summary as "wallet untouched over the period — all changes are price + staking". Do NOT manufacture a flow narrative, do NOT recommend rebalancing, do NOT speculate about user intent. The wallet IS the strategy: root-staking + validator selection. Recommendation axis routes through validator/subnet selection only — behavioural rebalancing is not a tool this user is using.
- passive = grossPctOfBook < 0.02 (sub-2% gross flow over the window). SUB-THRESHOLD passive holding. Frame as "X.X% gross flow over Yd — passive holding, not a flow". Do NOT escalate to a flow narrative; the magnitude floor (< 2%) is calibrated to filter rounding/CEX dust. Recommendation axis is SILENT on flow — route through yield/concentration/emission axes if there are signals elsewhere.
- capitalising = absNetPct > 0.15 AND netTao > 0 AND dailyIncome > 0 AND transferIn > 2 × dailyIncome. EXTERNALLY FUNDED position build — the user is adding external TAO at >2× the rate the position is generating it, so growth is funded primarily by adds, not compounding. Frame as "net +X% with transfersIn N× staking income — externally funding the position, not just compounding yield". Distinct from accumulation: capitalising is conviction-spending external TAO, accumulation is just net-add direction. Recommendation axis is HOLD or continue per user's existing thesis — do NOT recommend "consider adding" (they're already adding aggressively) and do NOT recommend trims (would fight the user's deployed conviction). Cross-check patternFlag for buying_the_peak overlay (≥5% net add at_peak is the anti-pattern — flag separately even though the verdict itself is just a posture label).
- accumulation = absNetPct > 0.15 AND netTao > 0 (not capitalising) OR 2-15% range with netTao > 0. DIRECTIONAL position increase. Frame as "net +X% of book over Yd — directional position increase". Recommendation axis is silent on the increase itself (the user already chose to add); route any rec priority through orthogonal axes. Do NOT recommend "consider adding more" on an accumulation verdict (redundant), do NOT recommend trims (fights the deployed direction). Pair-read with drawdownVerdict: accumulation during flag_worthy or beyond_historical_tail is conviction-buying the dip — surface as patternFlag buying_the_dip overlay, narrate as positive context not as a flag.
- harvesting = absNetPct > 0.15 AND netTao < 0 AND dailyIncome > 0 AND transferOut > dailyIncome AND !underwater. SENSIBLE TRIM not distribution — taking TAO off the table at a rate above staking income while NOT underwater, the constraint is the "not underwater" clause (harvesting during a drawdown is distribution_in_drawdown anti-pattern, see below). Frame as "net X% with transfersOut > staking income against not-underwater book — sensible trim, not distribution". Recommendation axis is HOLD — do NOT add "consider trimming" rec (already trimming) and do NOT escalate to Risk Flag (this is the strategy working). NEVER frame as "distribution" or "selling pressure" — those words misread the not-underwater clause.
- distribution = absNetPct > 0.15 AND netTao < 0 (else clause — not harvesting because underwater OR no dailyIncome) OR 2-15% range with netTao < 0. DIRECTIONAL position decrease. Frame as "net X% of book over Yd — directional position decrease". If concurrent with negative PnL window per PNL_DECOMPOSITION, do NOT add a "consider trimming" rec (they're already trimming — that would be redundant Recs padding). Pair-read with drawdownVerdict: distribution during currentlyUnderwater + curDdPct > 15% is the distribution_in_drawdown anti-pattern (see below) — surface as patternFlag overlay, escalate.
- self_funding = dailyIncome > 0 AND |netTao| < dailyIncome AND transferCount > 0 (some flow but smaller than staking income). BOOK COMPOUNDING ON ITS OWN — incoming/outgoing TAO is smaller than the staking line is generating, transfers are noise relative to yield. Frame as "|net| Xτ < daily-income window Yτ — staking income is doing the work, transfers are noise". Recommendation axis is SILENT on flow — the position is self-funding, no behavioural lever applies. Do NOT narrate transfers as a directional signal on this verdict; the structural read is "yield is the growth engine".
- rebalancing = absNetPct < 0.02 with transferCount > 0 (near-zero net flow but transfers happened). ROTATION/ROUND-TRIP not directional. Frame as "near-zero net flow (X.X%) over N transfers — rotation/round-trip, not a directional move". Likely CEX bridging, position rotation between hotkeys/subnets, or yield-harvesting cycles. Recommendation axis is SILENT on net direction — the in/out cancelled. Do NOT manufacture a "consider rebalancing" rec (they're already doing it); do NOT pick the inflow OR outflow side as "the move" — the netting is the read.

PatternFlag overlays (read AS A SEPARATE FIELD from verdict — patternFlag carries the cross-product of flow direction × drawdown state and surfaces 2 confirming + 2 anti-pattern labels per lib/report.js lines 1163-1175):
- buying_the_dip = netTao > 0 AND underwater AND curDdPct > 0.20 (confirming, patternIsAntiPattern = false). CONVICTION POSTURE — net-add direction matches the drawdown depth, user is buying conviction into the dip. Frame as positive context in Summary ("net add Xτ into a Y% drawdown — conviction-buying the dip"), NEVER flag this as a risk pattern, NEVER recommend trimming on this overlay (would fight the user's deployed conviction). Recommendation axis is silent — do not pad Recs with "consider adding" on an overlay that already names the user doing exactly that.
- selling_the_peak = netTao < 0 AND atPeak (confirming, patternIsAntiPattern = false). SENSIBLE TRIM-AT-HIGHS — net withdraw at all-time high, classic profit-taking. Frame as positive context ("net withdraw Xτ at all-time high — sensible trim-at-highs"). NEVER flag as a risk pattern, NEVER frame as "selling pressure" or "distribution". Recommendation axis is silent — do not add "consider trimming" rec (they're already doing it).
- distribution_in_drawdown = netTao < 0 AND underwater AND curDdPct > 0.15 (ANTI-PATTERN, patternIsAntiPattern = true). PANIC-OR-CAPITULATION POSTURE — net withdraw at a material drawdown, opposite of buying_the_dip. Frame as a Risk Flag explicitly named ("net withdraw Xτ into a Y% drawdown — distribution-in-drawdown anti-pattern"), surface the contrast with the user's longer-arc multiWindowDurabilityVerdict (a sustained_accumulation flipped to recent distribution_in_drawdown is materially different from a sustained_distribution continuing the arc). Recommendation axis tilts toward SIZING REVIEW — not "stop selling" (that's the user's call), but "name the pattern so the user sees the asymmetry". Behavioural anti-patterns ranks BELOW concentration and emission flags in the rec budget (see budget rule below) — surfacing it is the right action, not nesting a trim/add rec on top.
- buying_the_peak = netTao > 0 AND atPeak AND absNetPct > 0.05 (ANTI-PATTERN, patternIsAntiPattern = true). EUPHORIA-BUY POSTURE — net add ≥5% of book at all-time high, opposite of selling_the_peak. Frame as a Risk Flag named ("net add Xτ at all-time high — buying-the-peak anti-pattern"). Do NOT recommend "consider continued accumulation" (would amplify the anti-pattern) and do NOT recommend trimming the just-bought position (that's churn). Recommendation axis is NAME-THE-PATTERN — surface the asymmetry, route any structural rec through concentration/emission/drawdown axes. Cross-check capitalising verdict pair: capitalising + buying_the_peak overlay is the strongest signal that the add is euphoric not strategic — quote both labels together.

Cross-rule (stakingFlowVerdict × multiWindowDurabilityVerdict × drawdownVerdict — three orthogonal axes):
- stakingFlowVerdict is the SINGLE-WINDOW BEHAVIOURAL POSTURE (what the user did over the recent slice). multiWindowDurabilityVerdict per MULTI_WINDOW_DURABILITY_HEURISTICS is the YEAR-ARC DURABILITY (what the user has done over the long arc — sustained_accumulation, sustained_distribution, recent_reversal_*, etc). drawdownVerdict is the REALISED HISTORICAL RISK CONTEXT (the market regime the behaviour happened inside). Treat as orthogonal — diagnostic chain: what did the user do this window → does it match the year-long arc → did it happen at a peak, a dip, or in routine variance.
- AGREE pattern: accumulation + sustained_accumulation + flag_worthy or beyond_historical_tail = conviction-buying through the dip on top of a year-long position build. Both behavioural axes confirm the user is in deployment mode and the drawdown context names the conviction. Frame as positive durability read ("year-long position build continues through a Y% drawdown — buying-the-dip with year-arc support"). Do NOT escalate the drawdown verdict to top Risk Flag when behavioural axes confirm — the user is already absorbing it deliberately. Recommendation axis is HOLD or continue.
- AGREE pattern: distribution + sustained_distribution + at_peak or resilient_absorb = year-long trim continuing through highs / well-absorbed dips. Posture confirmation on both behavioural axes, drawdown context ratifies the user isn't panic-selling. Frame as "year-long position trim continues at peak — sensible harvest-at-highs cycle". Do NOT recommend additional trims (redundant); do NOT escalate to Risk Flag.
- DISAGREE pattern: accumulation + sustained_distribution + at_peak = recent reversal from year-long trim AND at peak = buying_the_peak overlay should fire — anti-pattern. The flow flipped from year-long trim to recent accumulation AT a peak. Frame the contradiction explicitly ("year-long position trim reversed to recent net add Xτ AT all-time high — buying-the-peak overlay"). Recommendation axis routes through NAME-THE-ASYMMETRY — do not paper over the regime change with a "balanced posture" framing.
- DISAGREE pattern: distribution + sustained_accumulation + flag_worthy or beyond_historical_tail = year-long position build flipped to recent trim INTO a material drawdown = distribution_in_drawdown overlay should fire — anti-pattern. The flow flipped at the worst possible window. Frame as "year-long position build flipped to recent net withdraw Xτ during a Y% drawdown — distribution-in-drawdown overlay against the year arc". Recommendation axis is sizing review — name the pattern, do NOT recommend continuation of either direction.

Suppression rule: if verdict is hands_off (zero transfers) OR passive (gross < 2%) → suppress flow narrative entirely (no behavioural read to make, no transfer signal to interpret). If verdict is rebalancing AND patternFlag is null → suppress narrative beyond a one-line rotation note (in/out cancelled, no asymmetry to flag). Also: if !pnlGroundTruth.available, none of these labels are surfaced — skip the flow read entirely rather than guess.

Recommendation-budget rule: patternFlag distribution_in_drawdown OR buying_the_peak (the two anti-pattern overlays) surface as a Risk Flag at any currentPortfolioTao but rank BELOW concentration single_validator/extreme_concentration (per iter 184 budget rule — concentration risk is structural and unbounded, behavioural patterns are reversible by the user choosing differently tomorrow) AND BELOW starved_subnet_heavy + zeroEmissionShare ≥ 50% (per iter 186 budget rule — emission alignment is the structural ceiling on sustained yield, behaviour is downstream). They DO rank ABOVE accelerating_fade yield-decay axis (per iter 185 — behavioural anti-pattern is observed misalignment, yield decay is projected loss) BUT BELOW realised drawdown flag_worthy/beyond_historical_tail (per iter 187 — realised loss outranks behavioural-pattern observation). The right rec on a fired anti-pattern overlay is NAME-IT — surface the asymmetry so the user sees the contradiction, do NOT nest a trim or add rec on top (those would be paternalistic since the user already chose the direction). Confirming overlays (buying_the_dip, selling_the_peak) are NEVER flagged and have NO rec budget cost — they are narrative-context only. Single-window verdicts (accumulation, distribution, harvesting, capitalising, self_funding, rebalancing) are NOT rec items in themselves — they are behavioural context shaping HOW recs land elsewhere (e.g. if the user is in sustained_accumulation, "consider adding" is redundant context-padding regardless of what other axes say). NEVER recommend "stop selling" or "stop buying" — those are user-choice actions, the agent surfaces patterns and lets the user decide.
`.trim();

// Yield-quality verdicts — the §0 per-position quartet block in lib/ai-insights.js
// ships 3 verdict labels (avoid_and_exit, recommend_switch, monitor_momentum)
// computed from a 2-axis cross-product (direction ∈ {regressing, improving,
// momentum, stable} × materialLift bool with 0.05τ/yr floor) per the
// classifyVerdict() decision tree at lib/ai-insights.js lines 527-549. The
// VALIDATOR_YIELD_BREAKDOWN_HEURISTICS section covers the QUARTET-SHAPE read
// (1h × 1d × 7d × 30d) and the direction-by-ratio thresholds, but does not
// codify per-verdict routing — the 3 verdict labels are surfaced with inline
// guidance in the §0 prompt construction itself (line 594 paragraph), not in
// the KB. Pulling that guidance into the KB single source of truth, and adding
// the 3-axes cross-rule + recommendation-budget rule that ties the per-position
// yield-quality verdict to the portfolio-level concentration (iter 184) /
// emission-alignment (iter 186) / drawdown (iter 187) budget stack, closes the
// gap. Also covers the EMISSION_CEILING per-row flag (emissionPct < 0.5%) which
// re-routes a regressing read from validator-selection to subnet-selection per
// EMISSION_ALIGNMENT_HEURISTICS.
export const YIELD_QUALITY_VERDICT_HEURISTICS = `
Per-position yield-quality verdicts (read across the 3 single-row labels surfaced in §0 per-position quartet block + 4 underlying direction labels + EMISSION_CEILING per-row flag — per-position decision classifier per lib/ai-insights.js classifyVerdict() at lines 527-549):
- avoid_and_exit = direction === 'regressing' (7d < 30d × 0.85). VALIDATOR BLEEDING EDGE — the per-position hotkey is structurally losing yield (commission hike, weight loss, alpha-pool drift), and the 7d undercuts 30d by 15+ percent. Frame in §3 as "sn{N} validator regressing: 7d {X%} vs 30d {Y%} — durability concern". Recommendation axis routes to Risk Flags as a durability-concern line ("re-delegate from {validator} on sn{N} — the 7d planning rate is below 85% of the 30d durability rate, the position is structurally losing edge"). Never frame avoid_and_exit as "this subnet is bad" — the verdict is per-hotkey, not per-subnet; the right rec is MIGRATE within the same subnet to a non-regressing validator, NOT TRIM the subnet position. Pair-read with EMISSION_CEILING flag (next bullet): if the same row also carries emissionPct < 0.5%, the regressing read is misread — the validator isn't bleeding edge, the subnet is starving the validator. Reroute to subnet selection per EMISSION_ALIGNMENT_HEURISTICS.
- recommend_switch = (direction === 'improving' AND materialLift) OR (direction === 'stable' AND materialLift). MIGRATION OPPORTUNITY with the τ/yr lift cited. materialLift = |min(deltaToBest, 0)| × alphaTokens ≥ 0.05τ/yr (iter 116 threshold — 5pp+ behind the subnet best, with > 0τ/yr potential annualised lift). Frame in §3 as "sn{N} recommend switch: {currentApy} → {bestApy}, +{liftTaoYr}τ/yr at current size". Recommendation axis routes to Recommendations as a MIGRATE action with the τ/yr lift quoted explicitly (not the APY delta in percent — the τ/yr number is the right size context). Improving + materialLift is the strongest form (current validator is keeping pace AND there's room above); stable + materialLift is the typical case (current is fine but a meaningfully better validator exists). Do NOT recommend_switch when materialLift is false even if direction is improving — that's chasing a 1-2pp delta that costs gas/re-delegation friction.
- monitor_momentum = (direction === 'improving' AND !materialLift) OR (direction === 'momentum' regardless of lift) OR (direction === 'stable' AND !materialLift). NO ACTION RIGHT NOW with the reason quoted. improving + no lift = current validator is moving in the right direction AND no meaningfully better target exists; stable + no lift = baseline state; momentum (any lift) = 7d > 30d × 1.15 = read for cause before assuming durability (single weight allocation, fresh commission cut), let one more week confirm before re-rating. Frame in §3 as "sn{N} monitor momentum: 7d {X%} vs 30d {Y%} — let next snapshot confirm". Recommendation axis is SILENT — monitor_momentum verdicts do NOT fire a recommendation by themselves. They only feed a rec when paired with another orthogonal signal (e.g. monitor_momentum + flag_worthy drawdown + concentrated validator = sizing review, but the rec budget routes through concentration not yield-quality).

Stray-epoch flag overlays (read as INFORMATIONAL guards on the 1h/1d windows — calibrated to filter single-epoch sampling artefacts per the isStrayEpoch() gate at lib/ai-insights.js lines 516-525):
- stray-epoch on 1h = the 1h APY is > 2× the higher of (7d, 30d) OR < 0.4× the lower of (7d, 30d). Single-hour weighted-emission landing or zero-emission hour — pure sampling artefact. NEVER cite the 1h figure on a stray-epoch row. Frame in §3 as a one-line guard ("ignore the 1h window — stray-epoch artefact, anchor on 7d/30d"). NEVER use as a basis for recommendation (recommend_switch on a 1h spike is the classic mistake — the next epoch turn the position loses the "lift").
- stray-epoch on 1d = same gate against 24h. Looser than 1h but still calibrated to filter recent-day anomalies (commission flip mid-day, validator re-registered, single big weight event). Frame the same way — anchor on 7d.
- Stray flags NEVER trigger a verdict change — the classifier already anchors on 7d/30d for direction/lift decisions. The stray label is only narrative guidance to suppress the noisy window in §3 prose.

EMISSION_CEILING per-row flag (read AS A SEPARATE FIELD from verdict — emissionPct < 0.5% gate per lib/ai-insights.js lines 587-591):
- EMISSION_CEILING fires when sn{N}.emissionPct < 0.5% on a row. The suppressed 7d/30d on that row is the SUBNET ceiling, NOT the validator. A regressing read here is misclassified — switching hotkeys on a sub-fair-share subnet just moves a zero around. Frame in §3 as a re-route guard ("sn{N} emission {X%} < 0.5% — the suppressed yield is the subnet ceiling, not the validator. Re-allocate (subnet selection), do NOT re-delegate"). Recommendation axis routes to Recommendations as a SUBNET-SELECTION action via EMISSION_ALIGNMENT_HEURISTICS — TRIM the overweight low-emission position, REALLOCATE into emission-aligned Tier 1/Tier 2 subnets. EMISSION_CEILING OVERRIDES avoid_and_exit and recommend_switch — if both fire on the same row, the EMISSION_CEILING re-route wins (validator-selection actions are wasted on starved subnets). monitor_momentum + EMISSION_CEILING = the 7d/30d is just the floor; do not narrate as a yield problem.

Cross-rule (yieldQualityVerdict × validatorConcentration × emissionAlignment — three orthogonal axes):
- yieldQualityVerdict is the PER-POSITION YIELD QUALITY (does THIS hotkey on THIS subnet deserve to keep the capital). validatorConcentration is the PORTFOLIO-LEVEL STRUCTURAL RISK (how exposed is the book to ANY single hotkey failure — top1Share/top3Share). emissionAlignment is the SUBNET-LEVEL STRUCTURAL CEILING (is the subnet itself earning fair-share or starved). Treat as orthogonal — diagnostic chain: is THIS validator delivering on THIS subnet → can THIS subnet structurally deliver at all → is the BOOK over-concentrated regardless of yield.
- AGREE pattern: recommend_switch + diversified + aligned_with_emission = clean migration setup. Per-position lift exists, portfolio isn't already concentrated, the subnet structurally earns. Frame as "MIGRATE sn{N} {currentValidator} → {bestValidator}, +{liftTaoYr}τ/yr". Routes to Recommendations cleanly — no concentration cap to defer to, no subnet-ceiling re-route to apply.
- AGREE pattern: avoid_and_exit + concentrated/extreme_concentration + partially_aligned or starved_subnet_heavy = compound risk. The bleeding-edge hotkey is also one of the few hotkeys carrying the book AND the subnet itself is mid/low-emission. Frame as "sn{N} validator regressing while top{N}Share = {X%} — concentration AND yield-quality AND emission ceiling all stacked". Recommendation axis routes through CONCENTRATION first per iter 184 budget rule (the concentration risk is unbounded, the yield-quality risk is the projected loss), then through EMISSION re-route per iter 186, then yield-quality lands as MIGRATE within the split.
- DISAGREE pattern: recommend_switch + extreme_concentration = migration lift exists BUT executing it concentrates further. Right read is "the lift is real but the right move is SPLIT not MIGRATE — re-delegate to {bestValidator} for a fraction of position, leave existing on {currentValidator} as the structural counterweight". Do NOT recommend full migration on this pair — that converts a yield-quality win into a concentration loss. The cross-rule is the safeguard against single-axis recs that compound risk on another axis.
- DISAGREE pattern: avoid_and_exit + EMISSION_CEILING fired = the regressing read is misclassified per the EMISSION_CEILING bullet above. Do NOT recommend re-delegate (validator-selection action wasted on starved subnet); reroute through EMISSION_ALIGNMENT_HEURISTICS as a SUBNET selection — TRIM the position and REALLOCATE into aligned subnets per iter 186 budget.

Suppression rule: if direction is null (apy7d or apy30d missing OR apy30d ≤ 0) → no verdict computed, suppress the yield-quality read for that row entirely (the classifier requires both windows valid). If row is apyIsFallback (subnet-median proxy, not authentic per-validator data per lib/ai-insights.js line 496) → row excluded from the classifier upstream, suppress yield-quality read. If yqv block returns null (zero scored rows after filter — fresh wallet, no positions clearing the gate) → suppress §3 yield-quality narrative entirely rather than guess.

Recommendation-budget rule: recommend_switch verdicts (MIGRATE actions with τ/yr lift) feed Recommendations as a sub-2τ/yr-lift item — rank BELOW concentration single_validator/extreme_concentration (per iter 184 — concentration is structural risk, yield migration is incremental upside) AND BELOW starved_subnet_heavy + zeroEmissionShare ≥ 50% (per iter 186 — subnet-selection re-routes outrank validator-selection refinements) BUT ABOVE accelerating_fade aggregate apyTrend (per iter 185 — per-position regressing has a concrete migration path, aggregate accelerating_fade is read-only context). avoid_and_exit verdicts feed Risk Flags as durability-concern lines — rank EQUAL to accelerating_fade per iter 185 (both are observed yield-decay signals at different aggregation levels), BELOW realised drawdown flag_worthy/beyond_historical_tail per iter 187 (realised loss outranks projected loss). monitor_momentum verdicts NEVER feed a Recommendation by themselves — they are read-only context that shapes HOW recs land elsewhere. EMISSION_CEILING overrides any recommend_switch from yield-quality on the same row — re-route to SUBNET selection per iter 186 budget. NEVER recommend "switch every regressing hotkey" — a portfolio of 5 hotkeys regressing simultaneously is a market-wide weight rotation, not 5 independent yield problems; cluster as a single observation in §3 and surface concentration/emission as the actionable axes.
`.trim();

// Free-API verification reading. Iter 211 wired the §1 RPC-verified badge
// data (substrate decode + Taostats canonical + bittensor-tracker.app sweep
// + per-leg drift verdict) into the §0 user prompt as a "## Free-API
// verification (Priority #1 ground-truth proof)" block. The data is now
// IN the prompt — but without a KB heuristic the model has no framework
// for what those three witnesses mean structurally, when to anchor
// portfolio-total claims to them, how to phrase the three-source-concur
// narrative without sounding like marketing, or how to interpret per-leg
// drift attribution (esp. the stake-leg case where Taostats /coldkey_alpha_shares
// is the known stale source per lessons_taostats_alpha_shares_stale.md, not
// a substrate decode bug). This closes the iter-47 Priority #1 → Priority #2
// bridge: the AI now KNOWS what the verification block is telling it.
export const PRICE_RANGE_6MO_HEURISTICS = `
Per-subnet 6mo alpha-price range — reading dossier priceRange6mo:
- When a top-position dossier line carries "6mo alpha-price range" (min / p10 / median / p90 / max, all in τ, samples=N, asOf=date), it is the 180-day distribution of daily-snapshot alpha prices for that subnet from Taostats /api/dtao/pool/history/v1. The current alpha-price for that holding appears on the top-positions line as "α=X.XXXXXXτ".
- The renderer ALSO pre-computes the current alpha-price's decile bucket within that 6mo distribution and appends it to the same top-positions line as "bucket=NAME". This is a mechanical lookup — the AI does NOT need to compute percentiles from the {min,p10,median,p90,max} values. The bucket labels are exact and exhaustive: BELOW_MIN (current α < 6mo min, new all-time-low) / BELOW_P10 (between min and p10, bottom decile) / P10_TO_MEDIAN (p10 to median, lower-half in-range) / MEDIAN_TO_P90 (median to p90, upper-half in-range) / ABOVE_P90 (between p90 and max, top decile) / ABOVE_MAX (current α > 6mo max, new all-time-high). When the top-positions line shows "bucket=X" the bucket name IS the decile read — cite it verbatim ("sn64 sits in the BELOW_P10 bucket of its 6mo range") rather than re-deriving from the min/p10/median/p90/max numbers on the dossier line.
- Read the current price RELATIVE to the range, not the range edges in isolation:
  • current < min — new all-time-low for the 6mo window. Material, name it explicitly ("sn64 at 0.064τ is below the 6mo min of 0.064207τ").
  • current ≤ p10 — bottom decile of the 6mo distribution. Cite as "near the 6mo p10 (X.XXXXτ)" and treat as a discounted entry on the price axis; pair-read with emission share / yield band before any add-trade implication.
  • p10 < current < p90 — central 80% of the 6mo distribution. Treat as "in-range"; do NOT volunteer a price commentary unless the user asked. The price axis is not the interesting axis for an in-range read; pivot to yield / concentration / emission instead.
  • current ≥ p90 — top decile of the 6mo distribution. Cite as "near the 6mo p90 (X.XXXXτ)" and treat as a premium price; pair-read with trim-trade framing per RECOMMENDATION_HEURISTICS.
  • current > max — new all-time-high for the 6mo window. Material, name it explicitly.
- Hard guards on citing the priceRange6mo block:
  • MUST cite the priceRange6mo decile anchor when a top-position dossier line carries the field AND the current alpha-price falls outside the p10-p90 central 80% (i.e. current ≤ p10 OR current ≥ p90 OR current < min OR current > max). These are the materially informative reads — a top-position holding sitting in the bottom or top decile of its 6mo distribution is a structural piece of context the user paid for by carrying the position; omitting the cite when the AI has the data is a verbosity loss the user pays for in trust. Phrase explicitly: "sn64 at α=0.076τ sits near the 6mo p10 (0.068τ)" / "sn3 at α=0.025τ is in the bottom decile of its 6mo range".
  • MAY cite the priceRange6mo block when current sits inside p10–p90 only if the in-range frame strengthens a separate primary read (e.g. pairing with pct1m flow to argue "actively drawing down toward p10" or pairing with concentration to argue "the in-range price puts the position's TAO value squarely at its 6mo central tendency"). Otherwise omit — the price axis is not the interesting axis for an in-range read.
  • MUST NOT cite the range on a subnet where the dossier line does not include a "6mo alpha-price range" — the field is sparse (covers top10 backfill only); silently skip the price-axis frame and lean on the position's pct1d / pct7d / pct1m flow instead.
  • MUST NOT use the range to imply mean-reversion is a strategy — it is a distributional context, not a trade signal. A current price at p10 means "discounted vs the recent 6mo" but does NOT mean "will revert to median"; that claim requires fundamentals from CATEGORY_INFO + RECOMMENDATION_HEURISTICS, not the range alone.
  • MUST NOT compute a percent-of-range manually if the dossier line did not provide it — the AI can cite which decile the current price falls in (above p90, below p10, between p10 and p90) without inventing a precise "current is at the 73rd percentile" claim.
- Pair-read with pct1m: when the dossier line says "near 6mo p10" AND pct1m is materially negative on the same row, the price has been actively declining INTO the bottom decile, not just sitting there — flag as "drawing down into the bottom decile" rather than the static "discounted" framing. When pct1m is materially positive AND current is near p90, the price has been actively climbing INTO the top decile — flag as "rallying into the top decile".
- Pair-read with concentration: a position at p10 represents a smaller current alpha-price contribution to the position's TAO value than the same position at p90 (alphaHeld is the same; the τ value scales with price). When discussing concentration, name the per-position alpha-price decile context if material so the reader understands the position's pct-of-port is not the only axis (a 30% position at p90 carries more mark-to-market re-rate risk than a 30% position at p10).
- Never lead with the price range. The range is a CONTEXT for the per-position narrative, not its own headline. A §0 paragraph that opens with "sn64 is near its 6mo p90..." without first naming the position size, the emission share, or the staking flow framing inverts the priority — the user came for portfolio analysis, not subnet price commentary.
- Closing rule on the MUST cites above: skipping a top/bottom-decile cite when the data is present is not "concise" — it is a verbosity loss the user pays for in trust. The framework is load-bearing on the AI's job; treat it as such.
`.trim();

export const FREE_API_VERIFICATION_HEURISTICS = `
Free-API verification — reading the §1 RPC-verified verdict (Priority #1 ground-truth proof):
- The "## Free-API verification" block in the user prompt carries up to four bullets sourced independently per request: (1) substrate decode via finney RPC (System.Account u64 SCALE; free + reserved leg); (2) Taostats canonical (the same number Taostats serves on the wallet page; free + reserved + stake leg); (3) bittensor-tracker.app sweep (separate codebase, separate substrate RPC client, separate SCALE decoder — independent re-decode of the free leg); (4) drift verdict (status match / drift / wide, plus per-leg attribution: free / stake / both / null).
- The block is the Priority #1 ground-truth proof for the portfolio total — three independent witnesses on the headline number. When it is present, the headline TAO figure has been INDEPENDENTLY VERIFIED on the same request, not just retrieved from a paid API.
- Status semantics — the verdict line is the read, not the per-bullet numbers:
  • status = "match" — all sources concur within RAO precision (< 0.001τ). Anchor portfolio totals confidently ("the verified portfolio total of X τ"); do NOT manufacture any drift narrative on a match — there is nothing to discuss on the verification axis.
  • status = "drift" with driftLeg = "stake" AND crossCheck.agreesWithSubstrate AND crossCheck.agreesWithTaostats — three sources concur on the FREE leg; residual drift sits entirely in the stake leg. This is the EXPECTED pattern per lessons_taostats_alpha_shares_stale.md — Taostats /coldkey_alpha_shares is the known stale source (snapshot-lagged behind live block by minutes-to-hours), the substrate decode + sweep are live-block reads. Narrate as "three sources concur on the free leg; residual drift sits in the stake leg per the known Taostats /coldkey_alpha_shares snapshot lag" — DO NOT frame this as a substrate decode bug or a portfolio total problem.
  • status = "drift" with crossCheck.agreesWithSubstrate AND NOT crossCheck.agreesWithTaostats — the bittensor-tracker.app sweep AND tao-wallet-report's substrate decode agree on the free leg; Taostats canonical is the outlier. Taostats is mid-update on that endpoint. Narrate as "substrate decode + bittensor-tracker.app sweep concur; Taostats canonical is the outlier (likely mid-update)" — name Taostats specifically as the disagreeing witness, do NOT generalise to "data disagrees".
  • status = "drift" with driftLeg = "free" — atypical. The substrate decode says the free leg is X but Taostats says Y. If crossCheck.ok is true and the sweep agrees with substrate, the substrate read wins; if the sweep agrees with Taostats, the substrate read is suspect. Either way, flag explicitly that the free leg is the disputed axis, NOT the stake leg — that distinction matters because the typical drift pattern (stake leg) has a documented stale-Taostats explanation, while a free-leg drift does NOT and warrants caution on the headline figure.
  • status = "wide" (|drift| ≥ 0.1τ) — material divergence. Even with a documented stake-leg explanation, |drift| ≥ 0.1τ is past the noise threshold; mention the divergence magnitude in absolute τ when discussing portfolio totals so the user knows the headline carries a known uncertainty band.
- Hard guards on citing the verification block:
  • MUST cite the verification when status = "match" AND the §0 paragraph framing a portfolio-total claim, a PnL decomposition, or a concentration call — phrase as "the verified portfolio total of X τ" so the headline anchor carries the three-witness backing. Skipping the cite when the verdict is "match" silently demotes a structural piece of trust the user paid for by waiting for the substrate+sweep+Taostats round-trip.
  • MUST cite the verification when status = "drift" AND driftLeg is informative (driftLeg = "stake" with both-agree cross-check → "three sources concur on the free leg; residual drift sits in the stake leg per the known Taostats /coldkey_alpha_shares snapshot lag"; substrate-agree only → "substrate + bittensor-tracker.app sweep concur, Taostats canonical is the outlier"; driftLeg = "free" → flag the disputed axis explicitly per the status branch above). The cite must precede or attach to the headline TAO figure / PnL framing — naming the disagreeing witness specifically is what distinguishes a defensible report from generic "data may vary" prose.
  • MAY cite the verification on adjacent reads (yield breakdown, drawdown, flow) when it materially strengthens the framing; otherwise omit — the verification anchors the total, not the per-position narratives. Phrase as a confidence anchor on the relevant claim, not a marketing claim.
  • MUST NOT invent a drift narrative when status = "match" — the verdict explicitly says all sources concur; manufacturing a "there might be a discrepancy" framing contradicts the data on the page. The same applies to the stake-leg-only drift case when crossCheck both-agree fires — the cross-check is the AI's permission to anchor on the free-leg agreement, not to platform a non-existent free-leg risk.
  • MUST NOT cite the verification on wallets where the block is absent from the user prompt (e.g. shadow disabled, substrate kickoff failed, crossCheck.ok = false on the only available signal). The block's absence is graceful degradation, not invisibility — silently skip the verification frame, do not say "verification unavailable" or "we couldn't verify the total" (the user does not need a status report on a backend probe).
  • MUST NOT redefine the witnesses in plain English when citing them — the user can read the §1 RPC verified badge tooltip on-page for the same breakdown; the AI's job is to anchor narrative claims to the verdict, not re-explain what substrate / Taostats / bittensor-tracker.app are.
- Pair-read with PnL discussion: when the headline TAO total feeds a PnL framing (per PNL_DECOMPOSITION), a verified total strengthens the PnL claim — the staking-income + price contribution decomposition is being applied to a number THREE INDEPENDENT WITNESSES SAW. Frame as "the verified portfolio total of X τ decomposes to {staking_income} τ structural + {price_contribution} τ mark-to-market" when status = "match"; when status = "drift" with documented stake-leg explanation, the PnL framing is unchanged (the drift is in the stake-leg snapshot, not the cumulative income or the headline).
- Pair-read with concentration discussion: the verification verdict does NOT change concentration math (top-N share is computed from positions, the verification verdict is on the headline total). Do NOT cross-cite — concentration framing is its own axis. The verification block is the anchor for "the total is real"; concentration is the anchor for "how the total is distributed". Two orthogonal claims.
- Never lead with the verification. Lead with the report's primary read (PnL, concentration, yield, drawdown, flow per the relevant heuristics); the verification block is a confidence anchor for those reads, not a headline finding. A §0 paragraph that opens with "the portfolio total has been verified..." inverts the priority — the user came for analysis of the portfolio, not for backend proof of the API call. Mention the verification when it strengthens the framing of a primary read, not as its own bullet.
- Closing rule on the MUST cites above: silently demoting the verification verdict to a backend implementation detail wastes the three-witness round-trip the user already paid the latency for. When the block is present and the verdict is informative (match or any drift branch with a defensible per-leg attribution), the cite is load-bearing on the trust contract — not an optional flourish.
`.trim();

// Root subnet (sn0) is mechanically distinct from every other subnet and the
// existing heuristics treat it as just another netuid. Without this block the
// AI conflates "α held on sn0" with "α held on an AMM subnet" and reasons
// uniformly across both — which is wrong on price-axis math, yield framing,
// and concentration interpretation. The iter 233 forensic sequence flagged
// sn0-heavy wallets as the MATCH baseline against AMM-heavy DRIFT wallets;
// that mechanical distinction is load-bearing on portfolio narratives too.
// Composite subnet-health read. The AI already sees four per-subnet axes
// (emissionPct, alpha-price 7d/30d + decile bucket, APY band, staking flow)
// through earlier heuristic blocks, but each block addresses ONE axis. Without
// guidance the model treats them as four separate facts — flags emissionPct,
// flags drawdown, flags low APY, flags outflows — and produces four single-axis
// recommendations on the same subnet instead of one composite read. The block
// teaches the joint-read: which axis combinations diagnose a coherent state
// (expanding, distressed, rotation-only, accumulation-window) and when the
// composite outranks any single-axis flag.
export const SUBNET_HEALTH_HEURISTICS = `
Subnet health composite read (integrate emission + price + yield + flow as a JOINT signal, not four separate flags):
- The report surfaces four per-subnet axes against which subnet health can be read jointly: emissionPct (structural earnings power — what share of the global per-block TAO emission this subnet captures), alpha-price trajectory (24h / 7d / 30d move + 6mo decile bucket), APY band (yield realisation given emission share), and staking flow (net capital migration into or out of the subnet). Each axis already has its own heuristic block; the COMPOSITE outranks any single-axis read when ≥3 of the 4 axes have data on the same subnet and align on the same diagnosis.
- Composite (A) — expanding/healthy: emissionPct ≥ fair-share (≈ 0.78%, the 1/128 line per EMISSION_ALIGNMENT_HEURISTICS) AND alpha-price 7d ≥ +5% AND 6mo decile bucket inside MEDIAN_TO_P90 or P10_TO_MEDIAN AND APY band normal-or-above. Cite as ADD-candidate framing even when no single axis is exceptional — structural earnings + price confirmation + yield realisation + capital alignment is a stronger signal than any one axis would carry alone. MUST cite when 3+ axes align on (A).
- Composite (B) — distressed/contracting: emissionPct < 0.5% AND alpha-price 30d ≤ −15% AND 6mo decile bucket BELOW_P10 or BELOW_MIN AND APY band low-or-below. Cite as TRIM-candidate framing even when no single axis trips its own flag aggressively — the joint read upgrades the conviction past what FLAG_HEURISTICS or DRAWDOWN_HEURISTICS would carry on either axis alone. MUST cite when 3+ axes align on (B).
- Composite (C) — rotation/speculative-flow (bull-trap): alpha-price 7d ≥ +20% AND emissionPct still < 1.0% AND staking-flow weak or net-outflow. Frame as "rotation flow, not fundamentals" — short-window price strength without emission backing and without capital arriving is speculative rotation, not a re-rate. MUST NOT cite as ADD-candidate purely on the price axis; the emission + flow read disqualifies the structural case even when the price axis tempts it. Surface explicitly so the reader does not confuse price momentum for subnet strength.
- Composite (D) — accumulation-window/sleeper-setup: emissionPct ≥ 1.5% AND alpha-price 30d flat-to-slightly-down (between −5% and +5%) AND 6mo decile bucket at-or-below MEDIAN AND staking-flow net-positive. Frame as accumulation-window candidate — structural earnings rising but price has not yet re-rated, with capital quietly arriving. Lower-conviction than (A) because the re-rate is forward-looking; cite as "early ADD signal pending price confirmation" rather than full ADD-candidate framing.
- Tier-aware conviction modifier (cross-reference SUBNET_MATURITY): composite (A) on a Tier 3 subnet is HIGHER-conviction than on a Tier 1 (Tier 1 is already established, so the composite simply confirms; Tier 3 expanding past the noise floor is a stronger signal — name the tier explicitly when surfacing the (A) call). Composite (B) on a Tier 1 subnet is HIGHER-conviction than on a Tier 3 (Tier 1 distress is structural and unusual; Tier 3 distress is sometimes just normal launch-cycle volatility — name the tier so the reader weights the call appropriately).
- MUST NOT cite a composite (A) "healthy" read on a sub-fair-share subnet (emissionPct < 0.78%, the 1/128 line) regardless of how strong the other three axes look — the structural earnings-power gap from EMISSION_ALIGNMENT_HEURISTICS dominates. A sub-fair-share subnet with a +30% 7d alpha-price move and a TOP-quartile decile bucket is composite (C) (rotation), not composite (A).
- MUST NOT cite on sn0 root — see ROOT_SUBNET_MECHANICS. The four axes do not all apply to sn0 (no AMM-side price trajectory, no priceRange6mo bucket, emissionPct framing is via root-weights distribution not direct subnet earnings), so the composite is structurally not defined on sn0. Skip the block entirely for sn0 positions; the single-axis ROOT_SUBNET_MECHANICS framing is authoritative.
- Sparse-safe: if only 1-2 axes have data for a given subnet, do NOT force a composite read. Defer to the relevant single-axis block (FLAG_HEURISTICS for concentration, PRICE_RANGE_6MO_HEURISTICS for bucket, EMISSION_ALIGNMENT_HEURISTICS for emission share, DRAWDOWN_HEURISTICS for price 30d, STAKING_FLOW_HEURISTICS for flow). The composite is additive over the per-axis reads, not a replacement for them.
- Portfolio-level vs subnet-level scope: this composite is a PER-SUBNET diagnostic. Portfolio-level emission alignment, staking flow, and drawdown verdicts already ship through their own VERDICT_HEURISTICS blocks and are authoritative at the portfolio level. Do NOT use a per-subnet composite to override a portfolio-level verdict — e.g. a single composite (A) subnet does not flip a portfolio-level starved_subnet_heavy emissionAlignment verdict; it gets cited as a relatively-bright spot within a structurally-starved book.
- Closing rule: the composite is a TRUST-EARNING surface when used correctly. Cite it when 3+ axes align (saves the reader from manually integrating four separate flags); skip it when fewer axes have data or when sn0 / sub-fair-share rules out (A). Forcing a composite call on 2-axis data is a verbosity loss the reader pays for in trust, the same trust contract that FREE_API_VERIFICATION_HEURISTICS and PRICE_RANGE_6MO_HEURISTICS already articulate.
`.trim();

export const REGISTRATION_BURN_DYNAMICS = `
Subnet registration burn + immunity period — pre-launch / miner-side acquisition-cost axis (complementary to the SUBNET_HEALTH_HEURISTICS post-launch composite):
- Registration cost = the TAO amount a miner or validator must BURN (not stake — burn, permanently destroyed) to register a hotkey on a subnet. Set by the dynamic burn curve, which rises when registration demand is high and decays back toward floor when demand falls. The current burn cost is therefore a real-time market-signal of how aggressively new miners are trying to enter the subnet — high burn = competitive demand for slots, low burn = empty seats with no takers.
- Immunity period = the N blocks after registration during which a new miner cannot be deregistered by the network's churn process. Default 7200 blocks (~1 day at 12s blocks; subnet owners can configure). Functions as the "grace window" giving a new miner time to climb the weights and avoid eviction by a higher-performing newcomer.
- Dynamic burn signal — directional read on miner attraction over time. Rising registration cost over a 7d window = miners arriving faster than seats are clearing = subnet is attractive (could be earnings expectation, could be speculative entry, see hard guards). Falling registration cost = miners leaving or not bothering to re-register = subnet is losing competitive interest. Flat at floor (often 1 τ) = no competitive demand, miners can walk in.
- Read directives — pair the burn-axis with post-launch axes from SUBNET_HEALTH_HEURISTICS for the cleanest call: rising burn AND composite (A) expanding/healthy = highest-conviction structural ADD framing (miners arriving in confirmation of structural earnings); rising burn AND composite (C) rotation/bull-trap = speculative entry chasing recent price (the burn signal upgrades the (C) call from "rotation flow" to "rotation flow with miner FOMO" — even less of a fundamentals story); falling burn AND composite (B) distressed/contracting = highest-conviction structural TRIM framing (capital and miners both walking, structural exit confirmation); falling burn AND composite (A) = caution flag (price + emission + flow look healthy but miner-side interest is fading — possible early-warning).
- MUST NOT confuse high registration cost with subnet health on its own — speculative entry (chasing a recent price move on a sub-fair-share subnet) can spike registration cost without any structural earnings catalyst. The burn-axis is an INPUT into the composite read, not a standalone health score. Cite as "registration burn rising — miners arriving" with the rest of the diagnosis attached, never as "high registration cost = healthy subnet".
- MUST NOT cite on sn0 root — registration to root is gated by a different mechanism (root validator slots are scarce + reputationally-gated, not burn-priced like AMM subnets). The dynamic-burn framing structurally does not apply. Per ROOT_SUBNET_MECHANICS, skip this block entirely for sn0 positions.
- Sparse-safe: registrationCost / immunityPeriod / 7d burn-trend may be absent on older dossier snapshots or for subnets the dossier doesn't yet enrich with miner-side data. If the field is absent, do NOT speculate from emission share alone (high emission share does not imply high or low burn — they're partially decoupled). Skip the burn-axis read silently; the post-launch composite from SUBNET_HEALTH_HEURISTICS is still valid on the axes that ARE populated.
- Tier-aware modifier (cross-reference SUBNET_MATURITY): rising burn on a Tier 3 subnet is a stronger forward-looking signal than on a Tier 1 (Tier 1 burn changes can be operator/validator churn at the margin; Tier 3 burn rising is more often "miners discovering this subnet is worth competing for"). Falling burn on a Tier 1 subnet is a stronger distress signal than on a Tier 3 (Tier 1 was already established — burn falling means miners are actively giving up, vs Tier 3 where falling burn can be normal launch-cycle cooling).
- Closing rule: cite the burn-axis when the data is present AND when it adds directional conviction to the post-launch composite or when it provides the only forward-looking signal on a subnet where 30d price + emission share alone don't move much. Skip it when the field is absent or when citing it would just restate what the SUBNET_HEALTH composite already conveys. Same trust contract FREE_API_VERIFICATION_HEURISTICS and SUBNET_HEALTH_HEURISTICS articulate — citation is earned by adding information the reader cannot read off the rest of the report on their own.
`.trim();

export const ROOT_SUBNET_MECHANICS = `
Root subnet (netuid 0) — mechanically distinct from every other subnet, treat its α holdings differently:
- Fixed conversion: 1 α (root) ≡ 1 τ exactly. No AMM, no price discovery, no slippage. Root α is functionally just TAO bonded to a validator at face value — there is no "alpha-price drift" on a root position. If a top-positions line shows a sn0 holding, the τ value is the α quantity to RAO precision; do NOT volunteer a price-axis read on it.
- Validator-delegated emission split: root stake earns yield from the global per-block TAO emission distributed across all subnets by root weights, then split between miners + validators on each subnet. Baseline yield band ~10–14% APY (per YIELD_BANDS). Sub-8% sustained → validator under-performance (consider re-delegate); sustained above 14% with no clear catalyst → recompute, root yields don't structurally outrun the network's emission rate.
- No subnet-specific token-price exposure on root: a 30% drawdown on sn1 alpha does NOT mark down a sn0 root position. Root yield can compress if the operator changes weights or commission, but the principal does not re-rate on subnet-token drawdowns. Frame root positions as the LOW-VOLATILITY leg of the portfolio for purposes of concentration and drawdown discussion.
- Concentration on root is structurally different from concentration on an AMM subnet: a 50% sn0 concentration carries validator-performance risk and TAO-vs-USD risk, NOT alpha-price drawdown risk. Do NOT cite the > 40% concentration heuristic from FLAG_HEURISTICS as if a 50% root position carries the same alpha-drawdown swing risk a 50% sn64 position would; phrase the call as "50% sn0 root concentration — validator-performance dependency rather than subnet alpha drawdown exposure".
- 6mo alpha-price range never applies to sn0: PRICE_RANGE_6MO_HEURISTICS is for AMM subnets only. SUBNET_DOSSIER entry for sn0 has no priceRange6mo field — if the dossier line for sn0 is rendered without a range, that is correct, NOT a sparse-dossier omission. Do NOT cite percentile-bucket framing on sn0 even if the dossier surface tempts it.
- Per-validator yield variance on root reflects validator effectiveness, not subnet activity: a 12% sn0 yield delta between two validators is the operator difference (vtrust, weights skill, emission-share won), NOT a subnet fundamentals story. When VALIDATOR_YIELD_BREAKDOWN_HEURISTICS surfaces a root yield gap, frame it as a re-delegate decision, not a subnet-trade decision.
- Pair-read with MATCH-baseline framing: portfolios heavily weighted to sn0 root lack the per-AMM-subnet aggregation drift that drives the ±10 mτ bounded-noise tier on subnet-heavy wallets (free-API verification verdict tends to land "match" cleanly, no stake-leg drift to explain). When the verification block shows "match" on a sn0-heavy portfolio, the cleanliness is structural — root holdings have no AMM-side aggregation surface to disagree on — not a separate trust signal beyond what FREE_API_VERIFICATION_HEURISTICS already captures.
- Never recommend "migrating sn0 root into an AMM subnet" purely on yield grounds: the swap converts a fixed-α-quantity / variable-validator-yield position into a variable-α-price / variable-emission-yield position. The risk profiles are different in kind, not just in magnitude. If recommending such a migration, explicitly name the new alpha-price drawdown exposure the position would carry.
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

${ANNUAL_VS_APY_VERDICT_HEURISTICS}

${STAKING_FLOW_VERDICT_HEURISTICS}

${YIELD_QUALITY_VERDICT_HEURISTICS}

${FREE_API_VERIFICATION_HEURISTICS}

${PRICE_RANGE_6MO_HEURISTICS}

${ROOT_SUBNET_MECHANICS}

${SUBNET_HEALTH_HEURISTICS}

${REGISTRATION_BURN_DYNAMICS}
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
    out.push({
      netuid: id,
      name: entry.name,
      purpose: entry.purpose,
      priceRange6mo: entry.priceRange6mo || null,
    });
  }
  return out;
}
