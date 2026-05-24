// Render a buildReport() result as an HTML email body (and plain-text fallback).
// Mirrors the on-site PnL headline format so subscribers see the same numbers
// they paid for.

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function sign(n) {
  return n >= 0 ? '+' : '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inline-style markdown→HTML renderer for the email body. Email clients
// strip <style>, so every element carries inline CSS. Mirrors the markdown
// dialect produced by lib/ai-insights.js: ## headings, - and 1. lists,
// **bold**, `code`, paragraphs separated by blank lines.
function mdToEmailHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p style="margin:0 0 12px;color:#eef0f4;font-size:14px;line-height:1.55;">${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.type;
    const items = list.items
      .map((it) => `<li style="margin:0 0 6px;color:#eef0f4;font-size:14px;line-height:1.55;">${renderInline(it)}</li>`)
      .join('');
    blocks.push(`<${tag} style="margin:0 0 14px 22px;padding:0;">${items}</${tag}>`);
    list = null;
  };
  function renderInline(s) {
    return escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#eef0f4;">$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#131720;padding:1px 5px;border-radius:4px;">$1</code>');
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push(`<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#f9a826;margin:18px 0 8px;">${renderInline(line.slice(3))}</h3>`);
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      flushList();
      blocks.push(`<h4 style="font-size:14px;font-weight:600;color:#eef0f4;margin:14px 0 6px;">${renderInline(line.slice(4))}</h4>`);
      continue;
    }
    const ol = line.match(/^(\d+)\.\s+(.+)$/);
    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ol) {
      flushPara();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ol[2]);
      continue;
    }
    if (ul) {
      flushPara();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks.join('\n');
}

export function renderEmail(report, insights) {
  const { coldkey, taoPriceUsd, usdAud, portfolio, pnlGroundTruth: gt, broader } = report;

  const gtBlock = gt?.available
    ? `
    <div style="background:#0b0e14;border:1px solid #232936;border-radius:10px;padding:20px;margin-bottom:20px;">
      <div style="font-size:32px;font-weight:700;color:${gt.profitTao >= 0 ? '#4ade80' : '#f87171'};line-height:1.1;">
        ${sign(gt.profitTao)}${fmt(gt.profitTao, 3)} τ
        <span style="font-size:20px;font-weight:500;opacity:0.85;">
          (${sign(gt.returnPct)}${fmt(gt.returnPct * 100, 2)}%)
        </span>
      </div>
      <div style="font-size:16px;margin-top:6px;color:#eef0f4;">
        ≈ ${sign(gt.profitUsd)}$${fmt(gt.profitUsd, 2)} USD · ${sign(gt.profitAud)}A$${fmt(gt.profitAud, 2)}
      </div>
      <div style="font-size:12px;color:#8a93a3;margin-top:8px;text-transform:uppercase;letter-spacing:0.05em;">
        Over last ${gt.windowDays} days (${gt.firstSnapshotDate} → ${gt.lastSnapshotDate})
      </div>
      <table style="margin-top:14px;font-size:13px;color:#eef0f4;">
        <tr><td style="padding:2px 12px 2px 0;color:#8a93a3;">Starting balance</td><td>${fmt(gt.startingBalanceTao, 6)} τ</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#8a93a3;">Transfers in</td><td>${fmt(gt.transferInTao, 6)} τ</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#8a93a3;">Transfers out</td><td>${fmt(gt.transferOutTao, 6)} τ</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#8a93a3;">Current portfolio</td><td>${fmt(gt.currentPortfolioTao, 6)} τ</td></tr>
        ${gt.dailyIncomeTao > 0 ? `<tr><td style="padding:2px 12px 2px 0;color:#8a93a3;">Staking income</td><td style="color:#4ade80;">${fmt(gt.dailyIncomeTao, 4)} τ ($${fmt(gt.dailyIncomeUsd, 2)})</td></tr>` : ''}
      </table>
    </div>`
    : `<p style="color:#8a93a3;font-style:italic;">Ground-truth PnL unavailable this week — switching back to alpha-position estimate.</p>`;

  const topPositions = (portfolio?.top10 || []).slice(0, 5);
  const topBlock = topPositions.length
    ? `
    <h3 style="font-size:16px;margin:20px 0 10px;color:#eef0f4;">Top 5 positions</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#eef0f4;">
      <tr style="color:#8a93a3;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
        <th align="left" style="padding:6px;border-bottom:1px solid #232936;">Subnet</th>
        <th align="right" style="padding:6px;border-bottom:1px solid #232936;">Value (τ)</th>
        <th align="right" style="padding:6px;border-bottom:1px solid #232936;">% port</th>
        <th align="right" style="padding:6px;border-bottom:1px solid #232936;">7d</th>
      </tr>
      ${topPositions
        .map(
          (p) => `
        <tr>
          <td style="padding:6px;border-bottom:1px solid #232936;">${p.name} (sn${p.netuid})</td>
          <td align="right" style="padding:6px;border-bottom:1px solid #232936;">${fmt(p.taoValue, 3)}</td>
          <td align="right" style="padding:6px;border-bottom:1px solid #232936;">${fmt(p.pctOfPortfolio, 1)}%</td>
          <td align="right" style="padding:6px;border-bottom:1px solid #232936;color:${p.pct7d == null ? '#8a93a3' : p.pct7d >= 0 ? '#4ade80' : '#f87171'};">${p.pct7d == null ? '—' : `${sign(p.pct7d)}${fmt(p.pct7d, 1)}%`}</td>
        </tr>`
        )
        .join('')}
    </table>`
    : '';

  const movers = (broader?.topMovers24h || []).slice(0, 3);
  const moversBlock = movers.length
    ? `
    <h3 style="font-size:16px;margin:20px 0 10px;color:#eef0f4;">Network-wide top movers (24h)</h3>
    <ul style="color:#eef0f4;font-size:13px;padding-left:20px;">
      ${movers
        .map(
          (m) =>
            `<li>${m.name} (sn${m.netuid}): <span style="color:${m.pct1d >= 0 ? '#4ade80' : '#f87171'};">${sign(m.pct1d)}${fmt(m.pct1d, 1)}%</span></li>`
        )
        .join('')}
    </ul>`
    : '';

  const aiBlock =
    insights?.available && insights?.text
      ? `
    <div style="background:linear-gradient(180deg,rgba(249,168,38,0.06),transparent 60%),#131720;border:1px solid rgba(249,168,38,0.32);border-radius:10px;padding:20px 22px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;margin-bottom:6px;">
        <span style="font-size:18px;font-weight:700;color:#eef0f4;">AI Insights</span>
        <span style="margin-left:10px;padding:2px 8px;border-radius:999px;background:rgba(249,168,38,0.14);color:#f9a826;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">beta</span>
      </div>
      ${mdToEmailHtml(insights.text)}
      <div style="margin-top:14px;border-top:1px solid #232936;padding-top:10px;font-size:11px;color:#8a93a3;">
        Generated by ${escapeHtml(insights.model || 'llm')} via ${escapeHtml(insights.provider || 'provider')} — personalised summary of the deterministic data below.
      </div>
    </div>`
      : '';

  const html = `<!doctype html>
<html><body style="margin:0;background:#0b0e14;color:#eef0f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:24px;letter-spacing:-0.02em;margin-bottom:8px;">Your weekly Tao Wallet Report</h1>
    <p style="color:#8a93a3;font-size:13px;margin-bottom:24px;">
      Coldkey <code style="font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#131720;padding:2px 6px;border-radius:4px;">${coldkey}</code><br>
      TAO price $${fmt(taoPriceUsd, 2)} · USD/AUD ${fmt(usdAud, 4)} · Generated ${new Date(report.generatedAt).toUTCString()}
    </p>

    ${aiBlock}

    <h2 style="font-size:18px;margin:0 0 12px;">PnL (last 365 days)</h2>
    ${gtBlock}

    ${topBlock}
    ${moversBlock}

    <p style="margin-top:32px;font-size:12px;color:#8a93a3;border-top:1px solid #232936;padding-top:16px;">
      View the full live report at
      <a href="https://tao-wallet-report.vercel.app" style="color:#f9a826;">tao-wallet-report.vercel.app</a>.
      Subscription is active until ${new Date(report.subscriberExpiresAt || Date.now()).toUTCString()}.
      Not financial advice — data-driven flags only.
    </p>
  </div>
</body></html>`;

  const aiTextBlock =
    insights?.available && insights?.text
      ? [`=== AI INSIGHTS (${insights.model || 'llm'} via ${insights.provider || 'provider'}) ===`, '', insights.text, '', '=== DATA BELOW ===', ''].join('\n')
      : '';

  const text = [
    `Your weekly Tao Wallet Report`,
    `Coldkey: ${coldkey}`,
    `TAO $${fmt(taoPriceUsd, 2)} · USD/AUD ${fmt(usdAud, 4)}`,
    ``,
    aiTextBlock,
    gt?.available
      ? [
          `PnL (last ${gt.windowDays} days): ${sign(gt.profitTao)}${fmt(gt.profitTao, 3)} τ (${sign(gt.returnPct)}${fmt(gt.returnPct * 100, 2)}%)`,
          `≈ ${sign(gt.profitUsd)}$${fmt(gt.profitUsd, 2)} USD · ${sign(gt.profitAud)}A$${fmt(gt.profitAud, 2)}`,
          `Starting: ${fmt(gt.startingBalanceTao, 6)} τ · Current: ${fmt(gt.currentPortfolioTao, 6)} τ`,
          `Transfers in: ${fmt(gt.transferInTao, 6)} τ · out: ${fmt(gt.transferOutTao, 6)} τ`,
        ].join('\n')
      : `PnL unavailable.`,
    ``,
    topPositions.length
      ? `Top positions: ${topPositions.map((p) => `${p.name} (${fmt(p.taoValue, 2)}τ)`).join(', ')}`
      : '',
    ``,
    `Full report: https://tao-wallet-report.vercel.app`,
  ].join('\n');

  return { html, text };
}
