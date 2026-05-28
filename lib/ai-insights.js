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
  lines.push(`24h: ${fmtTao(pn.change24hTao, 3)} · 7d: ${fmtTao(pn.change7dTao, 3)} · 30d: ${fmtTao(pn.change30dTao, 3)}`);
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
      lines.push(
        `- sn${opp.netuid} ${opp.subnetName}: holding ${opp.alphaTokens.toFixed(2)} α on ${validator} @ ${currentApy} vs subnet best @ ${bestApy} (${liftPerYear} potential lift).`,
      );
    }
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
    lines.push('Staking flow is a behavioural overlay — it does NOT change ground-truth PnL (already accounted for in the formula). Read it relative to current portfolio % and cadence over the window, not absolute τ. If verdict is hands_off or passive, do not manufacture a flow narrative; if verdict is rebalancing, frame as activity not direction.');
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

export async function buildInsights(report, opts = {}) {
  if (!opts.force) {
    const cached = peekCachedInsights(report.coldkey);
    if (cached) return cached;
  }

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
