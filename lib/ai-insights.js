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
- If the data is sparse (missing PnL, < 3 positions), acknowledge briefly and focus on what IS there.`;

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

  // PnL ground truth
  if (gt?.available) {
    lines.push('## PnL (ground truth, Taostats tax-report formula)');
    lines.push(`Profit: ${fmtTao(gt.profitTao, 3)} (${fmtPct(gt.returnPct, 2)}) over last ${gt.windowDays} days.`);
    lines.push(`Window: ${gt.firstSnapshotDate} → ${gt.lastSnapshotDate}`);
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
  lines.push('');

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

export async function buildInsights(report) {
  const cached = peekCachedInsights(report.coldkey);
  if (cached) return cached;

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

  const payload = {
    available: !!result.text,
    text: result.text,
    error: result.error,
    provider: result.provider,
    model: result.model,
    durationMs: result.durationMs,
    triedProviders: result.triedProviders,
    generatedAt: new Date().toISOString(),
    validation: {
      requiredSections: REQUIRED_SECTIONS.length,
      present: REQUIRED_SECTIONS.length - missing.length,
      missing,
      retried,
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
