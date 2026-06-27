// Maps the structured buildReport() output into a tight analyst prompt, sends
// it through the multi-provider LLM chain, and returns the narrative report.
//
// Mirrors the section structure Jai trusts from the weekly FINAL doc:
//   ## Summary
//   ## What Changed
//   ## Recommendations
//   ## Risk Flags
//
// Cached separately from the deterministic report (1h TTL) so refreshing the
// page doesn't burn provider quota on a $0-floor backend like Pollinations.

import { chat } from './llm.js';
import {
  KB_TEXT,
  CATEGORY_INFO,
  dossierForPositions,
  portfolioCategoryBreakdown,
} from './bittensor-kb.js';

const INSIGHTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — narrative drifts slowly
const insightsCache =
  globalThis.__insightsCache || (globalThis.__insightsCache = new Map());

export function peekCachedInsights(coldkey) {
  const entry = insightsCache.get(coldkey);
  if (!entry) return null;
  if (Date.now() - entry.at > INSIGHTS_CACHE_TTL_MS) {
    insightsCache.delete(coldkey);
    return null;
  }
  return entry.data;
}

const SYSTEM_PROMPT = `You are a sharp, plain-speaking Bittensor portfolio analyst writing for a sophisticated retail investor (Jai). The reader knows what TAO, alpha tokens, subnets, validators, and APY are — do NOT define them. Be specific, cite the numbers from the data, and use clean markdown headings.

Output EXACTLY these four sections in this order, with these exact headings:

## Summary
One paragraph (3-5 sentences). State the headline PnL number, the portfolio total, the dominant position, and one sentence on the overall posture (concentrated vs diversified, performing vs lagging).

## What Changed
Bullet list. Cover: notable 24h / 7d / 30d moves at the portfolio level, the biggest individual winners and losers among positions, and any broader-market context worth flagging (TAO price moves, hot subnets).

## Recommendations
Numbered list of 3-5 ACTIONABLE items. For each: state the action in one line ("Trim 0.5τ from subnet 56"), then on the next line give the WHY (one sentence citing data — "subnet 56 dropped 8% over 7d while sn4 yields are stable at 18%"). Be specific. Don't recommend things the user is already doing well. If the portfolio looks healthy, say so and recommend monitoring instead of forcing changes.

## Risk Flags
Bullet list. Concentration risk, sustained drawdowns, low-coverage yield, anomalies vs broader market. Tie each flag to a number from the data. If there are no real flags, say "No material risk flags — portfolio is balanced and yielding within expected ranges."

Style rules:
- Use τ (tau) for TAO amounts. Round to 2dp for displays.
- Use + / - prefix for signed numbers (e.g. +0.196 τ, -2.1%).
- Never use bold for emphasis inside paragraphs — let the markdown headings do the structural work.
- Never start sections with "Here is" or "Below is". Start with the substance.
- Never add disclaimers, "consult a financial advisor", or "this is not financial advice" — that's covered elsewhere on the page.
- If the data is sparse (missing PnL, < 3 positions), acknowledge briefly and focus on what IS there.
- If a "## Free-API verification (Priority #1 ground-truth proof)" block is present in the data, the portfolio total has been verified by independent substrate decode (and often a third bittensor-tracker.app sweep). When framing portfolio totals in Summary or Recommendations, you MAY anchor to that verification — e.g. "the verified portfolio total of X τ" or "all sources concur within RAO precision" or "the drift sits in the stake leg, not the headline". Cite the verdict honestly: if all-sources-concur, treat the total as ground truth; if drift is named on a leg, route concern to that leg only, not the percentage. Never invent verification claims when the block is absent.

${KB_TEXT}`;

function fmtTao(n, d = 3) {
  if (n == null || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(d)}τ`;
}

function fmtPct(n, d = 2) {
  if (n == null || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(d)}%`;
}

function buildUserPrompt(report) {
  const p = report.portfolio;
  const gt = report.pnlGroundTruth;
  const pn = report.pnl;
  const y = report.yield;
  const f = report.flags;
  const b = report.broader;

  const lines = [];

  lines.push(`### Coldkey ${report.coldkey}`);
  lines.push(`Generated ${report.generatedAt} · TAO/USD $${report.taoPriceUsd.toFixed(2)}`);
  lines.push('');

  // Portfolio
  lines.push('## Portfolio');
  lines.push(`Total: ${p.totalTao.toFixed(3)}τ ($${p.totalUsd.toFixed(0)} / A$${p.totalAud.toFixed(0)}) across ${p.positionCount} positions.`);
  if (p.canonicalSource === 'free-api-fallback' && typeof p.canonicalTao === 'number') {
    const reason = p.canonicalReason || 'delegation_rate_limited';
    lines.push(
      `NOTE: The portfolio total of ${p.canonicalTao.toFixed(4)}τ is sourced from free-API substrate RPC because Taostats canonical /delegation was rate-limited (reason: ${reason}) at snapshot time. Treat this as authoritative for this snapshot.`,
    );
  }
  lines.push('');
  lines.push('Top positions:');
  for (const pos of p.top10.slice(0, 10)) {
    const pct1d = pos.pct1d != null ? `${pos.pct1d >= 0 ? '+' : ''}${pos.pct1d.toFixed(2)}%` : 'n/a';
    const pct7d = pos.pct7d != null ? `${pos.pct7d >= 0 ? '+' : ''}${pos.pct7d.toFixed(2)}%` : 'n/a';
    lines.push(
      `- sn${pos.netuid} ${pos.name}: ${pos.taoValue.toFixed(2)}τ (${pos.pctOfPortfolio.toFixed(1)}% of port) · 24h ${pct1d} · 7d ${pct7d}`,
    );
  }
  lines.push('');

  // Per-position dossier — give the model a one-line purpose for each
  // top-position subnet we have a KB entry for. Keeps the system prompt
  // light while still letting the analyst reason about WHAT each subnet does.
  const dossier = dossierForPositions(p.top10);
  if (dossier.length > 0) {
    lines.push('Dossier for held subnets:');
    for (const d of dossier) {
      lines.push(`- sn${d.netuid} (${d.name}): ${d.purpose}`);
    }
    lines.push('');
  }

  // Category breakdown — second concentration axis. Lets the model spot
  // book-level correlation risk (e.g. 60% compute across 3 different subnets)
  // even when no single position crosses the per-subnet concentration threshold.
  const categories = portfolioCategoryBreakdown(p.top10);
  if (categories.length > 0) {
    lines.push('Category breakdown (across top positions):');
    for (const c of categories) {
      const subnetList = c.subnets.map((id) => `sn${id}`).join(', ');
      const plural = c.count === 1 ? 'position' : 'positions';
      lines.push(
        `- ${c.label}: ${c.count} ${plural} (${subnetList}) · ${c.taoTotal.toFixed(2)}τ (${c.pctOfPort.toFixed(1)}% of port)`,
      );
    }
    lines.push('');

    // Inline narrative hook: for any category that crosses 25% of the
    // portfolio, surface its CATEGORY_INFO purpose so the model can name
    // the category-level thesis the user is implicitly running, rather
    // than just citing the % from the breakdown above.
    const material = categories.filter(
      (c) => Number.isFinite(c.pctOfPort) && c.pctOfPort >= 25,
    );
    if (material.length > 0) {
      lines.push('Category context (for any category ≥25% of port):');
      for (const c of material) {
        const info = CATEGORY_INFO[c.category];
        if (!info?.purpose) continue;
        lines.push(`- ${c.label} (${c.pctOfPort.toFixed(1)}%): ${info.purpose}`);
      }
      lines.push('');
    }
  }

  // Free-API verification (Priority #1 ground-truth proof) — iter 211 (auto-loop iter 272).
  // Surfaces the §1 RPC verified badge data (iter 205-210) into the AI prompt
  // so the model can anchor every portfolio-total claim to an independent
  // substrate decode + bittensor-tracker.app sweep. Without this block the
  // analyst sees portfolio.totalTao as a single Taostats-derived number; with
  // it, the analyst KNOWS there are two or three independent witnesses
  // verifying that number, can cite "three sources concur on free leg", and
  // can name driftLeg explicitly when drift exists (the §1 RPC verified badge
  // tooltip carries the same breakdown verifiably).
  //
  // Gated on shadowVerified existing with a numeric canonical reading. The
  // crossCheck block is rendered conditionally — only present when status
  // wasn't "match" AND the bittensor-tracker.app sweep responded ok. For
  // status="match" wallets, both substrate and Taostats already agree within
  // RAO precision so the cross-check isn't fired (no drift to investigate).
  const sv = p.shadowVerified;
  if (sv && Number.isFinite(sv.totalTao)) {
    lines.push('## Free-API verification (Priority #1 ground-truth proof)');
    const substrateLeg =
      Number.isFinite(sv.freeTao) && Number.isFinite(sv.stakeTao)
        ? ` (${sv.freeTao.toFixed(6)}τ free + ${sv.stakeTao.toFixed(6)}τ stake)`
        : '';
    lines.push(`- Substrate decode (finney RPC): ${sv.totalTao.toFixed(6)}τ${substrateLeg}.`);
    if (Number.isFinite(sv.canonicalTao)) {
      const canParts = [];
      if (Number.isFinite(sv.canonicalFreeTao)) canParts.push(`${sv.canonicalFreeTao.toFixed(6)}τ free`);
      if (Number.isFinite(sv.canonicalReservedTao) && sv.canonicalReservedTao > 0)
        canParts.push(`${sv.canonicalReservedTao.toFixed(6)}τ reserved`);
      if (Number.isFinite(sv.canonicalStakeTao)) canParts.push(`${sv.canonicalStakeTao.toFixed(6)}τ stake`);
      const canLegs = canParts.length ? ` (${canParts.join(' + ')})` : '';
      lines.push(`- Taostats canonical: ${sv.canonicalTao.toFixed(6)}τ${canLegs}.`);
    }
    const cc = sv.crossCheck;
    if (cc?.ok && Number.isFinite(cc.freeTao)) {
      const subAgree = cc.agreesWithSubstrate ? 'agrees' : 'disagrees';
      const taoAgree = cc.agreesWithTaostats ? 'agrees' : 'disagrees';
      lines.push(
        `- Independent sweep (bittensor-tracker.app): free=${cc.freeTao.toFixed(6)}τ — ${subAgree} with substrate AND ${taoAgree} with Taostats.`,
      );
    }
    if (sv.status === 'match') {
      lines.push(
        '- Drift verdict: all sources concur within RAO precision (|drift| < 0.001 τ) — the portfolio total has been independently verified.',
      );
    } else if (sv.driftLeg) {
      const dt = Number.isFinite(sv.driftTao) ? sv.driftTao : 0;
      const dp = Number.isFinite(sv.driftPct) ? sv.driftPct : 0;
      const sign = dt >= 0 ? '+' : '';
      lines.push(
        `- Drift verdict: concentrated in the ${sv.driftLeg} leg (${sign}${dt.toFixed(6)}τ, ${(dp * 100).toFixed(3)}%); other legs concur within RAO precision.`,
      );
      if (cc?.ok && cc.agreesWithSubstrate && !cc.agreesWithTaostats) {
        lines.push(
          '- Cross-check verdict: two independent substrate decodes agree on the free leg — Taostats is the outlier on this snapshot.',
        );
      } else if (cc?.ok && cc.agreesWithSubstrate && cc.agreesWithTaostats) {
        lines.push(
          '- Cross-check verdict: three sources concur on the free leg — the residual drift sits entirely in the stake leg (consistent with stale Taostats /coldkey_alpha_shares per lessons_taostats_alpha_shares_stale.md).',
        );
      } else if (cc?.ok && !cc.agreesWithSubstrate && cc.agreesWithTaostats) {
        lines.push(
          '- Cross-check verdict: bittensor-tracker.app sweep agrees with Taostats but not the local substrate decode — possible substrate finalized-head lag on this fetch.',
        );
      }
    } else {
      const dt = Number.isFinite(sv.driftTao) ? sv.driftTao : 0;
      const dp = Number.isFinite(sv.driftPct) ? sv.driftPct : 0;
      const sign = dt >= 0 ? '+' : '';
      lines.push(
        `- Drift verdict: ${sign}${dt.toFixed(6)}τ (${(dp * 100).toFixed(3)}%) — leg attribution unavailable on this snapshot.`,
      );
    }
    lines.push(
      'When discussing portfolio totals, you MAY cite "the portfolio total is independently verified by substrate RPC" or "three sources concur on the free leg" or attribute any drift specifically to the named leg. This is provably visible to the user as a coloured dot + tooltip on the §1 RPC verified badge — do not invent verification claims that conflict with the verdict above. If the verdict is all-sources-concur, do NOT manufacture a drift narrative; if drift is concentrated in a single leg, route any concern about portfolio total to that leg explicitly, not to the headline percentage.',
    );
    lines.push('');
  }

  // PnL ground truth
  if (gt?.available) {
    lines.push('## PnL (ground truth, Taostats tax-report formula)');
    lines.push(`Profit: ${fmtTao(gt.profitTao, 3)} (${fmtPct(gt.returnPct, 2)}) over last ${gt.effectiveWindowDays} days.`);
    lines.push(`Window: ${gt.firstSnapshotDate} → ${gt.lastSnapshotDate}${gt.windowIsShortened ? ` (requested ${gt.windowDays}d but data only covers ${gt.effectiveWindowDays}d — the headline number is a partial-window reconstruction, treat magnitude accordingly when comparing to annualised returns)` : ''}`);
    lines.push(`Starting balance: ${gt.startingBalanceTao.toFixed(3)}τ · Current portfolio: ${gt.currentPortfolioTao.toFixed(3)}τ`);
    lines.push(`Transfers in: ${gt.transferInTao.toFixed(3)}τ · Transfers out: ${gt.transferOutTao.toFixed(3)}τ`);
    if (gt.dailyIncomeTao > 0) {
      lines.push(`Staking income over window: ${gt.dailyIncomeTao.toFixed(4)}τ`);
    }
  } else {
    lines.push('## PnL ground truth');
    lines.push(`Unavailable${gt?.reason ? ` (${gt.reason})` : ''}.`);
  }
  lines.push('');

  // PnL decomposition — computed verdict + ratios so the model isn't deriving
  // staking_share / price_share / implied-annual from the raw numbers inline.
  // KB section PNL_DECOMPOSITION (iter 117) tells the model how to READ these;
  // this block hands them over pre-computed with a verdict label it can quote.
  const dec = report.pnlDecomp;
  if (dec?.available) {
    lines.push('## PnL decomposition (computed)');
    lines.push(`Verdict: ${dec.verdict} — ${dec.verdictReason}`);
    lines.push(
      `Staking-income contribution: ${dec.stakingIncomeTao.toFixed(3)}τ` +
        (dec.stakingShare != null
          ? ` (${(dec.stakingShare * 100).toFixed(0)}% of headline PnL)`
          : ''),
    );
    lines.push(
      `Price contribution: ${dec.priceContribTao >= 0 ? '+' : ''}${dec.priceContribTao.toFixed(3)}τ` +
        (dec.priceShare != null
          ? ` (${(dec.priceShare * 100).toFixed(0)}% of headline PnL)`
          : ''),
    );
    if (dec.impliedAnnualReturn != null) {
      const implied = (dec.impliedAnnualReturn * 100).toFixed(1) + '%';
      const apy = dec.weightedApy != null ? (dec.weightedApy * 100).toFixed(1) + '%' : 'n/a';
      const gap =
        dec.annualVsApyGapPp != null
          ? ` (gap ${dec.annualVsApyGapPp >= 0 ? '+' : ''}${dec.annualVsApyGapPp.toFixed(1)}pp — ${dec.annualVsApyVerdict})`
          : '';
      lines.push(
        `Implied annualised return (window × 365/${dec.effectiveWindowDays}d): ${implied} vs weighted APY ${apy}${gap}.`,
      );
    }
    lines.push('Use this decomposition before framing window performance — do not call yield-positive/price-negative windows "underperforming", and do not extrapolate windfall-tagged headlines.');
    lines.push('');
  }

  // Alpha-trading PnL
  lines.push('## Alpha-trading PnL (supplementary)');
  lines.push(`Spent: ${pn.spentTao.toFixed(3)}τ · Sold: ${pn.soldTao.toFixed(3)}τ · α value now: ${pn.currentTao.toFixed(3)}τ`);
  lines.push(`Total: ${fmtTao(pn.totalPnlTao, 3)}`);
  lines.push(`1h: ${fmtTao(pn.change1hTao, 3)} · 24h: ${fmtTao(pn.change24hTao, 3)} · 7d: ${fmtTao(pn.change7dTao, 3)} · 30d: ${fmtTao(pn.change30dTao, 3)}`);
  // Iter 140 — multi-window price-momentum quartet verdict. Gives the model
  // the directional read across the depth ladder so What Changed can frame
  // today's slice against the 30d arc instead of treating 1d in isolation.
  const mwpm = pn.multiWindowPriceMomentum;
  if (mwpm?.available && mwpm.verdict) {
    const wpct = mwpm.windows.map((w) => `${w.label}:${w.pctPortfolio.toFixed(2)}%`).join(' · ');
    lines.push(`Multi-window momentum: ${mwpm.verdict} — ${wpct}. ${mwpm.verdictReason}`);
  }
  lines.push('');

  // Yield
  lines.push('## Yield');
  const apyStr = y.weightedApy != null ? (y.weightedApy * 100).toFixed(2) + '%' : 'n/a';
  lines.push(`Weighted APY: ${apyStr} (coverage ${(y.coverage * 100).toFixed(0)}%)`);
  if (y.best) lines.push(`Best: sn${y.best.netuid} @ ${(y.best.apy * 100).toFixed(2)}%`);
  if (y.worst) lines.push(`Worst: sn${y.worst.netuid} @ ${(y.worst.apy * 100).toFixed(2)}%`);
  // Portfolio-level optimisation headline — what the user could earn if every
  // position re-delegated to its subnet's best validator. Gives the model a
  // single "leaving on the table" number to anchor MIGRATE recs.
  if (y.bestCaseWeightedApy != null && y.liftIfOptimised != null && y.liftIfOptimised > 0) {
    lines.push(
      `Optimised-case weighted APY: ${(y.bestCaseWeightedApy * 100).toFixed(2)}% (lift +${(y.liftIfOptimised * 100).toFixed(2)}pp if every position re-delegated to its subnet's best validator).`,
    );
  }
  // Per-position re-delegation opportunities — give the model the actual
  // validator-switch suggestions, sorted by absolute TAO/year lift. Top 5 only
  // (keeps prompt bounded). The KB's MIGRATE heuristic depends on this data.
  if (Array.isArray(y.delegationOpportunities) && y.delegationOpportunities.length > 0) {
    lines.push('');
    lines.push('Re-delegation opportunities (top 5 by τ/year lift — your validator is materially behind the subnet\'s best):');
    for (const opp of y.delegationOpportunities.slice(0, 5)) {
      const currentApy = opp.apy != null ? (opp.apy * 100).toFixed(2) + '%' : 'n/a';
      const bestApy = opp.subnetBestApy != null ? (opp.subnetBestApy * 100).toFixed(2) + '%' : 'n/a';
      const validator = opp.validatorName ? `"${opp.validatorName}"` : `hotkey ${opp.hotkey.slice(0, 8)}…`;
      const liftPerYear = `+${opp.potentialLiftTaoPerYear.toFixed(3)}τ/yr`;
      // iter 192: surface subnet field shape (median + validator count) so the
      // model reads "best" as outlier-or-par against a typed field rather than
      // an absolute target. A 6pp gap to best reads differently when median is
      // 1pp below your APY (you're at par, best is outlier) vs 5pp above (you
      // are materially behind the field).
      const fieldStr =
        opp.subnetMedianApy != null && opp.subnetValidatorCount > 0
          ? ` [subnet field: median ${(opp.subnetMedianApy * 100).toFixed(2)}% across ${opp.subnetValidatorCount} validators]`
          : '';
      lines.push(
        `- sn${opp.netuid} ${opp.subnetName}: holding ${opp.alphaTokens.toFixed(2)} α on ${validator} @ ${currentApy} vs subnet best @ ${bestApy}${fieldStr} (${liftPerYear} potential lift).`,
      );
    }
    lines.push(
      'Read subnet best in context of the field shape: a 6pp gap to best on a 2-validator subnet (median ≈ best) is a real lift; the same gap on a 40-validator subnet where median sits 1pp below you means you are at par and "best" is an outlier on a tail epoch — the lift may not be sustainable through a re-delegation cycle.',
    );
  }
  lines.push('');

  // APY trend (computed) — operationalises iter 115 KB section
  // TIME_WINDOW_DIVERGENCE_PATTERNS. Same pattern as PnL decomposition above:
  // the KB tells the model how to read the 24h × 7d × 30d triple, this hands
  // it the read pre-computed so the model can't pick the most alarming window
  // and ignore the rest.
  const trend = report.apyTrend;
  if (trend?.available) {
    lines.push('## APY trend (computed)');
    lines.push(`Verdict: ${trend.verdict} — ${trend.verdictReason}`);
    const fmt = (v) => (v != null ? (v * 100).toFixed(2) + '%' : 'n/a');
    lines.push(
      `Weighted APY: 30d ${fmt(trend.windows.d30)} · 7d ${fmt(trend.windows.d7)} · 1d ${fmt(trend.windows.d1)}.`,
    );
    const gapStr = (g) =>
      g != null ? `${g >= 0 ? '+' : ''}${g.toFixed(2)}pp` : 'n/a';
    lines.push(
      `Gaps: 7d−30d ${gapStr(trend.gap_7_30_pp)} · 1d−7d ${gapStr(trend.gap_1_7_pp)} · 1d−30d ${gapStr(trend.gap_1_30_pp)}.`,
    );
    if (trend.annualLiftTaoIfSustained != null) {
      const sign = trend.annualLiftTaoIfSustained >= 0 ? '+' : '';
      lines.push(
        `If the ${trend.liftBaseWindow} APY were sustained vs the 30d baseline: ${sign}${trend.annualLiftTaoIfSustained.toFixed(2)}τ/yr at current portfolio size (${trend.taoBaseValue.toFixed(2)}τ staked).`,
      );
    }
    lines.push('Read the windows as a triple — do not trim on a 24h move that the 30d baseline contradicts, and do not extrapolate a 24h lift the 7d window hasn\'t confirmed.');
    lines.push('');
  }

  // Validator concentration (computed) — operationalises iter 116 KB section
  // VALIDATOR_HEURISTICS rule (g): single-validator concentration > 60% =
  // SPOF regardless of APY. Without this block the model had to scan the
  // re-delegation table and intuit distribution; it'd often miss that 4
  // separate positions all sit on the same hotkey.
  const vc = report.validatorConcentration;
  if (vc?.available) {
    lines.push('## Validator concentration (computed)');
    lines.push(`Verdict: ${vc.verdict} — ${vc.verdictReason}`);
    lines.push(
      `Distinct validator hotkeys: ${vc.distinctValidatorCount} · top-1 share ${(vc.top1Share * 100).toFixed(1)}% · top-3 share ${(vc.top3Share * 100).toFixed(1)}% · total staked TAO value ${vc.totalTaoBaseValue.toFixed(2)}τ.`,
    );
    if (Array.isArray(vc.top3) && vc.top3.length > 0) {
      lines.push('Top validators by share of staked TAO value:');
      for (const v of vc.top3) {
        const label = v.validatorName ? `"${v.validatorName}"` : `hotkey ${v.hotkey.slice(0, 8)}…`;
        const subnets = v.subnetCount === 1 ? '1 subnet' : `${v.subnetCount} subnets`;
        lines.push(
          `- ${label}: ${(v.share * 100).toFixed(1)}% (${v.taoValue.toFixed(2)}τ across ${subnets}).`,
        );
      }
    }
    lines.push('Treat validator concentration as an operational-risk axis separate from yield — a high-APY SPOF still loses to a slightly-lower-APY split book when the SPOF dereg-fails. If verdict is concentrated or worse, the right rec is SPLIT/MIGRATE to ≥3 distinct hotkeys, not "hold for the yield".');
    lines.push('');
  }

  // Drawdown verdict (computed) — operationalises iter 121 KB section
  // DRAWDOWN_HEURISTICS. Same 2-step pattern as PnL decomp (iter 117→118)
  // and APY trend (iter 115→119): KB tells the model how to READ the dd
  // signals as a pair (max vs current, depth AND duration), this hands the
  // verdict pre-computed so gpt-oss-20b can't either ignore the panel or
  // over-react to a routine 15-30% alpha cycle.
  const dv = report.drawdownVerdict;
  if (dv?.available) {
    lines.push('## Drawdown verdict (computed)');
    lines.push(`Verdict: ${dv.verdict} — ${dv.verdictReason}`);
    const maxStr = (dv.maxDrawdownPct * 100).toFixed(1) + '%';
    const curStr = (dv.currentDrawdownPct * 100).toFixed(1) + '%';
    const peakStr = dv.daysSincePeak != null ? `${dv.daysSincePeak}d` : 'n/a';
    const uwStr = dv.currentlyUnderwater
      ? `currently underwater (${dv.daysUnderwater ?? '?'}d)`
      : dv.recoveryDays != null
        ? `recovered in ${dv.recoveryDays}d`
        : 'not currently underwater';
    lines.push(
      `Max peak-to-trough: ${maxStr} · Current from ATH: ${curStr} · Days since peak: ${peakStr} · ${uwStr}.`,
    );
    // Iter 132 — distribution context for the live stretch. Hands the model
    // p50/p90/max underwater-run lengths from the 365d walk so it reads the
    // current stretch as shorter/typical/beyond the historical tail rather
    // than absolute duration in a vacuum. Mirrors the numeric-line pattern
    // from iter 118 (PnL decomp ratios) and iter 127 (emission alignment).
    if (dv.distAvailable) {
      const p50 = `${dv.ddDurationP50}d`;
      const p90 = `${dv.ddDurationP90}d`;
      const dmax = dv.ddDurationMax != null ? `${dv.ddDurationMax}d` : 'n/a';
      const n = dv.underwaterRunCount;
      lines.push(
        `Underwater-stretch distribution (365d): p50 ${p50} · p90 ${p90} · max ${dmax} across ${n} stretches.`,
      );
      if (dv.verdict === 'beyond_historical_tail') {
        lines.push(
          'Current stretch is past the p90 historical tail — this is the durability-signal escalation: even if depth has not cleared the 30%/30d flag_worthy gate, duration alone is now out-of-sample. Surface in Risk Flags as a durability concern, route response to concentration/sizing not yield.',
        );
      } else if (dv.verdict === 'within_typical_stretch') {
        lines.push(
          'Current stretch is at or below the p50 historical median — duration matches normal book behaviour, not a flag. Suppress alarm framing on this dip even if it visually looks deep; only escalate if depth or duration tips the other gates.',
        );
      }
    }
    if (dv.dataSanityFlag === 'negative_pnl_at_peak') {
      lines.push(
        'Data-sanity contradiction: window PnL is negative but the book is at all-time-high — likely a windowing mismatch (PnL window longer than snapshot history). Call this out instead of trying to reconcile narratively.',
      );
    }
    lines.push('Read max vs current as separate signals (worst-shock vs where-are-we-now). Drawdowns are price-driven — pair with the PnL decomposition verdict above. Response axis guard: never recommend yield/validator switches as a drawdown response, the drawdown didn\'t come from there; route to concentration or sizing instead.');
    lines.push('');
  }

  // Staking-flow verdict (computed) — operationalises iter 123 KB section
  // STAKING_FLOW_HEURISTICS. Same KB→§0 handoff pattern as 117→118 (PnL decomp)
  // and 121→122 (drawdown): KB tells the model how to READ the four flow
  // primitives (transferInTao, transferOutTao, transferCount, dailyIncomeTao),
  // this hands the seven-verdict classification + cadence + confirming/anti
  // pattern pre-computed so gpt-oss-20b can't ignore the flow data or anchor
  // on absolute τ rather than % of book.
  const sf = report.stakingFlowVerdict;
  if (sf?.available) {
    lines.push('## Staking-flow verdict (computed)');
    lines.push(`Verdict: ${sf.verdict} — ${sf.verdictReason}`);
    const netSign = sf.netTao >= 0 ? '+' : '';
    const netStr = `${netSign}${sf.netTao.toFixed(3)}τ (${(sf.netPctOfBook * 100).toFixed(1)}% of book)`;
    const inOut = `in ${sf.transferInTao.toFixed(3)}τ · out ${sf.transferOutTao.toFixed(3)}τ`;
    const cadenceStr = sf.cadence === 'none'
      ? 'no transfers'
      : `${sf.cadence} cadence (${sf.txnsPer30d.toFixed(1)} txns / 30d)`;
    lines.push(`Net flow: ${netStr} · ${inOut} · ${cadenceStr}.`);
    if (sf.dailyIncomeTao > 0) {
      const ratio = sf.transferInTao / sf.dailyIncomeTao;
      lines.push(
        `Flow-vs-income pair: transfersIn is ${ratio.toFixed(2)}× the ${sf.dailyIncomeTao.toFixed(3)}τ staking-income window — ${ratio < 1 ? 'self-funding (compounding does the work)' : ratio > 2 ? 'externally capitalising' : 'partially externally funded'}.`,
      );
    }
    if (sf.patternFlag) {
      const label = sf.patternIsAntiPattern ? 'Anti-pattern' : 'Confirming pattern';
      lines.push(`${label}: ${sf.patternFlag} — name this explicitly in Summary or Risk Flags (flow-direction × drawdown-state cross-product).`);
    }
    lines.push('Staking flow is a behavioural overlay — it does NOT change ground-truth PnL (already accounted for in the formula). Read it relative to current portfolio % and cadence over the window, not absolute τ. If verdict is hands_off or passive, do not manufacture a flow narrative; if verdict is rebalancing, frame as activity not direction. When the multi-window durability verdict is present (next block), read it as the LONG-ARC frame against which the single-window verdict is the RECENT slice — a 30d "accumulation" inside a 365d "sustained_distribution" is a recent reversal, not a confirmation, and the narrative must name that contrast rather than picking one window in isolation.');
    lines.push('');
  }

  // Iter 138 — multi-window net-flow comparison rendered as a STANDALONE block,
  // independent of sf.available. Iter 137 attached the multi-window fields inside
  // the sf.available gate, which hid them on Jai's primary 5Cnz1juP… coldkey where
  // pnlGroundTruth is FY-windowed (returns available:false when no transfers fall
  // inside the current FY) but the 365d raw tax-row scan still has years of data.
  // The single-window staking-flow read and the multi-window durability read are
  // independent signals; emit each based on its own availability flag so a wallet
  // with quiet FY-window-bound activity but rich 365d history still surfaces the
  // long-arc durability arc to the LLM.
  const mwnf = sf?.multiWindowNetFlow;
  const mwDur = sf?.multiWindowDurability;
  if (mwnf?.available && mwDur?.available) {
    lines.push('## Multi-window staking flow (computed)');
    const fmtRow = (p) => {
      const sign = p.netTao >= 0 ? '+' : '';
      return `${p.windowDays}d ${sign}${p.netTao.toFixed(1)}τ (${p.transferCount} txn${p.transferCount === 1 ? '' : 's'})`;
    };
    lines.push(`Net flow by window: ${mwnf.points.map(fmtRow).join(' · ')}.`);
    lines.push(`Durability verdict: ${mwDur.verdict} — ${mwDur.verdictReason}.`);
    if (!sf?.available) {
      lines.push('The single-window staking-flow verdict is unavailable for this wallet (no transfers inside the FY-bound pnlGroundTruth window). The multi-window durability read above is the ONLY behavioural-flow signal for this wallet — narrate it explicitly in Summary or Recommendations; do not fall back to "no flow data" when the long-arc read has material content.');
    } else {
      lines.push('Read the multi-window durability verdict as the LONG-ARC frame; the single-window staking-flow verdict above is the RECENT slice. If they disagree (30d positive inside a 365d sustained_distribution, or vice versa), name the reversal explicitly rather than picking one window in isolation.');
    }
    lines.push('');
  } else if (mwDur?.available && mwDur.verdict === 'dormant_harvest_only') {
    // Iter 139 — dormant wallet branch. mwnf has no rows to render but the
    // durability layer carries an explicit verdict naming the wallet's
    // strategy (root-staking, harvest-only). Render WITHOUT the numeric
    // net-flow line so the LLM doesn't hallucinate flow values; close with
    // a re-frame instruction so it doesn't confuse "no behavioural flow"
    // with "no signal" — the absence of flow IS the signal here.
    lines.push('## Multi-window staking flow (computed)');
    lines.push(`Durability verdict: ${mwDur.verdict} — ${mwDur.verdictReason}.`);
    lines.push('This wallet is pure root-staked harvest-only: zero transfer_in/transfer_out events in the trailing 365d window. Do NOT narrate this as "no signal" or "insufficient data" — the absence of behavioural-flow activity IS the read. Frame the Summary and Recommendations around validator/subnet selection and root-stake APY as the load-bearing levers; behavioural rebalancing is not a tool this wallet is using and not something to recommend as a missing dimension.');
    lines.push('');
  }

  // Emission alignment verdict (computed) — operationalises iter 126 KB section
  // EMISSION_ALIGNMENT_HEURISTICS. Same KB→§0 handoff pattern as 117→118,
  // 121→122, 123→124: surfacing of report.portfolio.emissionAlignment (added
  // iter 125) into §0 with the structural-risk read-rule rendered as a closing
  // instruction so gpt-oss-20b doesn't ignore the emission dimension or
  // misdiagnose the response axis as validator switching.
  const ea = report.portfolio?.emissionAlignment;
  if (ea?.available) {
    lines.push('## Emission alignment verdict (computed)');
    const verdictReason = (() => {
      if (ea.verdict === 'aligned_with_emission')
        return `${ea.highEmissionShare.toFixed(1)}% of book in subnets ≥ ${ea.highEmissionThresholdPct.toFixed(1)}% network emission (above the 1/128 ≈ 0.78% fair-share line)`;
      if (ea.verdict === 'starved_subnet_heavy')
        return `${ea.zeroEmissionShare.toFixed(1)}% of book in zero-emission subnets — structural earnings-power problem, not an allocation gap`;
      if (ea.verdict === 'partially_aligned')
        return `${ea.highEmissionShare.toFixed(1)}% in high-emission subnets, the rest mid-band`;
      return `${ea.highEmissionShare.toFixed(1)}% high-emission, ${ea.zeroEmissionShare.toFixed(1)}% zero-emission — neither aligned nor starved-heavy`;
    })();
    lines.push(`Verdict: ${ea.verdict} — ${verdictReason}.`);
    lines.push(
      `Weighted emission %: ${ea.weightedEmissionPct.toFixed(2)}% · high-emission share (≥${ea.highEmissionThresholdPct.toFixed(1)}%): ${ea.highEmissionShare.toFixed(1)}% · zero-emission share: ${ea.zeroEmissionShare.toFixed(1)}% · covered emission breadth: ${ea.coveredEmissionPct.toFixed(1)}%.`,
    );
    if (ea.weightedEmissionPct < 0.5) {
      lines.push(
        `Red flag: weightedEmissionPct ${ea.weightedEmissionPct.toFixed(2)}% < 0.5% — harvesting from dead subnets. Yield line will reflect this regardless of which hotkey validates; emission is the input.`,
      );
    }
    if (ea.mostOverweightLowEmission) {
      const mo = ea.mostOverweightLowEmission;
      lines.push(
        `TRIM anchor: sn${mo.netuid} ${mo.name} at ${mo.pctOfPortfolio.toFixed(1)}% of portfolio with only ${mo.emissionPct.toFixed(2)}% network emission — largest position with the weakest emission claim. Frame as "trim sn${mo.netuid} from ${mo.pctOfPortfolio.toFixed(1)}% toward ${Math.max(0, mo.pctOfPortfolio - 5).toFixed(0)}%" not generic "rebalance".`,
      );
    }
    lines.push(
      'Treat emission alignment as a SUBNET SELECTION problem, not a validator selection problem. Right responses on a starved-leaning verdict: TRIM the overweight low-emission position + REALLOCATE into emission-aligned Tier 1/Tier 2 subnets. Do NOT recommend validator re-delegation as a fix — switching hotkeys on a zero-emission subnet just moves a zero around. If a high-APY snapshot appears on a zero-emission subnet, treat it as a sampling artefact (stray-epoch emission or yield calc from prior weights), not a real opportunity. Structural-risk axis is separate from yield and concentration; if verdict is starved_subnet_heavy, this outranks partially_aligned mitigation paths.',
    );
    lines.push('');
  }

  // Per-position yield quartet (computed) — operationalises iter 128 KB section
  // VALIDATOR_YIELD_BREAKDOWN_HEURISTICS. Fifth KB→§0 handoff bridge in the
  // established cadence (117/118, 121/122, 123/124, 125/126/127, 128/129).
  // Surfaces the 1h × 1d × 7d × 30d quartet per top-tao position with the
  // four-state response label pre-classified (stray_epoch_ignored /
  // monitor_momentum / recommend_switch / avoid_and_exit), 7d annualised as
  // the planning APY, the explicit "compare 7d vs 30d; prefer improving"
  // framing, and a conditional EMISSION_CEILING note when the subnet's
  // emissionPct < 0.5% so the model reads suppressed yield as the input
  // problem (subnet selection), not the validator. Without this block
  // gpt-oss-20b sees only the iter 114 single-window APY per position and
  // misses stray-epoch noise vs durable edge — same failure mode VALIDATOR
  // _HEURISTICS rule 5 already gestures at, but extended to the four-window
  // shape.
  const yqv = (() => {
    const perPos = report.yield?.perPosition;
    if (!Array.isArray(perPos) || perPos.length === 0) return null;
    // Build emissionPct lookup keyed by netuid (one value per subnet).
    const emissionByNetuid = new Map();
    const allPositions = report.portfolio?.allPositions || [];
    for (const p of allPositions) {
      if (p?.netuid != null && p.emissionPct != null) {
        emissionByNetuid.set(p.netuid, p.emissionPct);
      }
    }
    // Score per (netuid, hotkey) holding by TAO base value; only rows with
    // at least apy7d AND apy30d populated and not subnet-median fallback are
    // candidates (we need both windows to read direction, and stray-epoch
    // gating requires authentic per-validator 1h/1d).
    const scored = perPos
      .filter((p) => !p.apyIsFallback && p.apy7d != null && p.apy30d != null)
      .map((p) => ({
        ...p,
        taoValue: (p.alphaTokens || 0) * (p.alphaPriceTao || 0),
        emissionPct: emissionByNetuid.get(p.netuid) ?? null,
      }))
      .filter((p) => p.taoValue > 0)
      .sort((a, b) => b.taoValue - a.taoValue)
      .slice(0, 5);
    if (scored.length === 0) return null;
    // Classify each row.
    const classifyDirection = (apy7d, apy30d) => {
      if (apy7d == null || apy30d == null) return null;
      if (apy30d <= 0) return null;
      const ratio = apy7d / apy30d;
      if (ratio >= 1.15) return 'momentum'; // 7d > 30d × 1.15 — read for cause
      if (ratio >= 1.0) return 'improving'; // 7d ≥ 30d — safe to plan on 7d
      if (ratio <= 0.85) return 'regressing'; // 7d < 30d × 0.85 — bleeding edge
      return 'stable'; // within ±15% band
    };
    const isStrayEpoch = (apyShort, apy7d, apy30d) => {
      if (apyShort == null || apy7d == null || apy30d == null) return false;
      if (apy7d <= 0 && apy30d <= 0) return false;
      const refMax = Math.max(apy7d, apy30d);
      const refMin = Math.min(apy7d, apy30d);
      // Stray if BOTH 7d and 30d disagree directionally with the short window.
      return (
        (apyShort > refMax * 2 && apyShort > refMin * 2) ||
        (apyShort > 0 && apyShort < refMax * 0.4 && apyShort < refMin * 0.4)
      );
    };
    const classifyVerdict = (row) => {
      const strayHr = isStrayEpoch(row.apy1h, row.apy7d, row.apy30d);
      const strayDay = isStrayEpoch(row.apy1d, row.apy7d, row.apy30d);
      const strayLabels = [];
      if (strayHr) strayLabels.push('1h');
      if (strayDay) strayLabels.push('1d');
      const direction = classifyDirection(row.apy7d, row.apy30d);
      // Material lift on the iter 116 thresholds: deltaToBest ≤ -0.05 (5pp+
      // behind subnet best) with > 0 τ/year potential lift.
      const liftTaoYr =
        row.deltaToBest != null && row.alphaTokens != null
          ? Math.abs(Math.min(row.deltaToBest, 0)) * row.alphaTokens
          : 0;
      const materialLift = liftTaoYr >= 0.05; // matches iter 116 "consider" threshold
      let verdict;
      if (direction === 'regressing') verdict = 'avoid_and_exit';
      else if (direction === 'improving' && materialLift)
        verdict = 'recommend_switch';
      else if (direction === 'improving') verdict = 'monitor_momentum';
      else if (direction === 'momentum') verdict = 'monitor_momentum';
      else if (direction === 'stable' && materialLift)
        verdict = 'recommend_switch';
      else verdict = 'monitor_momentum';
      return { verdict, direction, strayLabels, liftTaoYr, materialLift };
    };
    return { rows: scored, classify: classifyVerdict };
  })();
  if (yqv) {
    lines.push('## Per-position yield quartet (computed)');
    lines.push(
      'Top positions by TAO base value, each row read as a 1h × 1d × 7d × 30d quartet (not four numbers). 7d is the planning window, 30d the durability check; stray-epoch labels mark single-window artefacts to ignore.',
    );
    for (const row of yqv.rows) {
      const { verdict, direction, strayLabels, liftTaoYr, materialLift } = yqv.classify(row);
      const fmt = (v) => (v != null ? (v * 100).toFixed(2) + '%' : 'n/a');
      const validator = row.validatorName
        ? `"${row.validatorName}"`
        : `hotkey ${row.hotkey.slice(0, 8)}…`;
      lines.push(
        `- sn${row.netuid} ${row.subnetName} (${row.taoValue.toFixed(2)}τ on ${validator}): 1h ${fmt(row.apy1h)} · 1d ${fmt(row.apy1d)} · 7d ${fmt(row.apy7d)} · 30d ${fmt(row.apy30d)}.`,
      );
      const planApy = fmt(row.apy7d);
      const dirNote = direction
        ? direction === 'improving'
          ? '7d ≥ 30d (improving — safe to plan on 7d)'
          : direction === 'momentum'
            ? '7d > 30d × 1.15 (momentum — read for cause before assuming durability)'
            : direction === 'regressing'
              ? '7d < 30d × 0.85 (regressing — validator bleeding edge)'
              : '7d within ±15% of 30d (stable)'
        : 'direction n/a';
      const strayNote = strayLabels.length
        ? ` · stray-epoch on ${strayLabels.join(' + ')} (ignore those windows, anchor on 7d/30d)`
        : '';
      const liftNote = materialLift
        ? ` · re-delegation lift on 7d: +${liftTaoYr.toFixed(2)}τ/yr`
        : ' · no material re-delegation lift';
      // iter 192: surface subnet field shape (median + validator count) so the
      // model reads the row's APY position in the field, not just vs the best.
      const fieldNote =
        row.subnetMedianApy != null && row.subnetValidatorCount > 0
          ? ` · field median ${(row.subnetMedianApy * 100).toFixed(2)}% across ${row.subnetValidatorCount} val`
          : '';
      lines.push(
        `  Plan APY (7d): ${planApy} · ${dirNote}${strayNote}${liftNote}${fieldNote} · verdict: ${verdict}.`,
      );
      if (row.emissionPct != null && row.emissionPct < 0.5) {
        lines.push(
          `  EMISSION_CEILING: sn${row.netuid} emission ${row.emissionPct.toFixed(2)}% < 0.5% — the suppressed 7d/30d is the SUBNET ceiling, not the validator. Re-allocate (subnet selection), do NOT re-delegate (switching hotkeys on a sub-fair-share subnet just moves a zero around).`,
        );
      }
    }
    lines.push(
      'Read the quartet as one signal per row. Stray-epoch flags = informational only, never the basis for a recommendation. Use 7d to annualise lift in τ/yr; never 1h or 1d (they amplify epoch noise into fake lifts that the position then loses on the next epoch turn). When comparing validators at the same 7d level, prefer 7d ≥ 30d over 7d < 30d — a 7d=16% / 30d=15% improving validator structurally beats a 7d=16% / 30d=20% regressing one. recommend_switch verdicts feed Recommendations as MIGRATE actions with the τ/yr lift cited; avoid_and_exit verdicts feed Risk Flags as durability-concern lines; monitor_momentum verdicts do NOT fire a recommendation unless paired with another signal.',
    );
    lines.push('');
  }

  // Flags
  if (f.length > 0) {
    lines.push('## Existing rule-based flags');
    for (const flag of f) lines.push(`- [${flag.severity}] ${flag.message}`);
    lines.push('');
  }

  // Broader market
  if (b.topMovers24h?.length) {
    lines.push('## Broader market (top 24h movers across all subnets)');
    for (const m of b.topMovers24h.slice(0, 8)) {
      const pct = m.pct1d != null ? `${m.pct1d >= 0 ? '+' : ''}${m.pct1d.toFixed(2)}%` : 'n/a';
      lines.push(`- sn${m.netuid} ${m.name}: ${pct} 24h, volume ${m.volumeTao24h.toFixed(0)}τ`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Now write the four-section analyst report following the rules in your system prompt.');

  return lines.join('\n');
}

const REQUIRED_SECTIONS = ['Summary', 'What Changed', 'Recommendations', 'Risk Flags'];

// Conservative defaults appended when the model refuses a heading even after
// the retry. Wording is intentionally low-stakes — never invents data, always
// points the reader back to the deterministic tables below.
const DEFAULT_SECTION_TEXT = {
  Summary: 'See the structured data below for the current snapshot.',
  'What Changed': 'Refer to the 24h / 7d / 30d columns in the Portfolio and Broader Market tables below.',
  Recommendations: 'No actionable recommendations surfaced this pass. Monitor positions against the rule-based flags below.',
  'Risk Flags': 'No material risk flags surfaced by the analyst pass. The deterministic rule-based flags below still apply.',
};

// gpt-oss-20b (default provider) is stochastic — it ignores "always include
// section X" instructions ~20-25% of the time, most often dropping Risk Flags.
// Find any required headings the model omitted so we can prompt for a retry.
export function validateSections(text) {
  if (!text) return REQUIRED_SECTIONS.slice();
  // Match "## Heading" lines case-insensitively, tolerate "##Heading" without space.
  const headings = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*##\s*(.+?)\s*$/);
    if (m) headings.add(m[1].toLowerCase());
  }
  return REQUIRED_SECTIONS.filter((s) => !headings.has(s.toLowerCase()));
}

// Append canonical fallback text for any heading the model still refuses after
// the retry pass. Preserves the model's prose for the sections it did emit and
// patches the gap so the four-section contract holds at the UI layer.
export function patchMissingSections(text, missing) {
  if (!missing || missing.length === 0) return text;
  const ordered = REQUIRED_SECTIONS.filter((s) => missing.includes(s));
  const patched = (text || '').replace(/\s+$/, '');
  const appended = ordered
    .map((s) => `## ${s}\n${DEFAULT_SECTION_TEXT[s]}`)
    .join('\n\n');
  return patched ? `${patched}\n\n${appended}` : appended;
}

// Iter 135 — deterministic verdict fallback for the §0 error card. When the
// Pollinations narrative pass fails (iter 134 catches the silent-vanish), we
// still want users to see the iter 117-132 verdict tree outputs in degraded
// form so the KB→§0 bridges aren't invisible. Each entry is { key, label,
// verdict, interpretation } — label is the user-facing section name,
// interpretation lifts each verdict's verdictReason verbatim where present
// (KB-anchored single-line summary), or a tight derivation for the emission
// alignment block which doesn't carry verdictReason on the portfolio side.
// Empty array on report that has no available verdicts (e.g. brand-new
// coldkey with no history) — caller skips the list.
export function buildVerdictFallback(report) {
  if (!report) return [];
  const out = [];
  const push = (key, label, v, interpretation) => {
    if (!v || !v.available || !v.verdict) return;
    out.push({
      key,
      label,
      verdict: v.verdict,
      interpretation: interpretation || v.verdictReason || null,
    });
  };
  push('pnl', 'PnL composition', report.pnlDecomp);
  push('apyTrend', 'APY trend', report.apyTrend);
  push('valConc', 'Validator concentration', report.validatorConcentration);
  push('drawdown', 'Drawdown', report.drawdownVerdict);
  push('stakingFlow', 'Staking flow', report.stakingFlowVerdict);
  // Iter 137 — multi-window durability rides as a SEPARATE fallback row when
  // present, so the §0 error card surfaces the long-arc read alongside the
  // single-window staking-flow verdict instead of collapsing them into one
  // line. Gated on the verdict computing (i.e. staking-flow had data AND
  // multi-window net flow had ≥1 transfer in 365d).
  const mwDur = report.stakingFlowVerdict?.multiWindowDurability;
  if (mwDur?.available && mwDur.verdict) {
    out.push({
      key: 'stakingFlowDurability',
      label: 'Staking flow durability',
      verdict: mwDur.verdict,
      interpretation: mwDur.verdictReason || null,
    });
  }
  // Iter 140 — multi-window price-momentum quartet on the §2 PNL block.
  // Pairs with the iter 137 multi-window staking-flow durability row above:
  // that row reads the BEHAVIOURAL axis (transfer flow direction across
  // 30d/90d/180d/365d), this one reads the PRICE axis (alpha-weighted
  // portfolio % across 1h/1d/7d/30d). Verdict states: sustained_uptrend,
  // sustained_downtrend, recent_reversal_to_up, recent_reversal_to_down,
  // chop, flat. Derived from the 1d/7d/30d trio with 1h shown as detail.
  const mwpm = report.pnl?.multiWindowPriceMomentum;
  if (mwpm?.available && mwpm?.verdict) {
    out.push({
      key: 'priceMomentum',
      label: 'Price momentum (1h / 1d / 7d / 30d)',
      verdict: mwpm.verdict,
      interpretation: mwpm.verdictReason || null,
    });
  }
  // Iter 142 — Drive-sheet PnL parity. The Bittensor portfolio tracker
  // sheet (Drive 10Nl8u…) uses transfer-based PnL formulas (accumulation
  // = Σsell + current − Σbuy, harvest = current − (in − out)). The app's
  // headline `profitTao` subtracts a window starting balance which the
  // sheet doesn't. Surfaces the divergence + which sheet formula matches
  // this wallet's transfer pattern so §0 names the discrepancy when it
  // materially affects the headline number.
  const pp = report.pnlGroundTruth?.pnlFormulaParity;
  if (pp?.available && pp?.verdict) {
    out.push({
      key: 'pnlFormulaParity',
      label: 'PnL formula (Drive sheet parity)',
      verdict: pp.verdict,
      interpretation: pp.verdictReason || null,
    });
  }
  const ea = report.portfolio?.emissionAlignment;
  if (ea?.available && ea?.verdict) {
    let interp;
    if (ea.verdict === 'aligned_with_emission')
      interp = `${(ea.highEmissionShare ?? 0).toFixed(0)}% of book in fair-share+ subnets (≥${(ea.highEmissionThresholdPct ?? 1).toFixed(1)}% emission) — yield-aligned posture`;
    else if (ea.verdict === 'starved_subnet_heavy')
      interp = `${(ea.zeroEmissionShare ?? 0).toFixed(0)}% of book in zero-emission subnets — re-allocation candidate, not a validator-switching problem`;
    else if (ea.verdict === 'partially_aligned')
      interp = `${(ea.highEmissionShare ?? 0).toFixed(0)}% in fair-share+ subnets with mixed remainder — yield ceilings vary by position`;
    else
      interp = `${(ea.highEmissionShare ?? 0).toFixed(0)}% fair-share+ / ${(ea.zeroEmissionShare ?? 0).toFixed(0)}% starved — mixed exposure, neither aligned nor structurally bleeding`;
    out.push({ key: 'emissionAlignment', label: 'Emission alignment', verdict: ea.verdict, interpretation: interp });
  }
  return out;
}

export async function buildInsights(report, opts = {}) {
  if (!opts.force) {
    const cached = peekCachedInsights(report.coldkey);
    if (cached) return cached;
  }

  const verdictFallback = buildVerdictFallback(report);
  const user = buildUserPrompt(report);
  let result = await chat({ system: SYSTEM_PROMPT, user, maxTokens: 1500 });
  let missing = result.text ? validateSections(result.text) : REQUIRED_SECTIONS.slice();
  let retried = false;

  // One re-prompt on miss. Don't burn the function budget on a second retry —
  // soft-fail with partial narrative if the model still won't comply.
  if (result.text && missing.length > 0) {
    retried = true;
    const retryUser =
      user +
      '\n\n---\n\nYour previous response omitted the following required sections: ' +
      missing.map((s) => `## ${s}`).join(', ') +
      '. Please regenerate the FULL response with EXACTLY four ## headings in this order: ## Summary, ## What Changed, ## Recommendations, ## Risk Flags. If a section has nothing material to say, write a one-line acknowledgement (e.g. "No material risk flags.") — do NOT skip the heading.';
    const retryResult = await chat({
      system: SYSTEM_PROMPT,
      user: retryUser,
      maxTokens: 1500,
    });
    if (retryResult.text) {
      const retryMissing = validateSections(retryResult.text);
      // Only swap in the retry if it's at least as good as the first response.
      if (retryMissing.length <= missing.length) {
        result = retryResult;
        missing = retryMissing;
      }
    }
    if (missing.length > 0) {
      console.warn(
        'ai-insights: still missing sections after retry:',
        missing.join(', '),
      );
    }
  }

  // Deterministic safety net: if the model still refused any required heading
  // after the retry, splice in canonical fallback text so the four-section
  // contract holds at the UI/email layer. The model's emitted prose is left
  // untouched; only the missing slots are filled.
  let patched = false;
  let finalText = result.text;
  let finalMissing = missing;
  if (result.text && missing.length > 0) {
    const patchedText = patchMissingSections(result.text, missing);
    const afterPatch = validateSections(patchedText);
    if (afterPatch.length < missing.length) {
      finalText = patchedText;
      finalMissing = afterPatch;
      patched = true;
    }
  }

  const payload = {
    available: !!finalText,
    text: finalText,
    error: result.error,
    provider: result.provider,
    model: result.model,
    durationMs: result.durationMs,
    triedProviders: result.triedProviders,
    generatedAt: new Date().toISOString(),
    validation: {
      requiredSections: REQUIRED_SECTIONS.length,
      present: REQUIRED_SECTIONS.length - finalMissing.length,
      missing: finalMissing,
      retried,
      patched,
    },
    // Iter 135 — attached unconditionally so the §0 error card can render the
    // deterministic verdict tree when the LLM is down (iter 117-132 outputs
    // stay visible). Also rides along on successful payloads — cheap to carry
    // and harmless on the happy path where the narrative supersedes it.
    verdictFallback,
  };

  if (payload.available) {
    insightsCache.set(report.coldkey, { at: Date.now(), data: payload });
    if (insightsCache.size > 100) {
      const firstKey = insightsCache.keys().next().value;
      insightsCache.delete(firstKey);
    }
  }

  return payload;
}
