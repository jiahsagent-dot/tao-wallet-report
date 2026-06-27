'use client';

import { useState, useCallback } from 'react';
import AIInsights from './AIInsights.jsx';
import SubnetLink, { buildSubnetLookup } from './SubnetLink.jsx';

const fmt = (n, d = 2) =>
  n == null || !isFinite(n)
    ? '—'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

const fmtPct = (n, d = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${fmt(n, d)}%`);

function cls(n) {
  if (n == null) return '';
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}

// Heatmap background scaled by cell value's share of the column max. The 0.6
// exponent compresses the curve so smaller values still pick up visible tint
// — without it, only the top 2-3 rows look heated and the rest read as 0.
function heatBg(value, max, rgb) {
  if (value == null || !isFinite(value) || !max) return undefined;
  const ratio = Math.max(0, Math.min(1, Math.abs(value) / max));
  if (ratio < 0.02) return undefined;
  const alpha = Math.pow(ratio, 0.6) * 0.32;
  return { backgroundColor: `rgba(${rgb}, ${alpha.toFixed(3)})` };
}

const HEAT_ORANGE = '255, 140, 60';
const HEAT_GREEN = '74, 222, 128';
const HEAT_RED = '248, 113, 113';

// Build 1–3 glance-readable "Δ vs last week" chips from existing report data.
// Soft-omits chips whose underlying field is null/zero/non-finite, and returns
// [] when nothing is computable so the strip renders nothing rather than empty.
function computeDeltaChips(data) {
  const chips = [];
  const c7t = data?.pnl?.change7dTao;
  if (c7t != null && isFinite(c7t) && Math.abs(c7t) >= 0.001) {
    chips.push({
      key: 'pnl-7d',
      label: 'Δ 7d',
      arrow: c7t > 0 ? '↑' : '↓',
      value: `${c7t > 0 ? '+' : ''}${fmt(c7t, 2)} τ`,
      hint: 'price action on current positions',
      tone: c7t > 0 ? 'up' : 'down',
    });
  }
  const top10 = data?.portfolio?.top10 || [];
  const movers = top10
    .filter((p) => p.pct7d != null && isFinite(p.pct7d))
    .slice()
    .sort((a, b) => Math.abs(b.pct7d) - Math.abs(a.pct7d));
  if (movers.length && Math.abs(movers[0].pct7d) >= 0.5) {
    const m = movers[0];
    chips.push({
      key: 'top-mover-7d',
      label: 'Top mover 7d',
      arrow: m.pct7d > 0 ? '↑' : '↓',
      value: `SN${m.netuid} ${m.pct7d > 0 ? '+' : ''}${fmt(m.pct7d, 1)}%`,
      hint: m.name,
      tone: m.pct7d > 0 ? 'up' : 'down',
    });
  }
  const c30t = data?.pnl?.change30dTao;
  if (c30t != null && isFinite(c30t) && Math.abs(c30t) >= 0.001) {
    chips.push({
      key: 'pnl-30d',
      label: 'Δ 30d',
      arrow: c30t > 0 ? '↑' : '↓',
      value: `${c30t > 0 ? '+' : ''}${fmt(c30t, 2)} τ`,
      hint: '30-day price trajectory',
      tone: c30t > 0 ? 'up' : 'down',
    });
  }
  return chips;
}

function DeltaStrip({ data }) {
  const chips = computeDeltaChips(data);
  if (chips.length === 0) return null;
  return (
    <div className="delta-strip" aria-label="Period changes vs prior week">
      {chips.map((c) => (
        <span key={c.key} className={`delta-chip ${c.tone}`}>
          <span className="delta-arrow" aria-hidden="true">{c.arrow}</span>
          <span className="delta-lbl">{c.label}</span>
          <strong className="delta-val">{c.value}</strong>
          {c.hint && <span className="delta-hint">{c.hint}</span>}
        </span>
      ))}
    </div>
  );
}

// CSV escape: quote any field containing comma, quote, CR, or LF; double internal quotes.
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildPortfolioCsv(top10) {
  const header = ['#', 'Subnet', 'Netuid', 'Alpha held', 'Alpha price (TAO)', 'Value (TAO)', 'Pct portfolio', '24h pct', '7d pct'];
  const lines = [header.map(csvEscape).join(',')];
  top10.forEach((pos, i) => {
    lines.push([
      i + 1,
      pos.name ?? `Subnet ${pos.netuid}`,
      pos.netuid,
      pos.alphaHeld != null ? Number(pos.alphaHeld).toFixed(6) : '',
      pos.alphaPriceTao != null ? Number(pos.alphaPriceTao).toFixed(8) : '',
      pos.taoValue != null ? Number(pos.taoValue).toFixed(6) : '',
      pos.pctOfPortfolio != null ? Number(pos.pctOfPortfolio).toFixed(2) : '',
      pos.pct1d != null ? Number(pos.pct1d).toFixed(2) : '',
      pos.pct7d != null ? Number(pos.pct7d).toFixed(2) : '',
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

// Broader-market CSV: two stacked sections (movers, then volume) in one file
// so a single paste gives the spreadsheet user both views without juggling
// two clipboards. pct7d isn't in the source rows (Taostats screener gives
// 1d only here) so we surface Volume instead.
function buildBroaderMarketCsv(broader) {
  const movers = (broader && broader.topMovers24h) || [];
  const movers7d = (broader && broader.topMovers7d) || [];
  const volume = (broader && broader.topByVolume24h) || [];
  const cols = ['#', 'Subnet', 'Netuid', 'Price (TAO)', '24h pct', 'Volume (TAO)'];
  const cols7d = ['#', 'Subnet', 'Netuid', 'Price (TAO)', '7d pct', '24h pct', 'Volume (TAO)'];
  const lines = [];
  lines.push(['Top movers 24h'].map(csvEscape).join(','));
  lines.push(cols.map(csvEscape).join(','));
  movers.forEach((m, i) => {
    lines.push([
      i + 1,
      m.name ?? `Subnet ${m.netuid}`,
      m.netuid,
      m.priceTao != null ? Number(m.priceTao).toFixed(8) : '',
      m.pct1d != null ? Number(m.pct1d).toFixed(2) : '',
      m.volumeTao24h != null ? Number(m.volumeTao24h).toFixed(2) : '',
    ].map(csvEscape).join(','));
  });
  lines.push('');
  lines.push(['Top movers 7d'].map(csvEscape).join(','));
  lines.push(cols7d.map(csvEscape).join(','));
  movers7d.forEach((m, i) => {
    lines.push([
      i + 1,
      m.name ?? `Subnet ${m.netuid}`,
      m.netuid,
      m.priceTao != null ? Number(m.priceTao).toFixed(8) : '',
      m.pct7d != null ? Number(m.pct7d).toFixed(2) : '',
      m.pct1d != null ? Number(m.pct1d).toFixed(2) : '',
      m.volumeTao24h != null ? Number(m.volumeTao24h).toFixed(2) : '',
    ].map(csvEscape).join(','));
  });
  lines.push('');
  lines.push(['Top by volume 24h'].map(csvEscape).join(','));
  lines.push(cols.map(csvEscape).join(','));
  volume.forEach((v, i) => {
    lines.push([
      i + 1,
      v.name ?? `Subnet ${v.netuid}`,
      v.netuid,
      v.priceTao != null ? Number(v.priceTao).toFixed(8) : '',
      v.pct1d != null ? Number(v.pct1d).toFixed(2) : '',
      v.volumeTao24h != null ? Number(v.volumeTao24h).toFixed(2) : '',
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

function buildYieldCsv(perPosition) {
  const header = ['Netuid', 'Subnet', 'Validator', 'Hotkey', 'Alpha held', 'APY %', 'APY is fallback', 'Subnet best APY %', 'Δ to best (pp)', 'Subnet validator count'];
  const lines = [header.map(csvEscape).join(',')];
  perPosition
    .slice()
    .sort((a, b) => (b.alphaTokens || 0) - (a.alphaTokens || 0))
    .forEach((p) => {
      lines.push([
        p.netuid,
        p.subnetName || `Subnet ${p.netuid}`,
        p.validatorName || '',
        p.hotkey || '',
        p.alphaTokens != null ? Number(p.alphaTokens).toFixed(6) : '',
        p.apy != null ? (Number(p.apy) * 100).toFixed(4) : '',
        p.apyIsFallback ? 'true' : 'false',
        p.subnetBestApy != null ? (Number(p.subnetBestApy) * 100).toFixed(4) : '',
        p.deltaToBest != null ? (Number(p.deltaToBest) * 100).toFixed(4) : '',
        p.subnetValidatorCount != null ? p.subnetValidatorCount : '',
      ].map(csvEscape).join(','));
    });
  return lines.join('\r\n') + '\r\n';
}

// §4 PnL attribution CSV — full per-subnet table including the new 7d
// price-trend chip data. All rows, not just the on-screen top-5/bottom-3,
// so the spreadsheet user gets the complete picture for sort/filter.
function buildPnlAttribCsv(perSubnet) {
  const header = [
    'Netuid', 'Subnet', 'α value now (τ)', 'Spent (τ)', 'Sold (τ)', 'PnL (τ)', '7d α price %',
  ];
  const lines = [header.map(csvEscape).join(',')];
  perSubnet
    .slice()
    .sort((a, b) => (b.pnlTao || 0) - (a.pnlTao || 0))
    .forEach((s) => {
      lines.push([
        s.netuid,
        s.name || `Subnet ${s.netuid}`,
        s.currentTao != null ? Number(s.currentTao).toFixed(6) : '',
        s.spentTao != null ? Number(s.spentTao).toFixed(6) : '',
        s.soldTao != null ? Number(s.soldTao).toFixed(6) : '',
        s.pnlTao != null ? Number(s.pnlTao).toFixed(6) : '',
        s.pct7d != null ? Number(s.pct7d).toFixed(2) : '',
      ].map(csvEscape).join(','));
    });
  return lines.join('\r\n') + '\r\n';
}

function buildTaxYearCsv(buckets) {
  const header = ['FY', 'Window', 'Start bal (τ)', 'End bal (τ)', 'In (τ)', 'Out (τ)', 'PnL τ', 'Return %', 'A$'];
  const lines = [header.map(csvEscape).join(',')];
  buckets.forEach((b) => {
    lines.push([
      b.isCurrentFy ? `${b.label} (in progress)` : b.label,
      `${b.startDate} → ${b.endDate}`,
      b.startBalanceTao != null ? Number(b.startBalanceTao).toFixed(6) : '',
      b.endBalanceTao != null ? Number(b.endBalanceTao).toFixed(6) : '',
      b.transferInTao != null ? Number(b.transferInTao).toFixed(6) : '',
      b.transferOutTao != null ? Number(b.transferOutTao).toFixed(6) : '',
      b.profitTao != null ? Number(b.profitTao).toFixed(6) : '',
      b.returnPct != null ? (Number(b.returnPct) * 100).toFixed(4) : '',
      b.profitAud != null ? Number(b.profitAud).toFixed(2) : '',
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

function buildDrawdownCsv(dd) {
  const header = ['Date', 'Balance τ', 'Running peak τ', 'Drawdown τ', 'Drawdown %'];
  const lines = [header.map(csvEscape).join(',')];
  (dd.series || []).forEach((p) => {
    lines.push([
      p.date,
      Number(p.balanceTao).toFixed(6),
      Number(p.runningPeakTao).toFixed(6),
      Number(p.drawdownTao).toFixed(6),
      (Number(p.drawdownPct) * 100).toFixed(4),
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

function CopyCsvButton({ rows, getCsv, coldkey, filenamePrefix = 'portfolio', ariaLabel = 'Copy as CSV' }) {
  const [state, setState] = useState('idle'); // idle | copied | error
  const onClick = useCallback(async () => {
    const csv = getCsv ? getCsv() : buildPortfolioCsv(rows);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(csv);
        setState('copied');
        setTimeout(() => setState('idle'), 1500);
        return;
      }
      throw new Error('no-clipboard-api');
    } catch {
      // Manual-select fallback: drop into a hidden textarea, select, leave it to user.
      try {
        const ta = document.createElement('textarea');
        ta.value = csv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        setState('copied');
        setTimeout(() => setState('idle'), 1500);
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 1800);
        // eslint-disable-next-line no-alert
        alert('Could not access clipboard — please retry, or copy from the report manually.');
      }
    }
  }, [rows, getCsv]);

  const ck = (coldkey || '').slice(0, 6);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `tao-wallet-report-${ck}-${filenamePrefix}-${ymd}.csv`;

  return (
    <div className="csv-toolbar">
      <button
        type="button"
        className={`csv-btn ${state === 'copied' ? 'copied' : ''} ${state === 'error' ? 'error' : ''}`}
        onClick={onClick}
        title={`Copy CSV (${filename})`}
        aria-label={ariaLabel}
      >
        {state === 'copied' ? '✓ Copied' : state === 'error' ? '✗ Failed' : '📋 Copy as CSV'}
      </button>
    </div>
  );
}

function Section({ title, n, children }) {
  return (
    <section className="card">
      <h2>
        <span className="num">§{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, cls: c }) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className={`val ${c || ''}`}>{value}</div>
    </div>
  );
}

// §4 PnL attribution row trend chip: shows the position's 7d alpha price
// movement so a "+0.83 τ PnL" cell carries the price direction context.
// ±2% thresholds match the §3 weightedApySeries direction logic.
function PnlTrendChip({ pct7d }) {
  if (pct7d == null || !Number.isFinite(pct7d)) return null;
  const tier = pct7d >= 2 ? 'up' : pct7d <= -2 ? 'down' : 'flat';
  const arrow = tier === 'up' ? '↗' : tier === 'down' ? '↘' : '→';
  const sign = pct7d >= 0 ? '+' : '';
  const title = `7d α price ${sign}${pct7d.toFixed(2)}%`;
  return (
    <span className={`pnl-trend-chip pnl-trend-${tier}`} title={title}>
      {' '}{arrow} {sign}{pct7d.toFixed(1)}%
    </span>
  );
}

function formatShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

// Generic compact inline-SVG sparkline — used by §2 staking-income trend
// (values: daily τ income) and §2 rolling-vol trend (values: 30d annualised σ).
// Anchor-mode 'zero' fills bottom-to-value (income), 'minmax' uses series
// min/max for visual contrast (vol — sigma is always >0 but the meaningful
// movement is relative, not absolute-from-zero).
function Sparkline({ series, valueKey, anchor = 'zero', titlePrefix, valueFmt, width = 200, height = 36, minObs = 7 }) {
  if (!Array.isArray(series) || series.length < minObs) return null;
  const values = series.map((p) => Math.max(0, Number(p[valueKey]) || 0));
  const max = Math.max(...values);
  if (max <= 0) return null;
  let base = 0;
  let span = max;
  if (anchor === 'minmax') {
    const min = Math.min(...values);
    base = min;
    span = Math.max(max - min, 1e-9);
  }
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + innerH - ((v - base) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const last = values[values.length - 1];
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = pad + innerH - ((last - base) / span) * innerH;
  const firstDate = series[0]?.date;
  const lastDate = series[series.length - 1]?.date;
  const valFmt = valueFmt || ((v) => v.toFixed(4));
  const title = `${titlePrefix} · ${formatShortDate(firstDate)} → ${formatShortDate(lastDate)} · peak ${valFmt(max)}${anchor === 'minmax' ? `, low ${valFmt(base)}` : ''}`;
  return (
    <span className="spark" title={title}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={titlePrefix}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

// Compact inline-SVG sparkline for the staking-income trend. Renders one
// polyline + a baseline. Values are non-negative so we anchor the bottom at 0.
// Skips render when fewer than 7 daily observations (noisy single-week trend).
function StakingIncomeSparkline({ series, width = 200, height = 36 }) {
  if (!Array.isArray(series) || series.length < 7) return null;
  const values = series.map((p) => Math.max(0, Number(p.income) || 0));
  const max = Math.max(...values, 0);
  if (max <= 0) return null;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + innerH - (v / max) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const last = values[values.length - 1];
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = pad + innerH - (last / max) * innerH;
  const firstDate = series[0]?.date;
  const lastDate = series[series.length - 1]?.date;
  return (
    <span
      className="spark"
      title={`Daily staking income · ${formatShortDate(firstDate)} → ${formatShortDate(lastDate)} · peak ${max.toFixed(4)} τ/d`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Daily staking income trend">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function Report({ data, showSubscribeNudge = true }) {
  const { portfolio: p, pnl, pnlGroundTruth: gt, pnlDecomp: pnlDec, drawdown: dd, drawdownVerdict: ddv, stakingFlowVerdict: sfv, apyTrend: apyt, volatility: vol, taxYear: ty, yield: y, flags: f, recommendations: r, broader: b } = data;
  const subnetLookup = buildSubnetLookup(data);
  return (
    <div className="report">
      <p className="meta">
        Coldkey <code className="addr small">{data.coldkey}</code>{' '}
        <a
          className="taostats-link"
          href={`https://taostats.io/account/${data.coldkey}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Verify this coldkey's holdings on Taostats"
        >
          verify on Taostats ↗
        </a>{' '}· TAO ${fmt(data.taoPriceUsd, 2)} ·
        Generated {new Date(data.generatedAt).toUTCString()}
      </p>

      <DeltaStrip data={data} />

      {showSubscribeNudge && (
        <a href="#subscribe" className="top-nudge">
          <span className="top-nudge-icon">📬</span>
          <span>
            Want this report every Monday? <strong>Subscribe for ~$3 TAO</strong>
          </span>
          <span className="top-nudge-arrow">→</span>
        </a>
      )}

      <AIInsights coldkey={data.coldkey} />

      <Section n="1" title="Portfolio">
        <div className="stats">
          <Stat label="Total" value={`${fmt(p.totalTao)} τ`} />
          <Stat label="USD" value={`$${fmt(p.totalUsd)}`} />
          <Stat label="AUD" value={`A$${fmt(p.totalAud)}`} />
          <Stat label="Positions" value={p.positionCount} />
        </div>
        {p.canonicalSource === 'free-api-fallback' && Number.isFinite(p.canonicalTao) && (
          <p
            className="canonical-footnote"
            title={`Taostats canonical PnL feed degraded (${p.canonicalReason || 'rate_limited'}). Free-API substrate RPC reports ${p.canonicalTao.toFixed(6)} τ for this coldkey — surfaced here as the graduating canonical number while the paid feed recovers.`}
            style={{
              fontSize: '0.85em',
              color: 'var(--muted, #8a93a3)',
              marginTop: '6px',
              marginBottom: 0,
            }}
          >
            <span aria-hidden="true">ℹ️</span>{' '}
            free-API source ({fmt(p.canonicalTao, 4)} τ via substrate RPC) —
            Taostats canonical {
              p.canonicalReason === 'delegation_rate_limited' ? '/delegation rate-limited' :
              p.canonicalReason === 'holdings_rate_limited' ? '/holdings rate-limited' :
              p.canonicalReason === 'holdings_and_delegation_rate_limited' ? '/holdings + /delegation rate-limited' :
              'degraded'
            } this snapshot
          </p>
        )}
        {p.shadowVerified && Number.isFinite(p.shadowVerified.totalTao) && (
          <p
            className={`rpc-verified rpc-${p.shadowVerified.status}${p.shadowVerified.driftLeg ? ` rpc-leg-${p.shadowVerified.driftLeg}` : ''}`}
            title={(() => {
              const sv = p.shadowVerified;
              const lines = [
                `Substrate-RPC parallel total: ${Number(sv.totalTao).toFixed(6)} τ via finney RPC (System.Account SCALE u64 decode).`,
                `Drift vs Taostats canonical (${fmt(p.totalTao, 6)} τ): ${(sv.driftTao >= 0 ? '+' : '')}${Number(sv.driftTao).toFixed(6)} τ${Number.isFinite(sv.driftPct) ? ` (${(sv.driftPct * 100).toFixed(3)}%)` : ''}.`,
              ];
              // Iter 206 — per-leg attribution. Shows free + stake leg drifts
              // separately so a single-leg gap traces to the actual culprit.
              // Iter 208 fix — canonicalFreeTao now reads Taostats balance_free
              // directly (was derived as totalTao - stakedTao, which silently
              // folded balance_reserved into "free" and fabricated a constant
              // +0.093 τ fake free-leg drift on every wallet with reserved >0;
              // iter 268 NOTES proved it RAO-exact against substrate on 4
              // wallets). Reserved is now its own line so the breakdown is
              // honest about all three Taostats components.
              if (Number.isFinite(sv.freeTao) && Number.isFinite(sv.stakeTao) &&
                  Number.isFinite(sv.canonicalFreeTao) && Number.isFinite(sv.canonicalStakeTao)) {
                lines.push('');
                lines.push(`• Free leg: ${Number(sv.freeTao).toFixed(6)} τ substrate vs ${Number(sv.canonicalFreeTao).toFixed(6)} τ Taostats (${(sv.freeDriftTao >= 0 ? '+' : '')}${Number(sv.freeDriftTao).toFixed(6)} τ).`);
                if (Number.isFinite(sv.canonicalReservedTao) && sv.canonicalReservedTao > 0) {
                  lines.push(`• Reserved leg: ${Number(sv.canonicalReservedTao).toFixed(6)} τ Taostats (no substrate parallel — existential deposit / coldkey reservation).`);
                }
                lines.push(`• Stake leg: ${Number(sv.stakeTao).toFixed(6)} τ substrate vs ${Number(sv.canonicalStakeTao).toFixed(6)} τ Taostats (${(sv.stakeDriftTao >= 0 ? '+' : '')}${Number(sv.stakeDriftTao).toFixed(6)} τ).`);
                if (sv.driftLeg === 'stake') {
                  lines.push('Drift is concentrated in the stake/alpha leg — likely stale Taostats /coldkey_alpha_shares snapshot, not a substrate decode error.');
                } else if (sv.driftLeg === 'free') {
                  lines.push('Drift is concentrated in the free balance leg — unusual, Taostats balance_free historically matches substrate RAO-exact.');
                } else if (sv.driftLeg === 'both') {
                  lines.push('Drift hits both legs — possible substrate finalized-head lag vs Taostats snapshot tick.');
                }
              }
              // iter 207 — independent substrate cross-check via bittensor-tracker
              // sweep endpoint. Names which source the second substrate witness
              // agrees with for the free leg. iter 208 — after the canonicalFreeTao
              // fix, the typical outcome is THREE-way agreement on free (both
              // substrate witnesses + Taostats balance_free all RAO-exact); the
              // remaining drift, if any, lives in the stake leg.
              if (sv.crossCheck?.ok && Number.isFinite(sv.crossCheck.freeTao)) {
                lines.push('');
                const verdict = sv.crossCheck.agreesWithSubstrate && sv.crossCheck.agreesWithTaostats
                  ? 'agrees with both substrate and Taostats (three sources concur on free leg — any drift sits in stake)'
                  : sv.crossCheck.agreesWithSubstrate
                    ? 'agrees with substrate (Taostats free-leg outlier)'
                    : sv.crossCheck.agreesWithTaostats
                      ? 'agrees with Taostats (this report\'s substrate decode may be lagging)'
                      : 'diverges from both — investigate';
                lines.push(`• Cross-check: bittensor-tracker.app sweep reports free=${Number(sv.crossCheck.freeTao).toFixed(6)} τ — ${verdict}.`);
              }
              lines.push('');
              lines.push(
                sv.crossCheck?.ok
                  ? 'Free-API verification runs in parallel on every healthy report — Priority #1 ground-truth proof, cross-checked by independent sweep, no paid API required.'
                  : 'Free-API verification runs in parallel on every healthy report — Priority #1 ground-truth proof, no paid API required.',
              );
              return lines.join('\n');
            })()}
            style={{
              fontSize: '0.78em',
              color: 'var(--muted, #8a93a3)',
              marginTop: '4px',
              marginBottom: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <span
              aria-hidden="true"
              className="rpc-dot"
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background:
                  p.shadowVerified.status === 'match' ? '#3ecf8e' :
                  p.shadowVerified.status === 'drift' ? '#e0b341' :
                  '#d96666',
                boxShadow: '0 0 4px rgba(0,0,0,0.25)',
              }}
            />
            <span>
              RPC verified — {fmt(p.shadowVerified.totalTao, 4)} τ via substrate (
              {p.shadowVerified.status === 'match'
                ? 'parity'
                : `${p.shadowVerified.driftTao >= 0 ? '+' : ''}${Number(p.shadowVerified.driftTao).toFixed(4)} τ drift`}
              )
            </span>
            {p.shadowVerified.driftLeg && (
              <span
                className={`rpc-leg-tag rpc-leg-tag-${p.shadowVerified.driftLeg}`}
                style={{
                  fontSize: '0.92em',
                  opacity: 0.85,
                  paddingLeft: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.shadowVerified.driftLeg === 'stake'
                  ? '(stake leg)'
                  : p.shadowVerified.driftLeg === 'free'
                    ? '(free leg)'
                    : '(both legs)'}
              </span>
            )}
          </p>
        )}
        {p.sparkline30d && p.sparkline30d.str && (
          <div
            className="sparkline-row"
            title={`Last ${p.sparkline30d.points} daily balance snapshots: ${p.sparkline30d.firstTao.toFixed(4)} τ (${formatShortDate(p.sparkline30d.firstDate)}) → ${p.sparkline30d.lastTao.toFixed(4)} τ (${formatShortDate(p.sparkline30d.lastDate)}). Min ${p.sparkline30d.minTao.toFixed(4)} τ · Max ${p.sparkline30d.maxTao.toFixed(4)} τ.`}
          >
            <span className="sparkline-lbl">30d τ</span>
            <span className="sparkline">{p.sparkline30d.str}</span>
            <span className="sparkline-meta">
              {p.sparkline30d.firstTao.toFixed(2)} → {p.sparkline30d.lastTao.toFixed(2)} τ
            </span>
          </div>
        )}
        {(p.delta24h || p.delta7d) && (
          <div className="d24-row">
            {[
              { d: p.delta24h, lbl: '24h', titlePrefix: '24h Δ' },
              { d: p.delta7d, lbl: '7d', titlePrefix: '7d Δ' },
            ].filter((x) => x.d).map(({ d, lbl, titlePrefix }) => (
              <div
                key={lbl}
                className={`d24-strip ${d.deltaTao >= 0 ? 'd24-pos' : 'd24-neg'}`}
                title={`${titlePrefix}: ${d.priorTao.toFixed(4)} τ → ${d.currentTao.toFixed(4)} τ (snapshot ${formatShortDate(d.priorDate)} → ${formatShortDate(d.currentDate)})`}
              >
                <span className="d24-arrow">{d.deltaTao >= 0 ? '▲' : '▼'}</span>
                <span className="d24-lbl">{lbl}</span>
                <span className="d24-tao">
                  {d.deltaTao >= 0 ? '+' : ''}{fmt(d.deltaTao, 4)} τ
                </span>
                <span className="d24-pct">
                  ({d.deltaTao >= 0 ? '+' : ''}{fmt(d.deltaPct * 100, 2)}%)
                </span>
                <span className="d24-fiat">
                  {d.deltaUsd >= 0 ? '+' : '−'}${fmt(Math.abs(d.deltaUsd), 2)}
                  {' · '}
                  {d.deltaAud >= 0 ? '+' : '−'}A${fmt(Math.abs(d.deltaAud), 2)}
                </span>
              </div>
            ))}
          </div>
        )}
        {p.trendHint && (() => {
          const th = p.trendHint;
          const tone =
            th.kind === 'rally' ? 'th-up'
            : th.kind === 'bleed' ? 'th-down'
            : th.kind === 'bounce' ? 'th-up'  // 24h up: net positive nudge
            : 'th-down';                       // pullback: 24h down
          // Alignment: how many top holdings carry the same shape kind.
          // ≥70% = broad → green tint (broad move). <40% = narrow → red
          // tint (aggregate driven by a couple of positions; rest mixed).
          // 40–70% = neutral, default tint.
          const al = th.alignment;
          const alignRatio = al ? al.matches / al.total : null;
          const alignCls = alignRatio == null
            ? ''
            : alignRatio >= 0.7
              ? 'th-align-broad'
              : alignRatio < 0.4
                ? 'th-align-narrow'
                : '';
          const alignBlurb = al
            ? alignRatio >= 0.7
              ? `broad — ${al.matches} of ${al.total} top holdings share this shape, the move is well-supported across positions`
              : alignRatio < 0.4
                ? `narrow — only ${al.matches} of ${al.total} top holdings share this shape, the aggregate is being driven by a small number of positions while the rest are mixed`
                : `mixed — ${al.matches} of ${al.total} top holdings share this shape`
            : null;
          return (
            <div
              className={`portfolio-trend-hint ${tone}`}
              title={`Portfolio day-vs-week shape: ${th.label.toLowerCase()}. 24h ${th.pct24h >= 0 ? '+' : ''}${th.pct24h.toFixed(2)}% / 7d ${th.pct7d >= 0 ? '+' : ''}${th.pct7d.toFixed(2)}% on total τ.${alignBlurb ? ` Alignment ${alignBlurb}.` : ''} Same vocabulary as the per-position chips in the table below.`}
            >
              <span className="th-emoji">{th.emoji}</span>
              <span className="th-label">{th.label}</span>
              <span className="th-detail">
                24h {th.pct24h >= 0 ? '+' : ''}{th.pct24h.toFixed(2)}% / 7d {th.pct7d >= 0 ? '+' : ''}{th.pct7d.toFixed(2)}%
              </span>
              {al && (
                <span className={`th-alignment ${alignCls}`}>
                  {al.matches}/{al.total} holdings agree
                </span>
              )}
            </div>
          );
        })()}
        {(() => {
          if (!p.top10 || p.top10.length === 0) return null;
          const dominant = p.top10
            .filter((x) => typeof x.pctOfPortfolio === 'number')
            .reduce((max, x) => (x.pctOfPortfolio > (max?.pctOfPortfolio || 0) ? x : max), null);
          if (!dominant || dominant.pctOfPortfolio < 40) return null;
          const tier = dominant.pctOfPortfolio >= 60 ? 'crit' : 'warn';
          const icon = tier === 'crit' ? '🚨' : '⚠';
          const label = tier === 'crit' ? 'Critical concentration' : 'High concentration';
          return (
            <div
              className={`conc-chip conc-${tier}`}
              title={`Single-position concentration risk: sn${dominant.netuid} ${dominant.name} is ${dominant.pctOfPortfolio.toFixed(1)}% of total τ. A move in this one subnet drives most of your portfolio swing — consider trimming if you'd rather have less idiosyncratic risk.`}
            >
              <span className="conc-icon">{icon}</span>
              <span className="conc-lbl">{label}</span>
              <span className="conc-detail">
                sn{dominant.netuid} {dominant.name} is{' '}
                <strong>{fmt(dominant.pctOfPortfolio, 1)}%</strong> of total τ
              </span>
            </div>
          );
        })()}
        {p.top10.length > 0 ? (() => {
          const maxValue = Math.max(...p.top10.map((x) => x.taoValue || 0));
          const maxPort = Math.max(...p.top10.map((x) => x.pctOfPortfolio || 0));
          const maxAbs1d = Math.max(...p.top10.map((x) => Math.abs(x.pct1d || 0)));
          const maxAbs7d = Math.max(...p.top10.map((x) => Math.abs(x.pct7d || 0)));
          const perSubnetMap = new Map((pnl?.perSubnet || []).map((s) => [s.netuid, s]));
          // Build a per-netuid APY map by alpha-weighting yield.perPosition rows
          // across hotkeys on the same subnet (mirrors the §3 weighting logic so
          // the per-row chip matches the headline weighted-APY when only one
          // subnet is held).
          const perNetuidApy = new Map();
          for (const yp of y?.perPosition || []) {
            if (yp.apy == null || !(yp.alphaTokens > 0)) continue;
            const prev = perNetuidApy.get(yp.netuid) || { num: 0, den: 0, anyFallback: false };
            prev.num += yp.apy * yp.alphaTokens;
            prev.den += yp.alphaTokens;
            if (yp.apyIsFallback) prev.anyFallback = true;
            perNetuidApy.set(yp.netuid, prev);
          }
          // Aggregate yield + value totals across rendered top10 for the tfoot row.
          let totalTaoYr = 0;
          let wApyNum = 0;
          let wApyDen = 0;
          let totalValueTao = 0;
          let totalPctPort = 0;
          let coveredPositions = 0;
          for (const pos of p.top10) {
            totalValueTao += pos.taoValue || 0;
            totalPctPort += pos.pctOfPortfolio || 0;
            const agg = perNetuidApy.get(pos.netuid);
            if (agg && agg.den > 0) {
              const apy = agg.num / agg.den;
              if (Number.isFinite(apy) && apy > 0 && pos.taoValue > 0) {
                totalTaoYr += pos.taoValue * apy;
                wApyNum += pos.taoValue * apy;
                wApyDen += pos.taoValue;
                coveredPositions += 1;
              }
            }
          }
          const wApy = wApyDen > 0 ? wApyNum / wApyDen : null;
          // Top movers: 24h winners + losers, sorted by signed pct1d, only when
          // there's enough breadth to be informative (≥4 positions with pct1d).
          const withPct1d = p.top10.filter((x) => typeof x.pct1d === 'number' && Number.isFinite(x.pct1d));
          const sortedByPct1d = withPct1d.slice().sort((a, b) => b.pct1d - a.pct1d);
          const winners = sortedByPct1d.filter((x) => x.pct1d > 0).slice(0, 3);
          const losers = sortedByPct1d.filter((x) => x.pct1d < 0).slice(-3).reverse();
          const showMovers = withPct1d.length >= 4 && (winners.length > 0 || losers.length > 0);
          return (
            <>
              {showMovers && (
                <div className="movers-strip">
                  <div className="movers-grp movers-win">
                    <span className="movers-grp-lbl">▲ 24h</span>
                    {winners.map((m) => (
                      <span key={`w-${m.netuid}`} className="mover-chip pos" title={`sn${m.netuid} ${m.name} · ${fmt(m.taoValue, 4)} τ (${fmt(m.pctOfPortfolio, 1)}% of port)`}>
                        <span className="m-sn">sn{m.netuid}</span> {m.name}{' '}
                        <span className="m-pct">+{fmt(m.pct1d, 2)}%</span>
                      </span>
                    ))}
                    {winners.length === 0 && <span className="mover-empty">no green positions</span>}
                  </div>
                  <div className="movers-grp movers-lose">
                    <span className="movers-grp-lbl">▼ 24h</span>
                    {losers.map((m) => (
                      <span key={`l-${m.netuid}`} className="mover-chip neg" title={`sn${m.netuid} ${m.name} · ${fmt(m.taoValue, 4)} τ (${fmt(m.pctOfPortfolio, 1)}% of port)`}>
                        <span className="m-sn">sn{m.netuid}</span> {m.name}{' '}
                        <span className="m-pct">{fmt(m.pct1d, 2)}%</span>
                      </span>
                    ))}
                    {losers.length === 0 && <span className="mover-empty">no red positions</span>}
                  </div>
                </div>
              )}
              <CopyCsvButton rows={p.top10} coldkey={data.coldkey} />
              <div className="tbl-scroll">
              <table className="tbl tbl-heatmap">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subnet</th>
                    <th className="num">α held</th>
                    <th className="num">α price (τ)</th>
                    <th className="num">Value (τ)</th>
                    <th className="num">% port</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                  </tr>
                </thead>
                <tbody>
                  {p.top10.map((pos) => {
                    const rgb1d = (pos.pct1d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                    const rgb7d = (pos.pct7d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                    return (
                      <tr key={pos.netuid}>
                        <td>{pos.netuid}</td>
                        <td>
                          <SubnetLink
                            netuid={pos.netuid}
                            name={pos.name}
                            info={subnetLookup.get(pos.netuid)}
                            href={`https://taostats.io/subnets/${pos.netuid}/metagraph`}
                          />
                          {(() => {
                            if (pos.emissionPct == null || !Number.isFinite(pos.emissionPct)) return null;
                            // iter 194 — emission_pct is a per-epoch SNAPSHOT, not a sustained signal.
                            // Yuma consensus rotates validator weight per ~72min tempo (360 blocks); at any
                            // instant ~90/128 subnets show 0 (rotation), the other ~38 share emission.
                            // Renamed tier "emit-starved" → "emit-off-epoch" + glyph carries `(epoch)`
                            // suffix so users read the chip as "this epoch" not "permanent state".
                            const tier =
                              pos.emissionPct >= 1.0 ? 'emit-high'
                              : pos.emissionPct === 0 ? 'emit-off-epoch'
                              : 'emit-fair';
                            const tierLabel =
                              tier === 'emit-high' ? 'above 1.0% high-emission threshold in this epoch snapshot (≈1.3× fair share of 1/128)'
                              : tier === 'emit-off-epoch' ? 'no emission share in this epoch snapshot — Yuma consensus rotates validator weight per ~72min tempo, over 24h most active subnets receive some share'
                              : 'below the 1.0% high-emission threshold but above zero in this epoch snapshot';
                            return (
                              <span
                                className={`subnet-emit-chip ${tier}`}
                                title={`Network emission share for sn${pos.netuid}: ${pos.emissionPct.toFixed(2)}% — ${tierLabel}. tao.app screener emission_pct is a per-epoch SNAPSHOT (sums to 100 across subnets; rotates per ~72min Yuma tempo); fair share at 128 subnets ≈ 0.78%. Read as "this epoch" not "sustained".`}
                              >
                                {' · '}{pos.emissionPct.toFixed(2)}% emit (epoch)
                              </span>
                            );
                          })()}
                        </td>
                        <td className="num">{fmt(pos.alphaHeld)}</td>
                        <td className="num">
                          {fmt(pos.alphaPriceTao, 6)}
                          {(() => {
                            const ps = perSubnetMap.get(pos.netuid);
                            if (!ps || !(pos.alphaHeld > 0) || !(pos.alphaPriceTao > 0)) return null;
                            const netSpent = (ps.spentTao || 0) - (ps.soldTao || 0);
                            // BUY mode: real net spend — show avg entry + per-α return.
                            if (netSpent > 0) {
                              const avgEntry = netSpent / pos.alphaHeld;
                              if (!Number.isFinite(avgEntry) || avgEntry <= 0) return null;
                              const perAlphaReturn = (pos.alphaPriceTao - avgEntry) / avgEntry;
                              return (
                                <div
                                  className="cost-basis-chip"
                                  title={`Net spent ${netSpent.toFixed(4)} τ for ${pos.alphaHeld.toFixed(4)} α → avg entry ${avgEntry.toFixed(6)} τ/α (vs current ${pos.alphaPriceTao.toFixed(6)} τ/α)`}
                                >
                                  <span className="cb-lbl">entry</span>{' '}
                                  <span className="cb-val">{fmt(avgEntry, 6)}</span>{' '}
                                  <span className={`cb-pct ${cls(perAlphaReturn)}`}>
                                    {perAlphaReturn >= 0 ? '+' : ''}{fmt(perAlphaReturn * 100, 1)}%
                                  </span>
                                </div>
                              );
                            }
                            // YIELD mode: position was earned via staking, no on-chain buy.
                            // Surface a small badge so the row tells the user *why* there's no entry price.
                            if (ps.currentTao > 0) {
                              return (
                                <div
                                  className="cost-basis-chip cb-yield"
                                  title={`No on-chain buys for sn${pos.netuid} — all ${pos.alphaHeld.toFixed(4)} α earned via staking/yield (current value ${ps.currentTao.toFixed(4)} τ).`}
                                >
                                  <span className="cb-lbl">🌱 yield</span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {(() => {
                            const apyAgg = perNetuidApy.get(pos.netuid);
                            if (!apyAgg || !(apyAgg.den > 0)) return null;
                            const apy = apyAgg.num / apyAgg.den;
                            if (!Number.isFinite(apy) || apy <= 0) return null;
                            const apyPct = apy * 100;
                            const taoPerYr = pos.taoValue * apy;
                            return (
                              <div
                                className={`apy-chip${apyAgg.anyFallback ? ' apy-fallback' : ''}`}
                                title={`${apyPct.toFixed(2)}% APY on sn${pos.netuid}${apyAgg.anyFallback ? ' (subnet median — your validator not in response)' : ''} · ≈ ${taoPerYr.toFixed(4)} τ/yr at current price`}
                              >
                                <span className="apy-lbl">📈 APY</span>{' '}
                                <span className="apy-val">{apyPct.toFixed(1)}%</span>
                                {Number.isFinite(taoPerYr) && taoPerYr >= 0.0001 && (
                                  <span className="apy-yr">{' '}· {taoPerYr.toFixed(4)} τ/yr</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="num heat" style={heatBg(pos.taoValue, maxValue, HEAT_ORANGE)}>{fmt(pos.taoValue)}</td>
                        <td className="num heat" style={heatBg(pos.pctOfPortfolio, maxPort, HEAT_ORANGE)}>{fmt(pos.pctOfPortfolio, 1)}%</td>
                        <td className={`num heat ${cls(pos.pct1d)}`} style={heatBg(pos.pct1d, maxAbs1d, rgb1d)}>{fmtPct(pos.pct1d)}</td>
                        <td className={`num heat ${cls(pos.pct7d)}`} style={heatBg(pos.pct7d, maxAbs7d, rgb7d)}>
                          {fmtPct(pos.pct7d)}
                          {(() => {
                            // Day-vs-week trend hint — mirrors the iter 92 movers
                            // tooltip logic but as a visible per-row emoji so the
                            // §1 table tells the same shape story at a glance:
                            //   📈 week-long rally   (both green)
                            //   📉 week-long bleed   (both red)
                            //   ↩️ bounce off weekly low (red 7d, green 24h)
                            //   🔻 pullback in uptrend   (green 7d, red 24h)
                            if (pos.pct1d == null || pos.pct7d == null) return null;
                            if (!Number.isFinite(pos.pct1d) || !Number.isFinite(pos.pct7d)) return null;
                            // Soft-omit near-zero either side — chip would be noise.
                            if (Math.abs(pos.pct1d) < 0.1 || Math.abs(pos.pct7d) < 0.1) return null;
                            const sameSign =
                              (pos.pct1d > 0 && pos.pct7d > 0) ||
                              (pos.pct1d < 0 && pos.pct7d < 0);
                            const oppSign =
                              (pos.pct1d > 0 && pos.pct7d < 0) ||
                              (pos.pct1d < 0 && pos.pct7d > 0);
                            let emoji = null, label = null;
                            if (sameSign && pos.pct7d > 0) { emoji = '📈'; label = 'week-long rally'; }
                            else if (sameSign && pos.pct7d < 0) { emoji = '📉'; label = 'week-long bleed'; }
                            else if (oppSign && pos.pct1d > 0) { emoji = '↩️'; label = 'bounce off weekly low'; }
                            else if (oppSign && pos.pct1d < 0) { emoji = '🔻'; label = 'pullback in uptrend'; }
                            if (!emoji) return null;
                            return (
                              <span
                                className="trend-hint-chip"
                                title={`Day shape vs week shape on sn${pos.netuid}: ${label} (24h ${pos.pct1d >= 0 ? '+' : ''}${pos.pct1d.toFixed(2)}% / 7d ${pos.pct7d >= 0 ? '+' : ''}${pos.pct7d.toFixed(2)}%).`}
                              >
                                {' '}{emoji}
                              </span>
                            );
                          })()}
                          {(() => {
                            if (pos.pct7d == null || !Number.isFinite(pos.pct7d)) return null;
                            if (!(pos.taoValue > 0)) return null;
                            const denom = 1 + pos.pct7d / 100;
                            if (!(denom > 0)) return null;
                            const change7dTao = pos.taoValue - pos.taoValue / denom;
                            if (!Number.isFinite(change7dTao) || Math.abs(change7dTao) < 0.001) return null;
                            const sign = change7dTao >= 0 ? '+' : '−';
                            const tier = change7dTao >= 0 ? 'up' : 'down';
                            return (
                              <span
                                className={`row-7d-change row-7d-${tier}`}
                                title={`7d τ change on sn${pos.netuid}: ${sign}${Math.abs(change7dTao).toFixed(4)} τ (current ${pos.taoValue.toFixed(4)} τ vs 7d-ago ${(pos.taoValue / denom).toFixed(4)} τ at ${pos.pct7d >= 0 ? '+' : ''}${pos.pct7d.toFixed(2)}%)`}
                              >
                                {' '}{sign}{Math.abs(change7dTao).toFixed(2)} τ
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="tfoot-totals">
                    <td></td>
                    <td><span className="tfoot-lbl">Total ({p.top10.length} pos)</span></td>
                    <td className="num"></td>
                    <td className="num">
                      {wApy != null && totalTaoYr > 0 ? (
                        <div
                          className="apy-chip apy-chip-foot"
                          title={`Portfolio-weighted APY across ${coveredPositions} of ${p.top10.length} top positions with yield data: ${(wApy * 100).toFixed(2)}% · ≈ ${totalTaoYr.toFixed(4)} τ/yr at current prices.`}
                        >
                          <span className="apy-lbl">Σ APY</span>{' '}
                          <span className="apy-val">{(wApy * 100).toFixed(1)}%</span>{' '}
                          <span className="apy-yr">· {totalTaoYr.toFixed(4)} τ/yr</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="num">{fmt(totalValueTao)}</td>
                    <td className="num">{fmt(totalPctPort, 1)}%</td>
                    <td className="num"></td>
                    <td className="num"></td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </>
          );
        })() : (
          <p className="empty">No alpha-token holdings found for this coldkey.</p>
        )}
      </Section>

      <Section n="2" title="PnL">
        {gt && gt.available ? (
          <>
            <div className="pnl-headline">
              <div className={`pnl-big ${cls(gt.profitTao)}`}>
                {gt.profitTao >= 0 ? '+' : ''}{fmt(gt.profitTao, 3)} τ
                <span className="pnl-pct">
                  {' '}({gt.returnPct >= 0 ? '+' : ''}{fmt(gt.returnPct * 100, 2)}%)
                </span>
              </div>
              <div className="pnl-fiat">
                ≈ {gt.profitUsd >= 0 ? '+' : ''}${fmt(gt.profitUsd, 2)} USD ·{' '}
                {gt.profitAud >= 0 ? '+' : ''}A${fmt(gt.profitAud, 2)}
              </div>
              <div
                className="pnl-window"
                title={
                  gt.windowIsShortened
                    ? `Headline label uses the actual reconstruction window (${gt.effectiveWindowDays}d) rather than the requested ${gt.windowDays}d — the underlying free-tier Taostats /api/account/history/v1 endpoint only retains ~6 months of snapshots, so a 365d request falls back to the oldest available row (iter 109).`
                    : undefined
                }
              >
                Over last {gt.effectiveWindowDays} days ({gt.firstSnapshotDate} → {gt.lastSnapshotDate})
                {gt.windowIsShortened ? ` · requested ${gt.windowDays}d, data covers ${gt.effectiveWindowDays}d` : ''}
              </div>
              {(() => {
                // Status pill — companion to the §1 portfolio-trend-hint but
                // anchored on cumulative window PnL rather than 24h/7d delta.
                // Break-even threshold ±0.5% so a fractional drift doesn't
                // flip the label on a wallet sitting right at cost basis.
                const pctNum = Number(gt.returnPct) * 100;
                if (!Number.isFinite(pctNum)) return null;
                let kind, emoji, label;
                if (Math.abs(pctNum) < 0.5) { kind = 'flat'; emoji = '🟰'; label = 'Break-even'; }
                else if (pctNum > 0) { kind = 'up'; emoji = '📈'; label = 'In profit'; }
                else { kind = 'down'; emoji = '📉'; label = 'In drawdown'; }
                const sinceTao = gt.startingBalanceTao + gt.transferInTao - gt.transferOutTao;
                const profitTaoSign = gt.profitTao >= 0 ? '+' : '';
                return (
                  <div
                    className={`pnl-status-chip pnl-status-${kind}`}
                    title={`Wallet is ${label.toLowerCase()} over the ${gt.effectiveWindowDays}-day window${gt.windowIsShortened ? ` (requested ${gt.windowDays}d but data only covers ${gt.effectiveWindowDays}d since ${gt.firstSnapshotDate})` : ''}. Net contributed base ${sinceTao.toFixed(3)} τ (start + transfers in − transfers out) → current ${gt.currentPortfolioTao.toFixed(3)} τ → ${profitTaoSign}${gt.profitTao.toFixed(3)} τ (${pctNum >= 0 ? '+' : ''}${pctNum.toFixed(2)}%). Break-even band ±0.5% absorbs fractional drift on flat wallets.`}
                  >
                    <span className="pnl-status-emoji">{emoji}</span>
                    <span className="pnl-status-label">{label}</span>
                    <span className="pnl-status-detail">
                      {pctNum >= 0 ? '+' : ''}{pctNum.toFixed(2)}% over {gt.effectiveWindowDays}d
                    </span>
                  </div>
                );
              })()}
              {(() => {
                // Annualised return chip — normalises the windowed return so
                // a 0.98% over 30d (12.4% annualised) doesn't read like a
                // 0.98% over 365d (already annual). Compound formula:
                // (1 + ret)^(365/days) − 1. Soft-omits below 14 days only —
                // compounding tiny windows produces nonsense extremes (e.g.
                // +5% over 3d ≈ +400% annualised). At exactly 365d the chip
                // collapses to the same number as the raw return; that's
                // honest, not noise, so we render it with an "= raw" sub.
                const ret = Number(gt.returnPct);
                // Use effective (actual data) window — annualising a 172d return
                // as if it were 365d would silently dampen the chip (iter 110).
                const days = Number(gt.effectiveWindowDays);
                if (!Number.isFinite(ret) || !(days >= 14)) return null;
                const annual = Math.pow(1 + ret, 365 / days) - 1;
                if (!Number.isFinite(annual)) return null;
                const annualPct = annual * 100;
                const rawPct = ret * 100;
                const sign = annualPct >= 0 ? '+' : '';
                const tone = annualPct > 0.5 ? 'up' : annualPct < -0.5 ? 'down' : 'flat';
                const sameAsRaw = Math.abs(annualPct - rawPct) < 0.01;
                return (
                  <div
                    className={`pnl-apy-chip pnl-apy-${tone}`}
                    title={`Compound-annualised equivalent: (1 + ${rawPct.toFixed(4)}%)^(365 / ${days}) − 1 = ${sign}${annualPct.toFixed(2)}%. Lets different report windows compare on the same footing (e.g. a 30-day +1% becomes ~12% annualised, very different from a 365-day +1%). Soft-omitted on <14d windows.`}
                  >
                    <span className="pnl-apy-lbl">≈ Annualised</span>
                    <span className="pnl-apy-val">{sign}{annualPct.toFixed(2)}%</span>
                    <span className="pnl-apy-sub">
                      {sameAsRaw
                        ? `= raw over ${days}d (already annual)`
                        : `vs raw ${rawPct >= 0 ? '+' : ''}${rawPct.toFixed(2)}% over ${days}d`}
                    </span>
                  </div>
                );
              })()}
              {(() => {
                // Base-vs-current strip — surfaces the τ start and end the
                // status pill (iter 97) only mentioned in its tooltip. Without
                // these numbers a "+0.98%" return is ambiguous: profit on what
                // base? AUD shown alongside for fiat anchor (start vs now uses
                // current taoPrice for both sides — what the τ would be worth
                // TODAY at each balance — so the gap is a pure τ delta in fiat
                // terms, not contaminated by token price moves).
                const sinceTao = gt.startingBalanceTao + gt.transferInTao - gt.transferOutTao;
                const taoPrice = Number(data.taoPriceUsd) || 0;
                const usdAud = Number(data.usdAud) || 0;
                if (!(sinceTao > 0) || !(gt.currentPortfolioTao > 0) || !(taoPrice > 0)) return null;
                const startAud = sinceTao * taoPrice * usdAud;
                const nowAud = gt.currentPortfolioTao * taoPrice * usdAud;
                const deltaTau = gt.currentPortfolioTao - sinceTao;
                const deltaSign = deltaTau >= 0 ? '+' : '';
                return (
                  <div
                    className="pnl-base-strip"
                    title={`Net contributed base = starting balance ${gt.startingBalanceTao.toFixed(4)} τ + transfers in ${gt.transferInTao.toFixed(4)} τ − transfers out ${gt.transferOutTao.toFixed(4)} τ = ${sinceTao.toFixed(4)} τ. Both AUD figures use the CURRENT TAO price so the gap reflects pure τ growth (not token price moves).`}
                  >
                    <span className="pbs-lbl">Net contributed</span>
                    <span className="pbs-val">{sinceTao.toFixed(3)} τ</span>
                    <span className="pbs-arrow">→</span>
                    <span className="pbs-lbl">Current</span>
                    <span className="pbs-val">{gt.currentPortfolioTao.toFixed(3)} τ</span>
                    <span className="pbs-delta">({deltaSign}{deltaTau.toFixed(3)} τ)</span>
                    {usdAud > 0 && (
                      <span className="pbs-fiat">
                        ≈ A${startAud.toFixed(2)} → A${nowAud.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })()}
              {(() => {
                // Income breakdown — splits the headline PnL into two legs:
                // recurring STAKING income (dailyIncomeTao, sourced from the
                // tax-report endpoint same as the Bittensor weekly doc) and
                // PRICE-driven PnL (the residual = profit − staking, which
                // captures token-price moves on whatever is held). Both legs
                // are real τ but they tell different stories: staking is a
                // floor you'd earn even at flat prices, price is the mark on
                // top. Soft-omits when staking income is null or zero (the
                // breakdown collapses to profit ≈ price, no signal added).
                const staking = Number(gt.dailyIncomeTao);
                const profit = Number(gt.profitTao);
                if (!Number.isFinite(staking) || !(staking > 0)) return null;
                if (!Number.isFinite(profit)) return null;
                const priceLeg = profit - staking;
                const sLegCls = staking > 0 ? 'pib-up' : staking < 0 ? 'pib-down' : 'pib-flat';
                const pLegCls = priceLeg > 0.0001 ? 'pib-up' : priceLeg < -0.0001 ? 'pib-down' : 'pib-flat';
                const sSign = staking >= 0 ? '+' : '';
                const pSign = priceLeg >= 0 ? '+' : '';
                const stakingShareOfProfit = profit !== 0 ? (staking / profit) * 100 : null;
                return (
                  <div
                    className="pnl-income-breakdown"
                    title={`Headline PnL ${profit >= 0 ? '+' : ''}${profit.toFixed(4)} τ = staking ${sSign}${staking.toFixed(4)} τ + price-driven ${pSign}${priceLeg.toFixed(4)} τ. Staking is recurring (dailyIncomeTao from the tax-report endpoint — same source as the Bittensor weekly FINAL doc); price is the residual capturing token-price marks on what's held.${stakingShareOfProfit != null && Math.abs(stakingShareOfProfit) < 500 ? ` Staking covers ${stakingShareOfProfit.toFixed(0)}% of the headline.` : ''}`}
                  >
                    <span className="pib-lbl">Breakdown</span>
                    <span className={`pib-leg ${sLegCls}`}>
                      <span className="pib-leg-lbl">Staking</span>
                      <span className="pib-leg-val">{sSign}{staking.toFixed(4)} τ</span>
                    </span>
                    <span className="pib-sep">·</span>
                    <span className={`pib-leg ${pLegCls}`}>
                      <span className="pib-leg-lbl">Price</span>
                      <span className="pib-leg-val">{pSign}{priceLeg.toFixed(4)} τ</span>
                    </span>
                  </div>
                );
              })()}
            </div>
            {ty && ty.available && ty.buckets.length > 0 && (
              <div className="tax-year-panel">
                <div className="tax-year-head">
                  <h3 className="sub-h">AU tax-year breakdown</h3>
                  <CopyCsvButton
                    getCsv={() => buildTaxYearCsv(ty.buckets)}
                    coldkey={data.coldkey}
                    filenamePrefix="tax-year"
                    ariaLabel="Copy tax-year breakdown as CSV"
                  />
                </div>
                <table className="tax-year-table">
                  <thead>
                    <tr>
                      <th>FY</th>
                      <th>Window</th>
                      <th>Start bal</th>
                      <th>End bal</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>PnL τ</th>
                      <th>Return %</th>
                      <th>A$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ty.buckets.map((b) => (
                      <tr key={b.label} className={b.isCurrentFy ? 'fy-current' : ''}>
                        <td>
                          {b.label}
                          {b.isCurrentFy && <span className="fy-tag"> (in progress)</span>}
                        </td>
                        <td className="fy-window">
                          {formatShortDate(b.startDate)} → {formatShortDate(b.endDate)}
                        </td>
                        <td>{fmt(b.startBalanceTao, 3)} τ</td>
                        <td>{fmt(b.endBalanceTao, 3)} τ</td>
                        <td>{fmt(b.transferInTao, 3)} τ</td>
                        <td>{fmt(b.transferOutTao, 3)} τ</td>
                        <td className={cls(b.profitTao)}>
                          {b.profitTao >= 0 ? '+' : ''}{fmt(b.profitTao, 4)}
                        </td>
                        <td className={cls(b.profitTao)}>
                          {b.returnPct >= 0 ? '+' : ''}{fmt(b.returnPct * 100, 2)}%
                        </td>
                        <td className={cls(b.profitTao)}>
                          {b.profitAud >= 0 ? '+' : ''}A${fmt(b.profitAud, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="hint">
                  Australian financial year (Jul 1 → Jun 30). Same formula as the
                  headline above, applied per FY:{' '}
                  <code className="addr small">end + transfer_out − transfer_in − start</code>.
                  End balances come from /api/account/history/v1 (full total including
                  alpha staking). Transfers from /api/accounting/tax/v1, one fetch per FY.
                  Wallets created mid-FY use start = 0 so initial fundings don't
                  double-count.
                  {' '}{ty.pointCount} balance snapshots, {ty.transferCount} transfers across {ty.buckets.length} FY{ty.buckets.length === 1 ? '' : 's'}.
                </p>
              </div>
            )}
            {/* iter 200: pnlDecomp.verdict token chip surfaces inline next
                to a new §2 "Driver of return" h3 sub-header, between the AU
                tax-year-breakdown and the iter 197 Staking flows h3. The
                7-label verdict (stalled / price_headwind / underperforming /
                yield_driven / windfall / price_tailwind / balanced) is the
                PARENT verdict from pnlDecomposition() — classifies the
                staking-vs-price contribution mix of the headline PnL.
                Computed at lib/report.js:438-462, emits its own verdictReason
                per branch (lines 442/445/448/451/458/461). Payload at
                pnlDecomp top-level (line 2839). Consumed by §0 AI Insights
                via lib/ai-insights.js:175 ("Verdict: {verdict} — {verdictReason}")
                since iter ~117 but never rendered to the user. EIGHTH iter
                in the surface-symmetry sweep across major verdict classifiers
                (validatorConcentration iter 192, EMISSION_ALIGNMENT chips
                iter 193+194+195, drawdownVerdict iter 196, stakingFlowVerdict
                iter 197, multiWindowDurabilityVerdict iter 198,
                annualVsApyVerdict iter 199, pnlDecomp.verdict iter 200). pnlDec
                already destructured iter 199. Title = pnlDec.verdictReason
                verbatim (producer emits the threshold-citing string per
                label — same iter 196/197/198 pattern). Three opacity tiers:
                "quiet" low-narrative labels (stalled / windfall /
                price_tailwind) read italic 0.7 — stalled has no momentum to
                narrate, windfall/price_tailwind both say "don't extrapolate
                the headline"; "cautionary" yield-not-landing labels
                (price_headwind / underperforming) read 500-weight 0.95 —
                both signal weakness worth user eyes; "active" labels
                (yield_driven / balanced) fall through to base 0.85 — these
                are the healthy steady-state reads. NO green/red — §0
                narrative owns severity, chip is information-only. */}
            <h3 className="sub-h pnlv-head-title">
              Driver of return
              {pnlDec && pnlDec.available && pnlDec.verdict && (
                <span
                  className={`pnlv-verdict-chip pnlv-verdict-${pnlDec.verdict.replace(/_/g, '-')}`}
                  title={pnlDec.verdictReason || `PnL decomposition verdict: ${pnlDec.verdict}`}
                >
                  {' · '}
                  {pnlDec.verdict.replace(/_/g, ' ')}
                </span>
              )}
            </h3>
            {/* iter 197: stakingFlowVerdict token chip surfaces inline next
                to a new "Staking flows" h3 above the Transfers in/out stats
                grid. Same "data already computed, never rendered" pattern as
                iter 196 ddv chip — sfv has been computed in lib/report.js
                stakingFlowVerdict() since iter 123 (8 verdict labels:
                hands_off / passive / rebalancing / self_funding /
                accumulation / capitalising / harvesting / distribution) and
                consumed by §0 AI Insights, but never rendered to the user.
                Three opacity tiers: "quiet" no-flow labels (hands_off,
                passive, rebalancing, self_funding) read italic 0.7;
                "active" directional labels (accumulation, capitalising,
                harvesting) read base 0.85; "cautionary" distribution
                reads 500-weight 0.95. Tooltip = verdictReason. No green/red
                — §0 narrative owns severity, chip is information-only. */}
            {/* iter 198: multiWindowDurabilityVerdict token chip — second chip
                on the .sf-head-title h3 next to the sfv chip from iter 197.
                The durability frame is the LONG ARC (30d/90d/180d/365d window
                arc per iter 137 lineage) layered on top of the single-window
                stakingFlowVerdict. Same "data already computed since iter 137,
                consumed by §0 AI Insights via lib/ai-insights.js, never
                rendered to the user" pattern as iter 192/193/195/196/197 —
                sixth iter in the surface-symmetry sweep across major verdict
                classifiers. Payload attached at sfv.multiWindowDurability per
                lib/report.js line 2828. Nine verdict labels: dormant_harvest_only
                / flat / one_off_spike / fading_flow / recent_reversal_to_accumulation
                / recent_reversal_to_distribution / sustained_accumulation /
                sustained_distribution / mixed. Three opacity tiers: "quiet"
                low-signal labels (dormant_harvest_only / flat / fading_flow /
                one_off_spike) read italic 0.7; "cautionary" reversals
                (recent_reversal_to_accumulation / recent_reversal_to_distribution)
                read 500-weight 0.95 — the pattern JUST FLIPPED, worth user
                attention; "active" directional labels (sustained_accumulation
                / sustained_distribution / mixed) fall through to base 0.85.
                NO green/red — §0 narrative owns severity. */}
            <h3 className="sub-h sf-head-title">
              Staking flows
              {sfv && sfv.available && sfv.verdict && (
                <span
                  className={`sf-verdict-chip sf-verdict-${sfv.verdict.replace(/_/g, '-')}`}
                  title={sfv.verdictReason || `Staking-flow verdict: ${sfv.verdict}`}
                >
                  {' · '}
                  {sfv.verdict.replace(/_/g, ' ')}
                </span>
              )}
              {sfv && sfv.multiWindowDurability && sfv.multiWindowDurability.available && sfv.multiWindowDurability.verdict && (
                <span
                  className={`mwd-verdict-chip mwd-verdict-${sfv.multiWindowDurability.verdict.replace(/_/g, '-')}`}
                  title={sfv.multiWindowDurability.verdictReason || `Multi-window durability verdict: ${sfv.multiWindowDurability.verdict}`}
                >
                  {' · '}
                  {sfv.multiWindowDurability.verdict.replace(/_/g, ' ')}
                </span>
              )}
            </h3>
            <div className="stats">
              <Stat label="Starting balance" value={`${fmt(gt.startingBalanceTao, 6)} τ`} />
              <Stat label="Transfers in" value={`${fmt(gt.transferInTao, 6)} τ`} />
              <Stat label="Transfers out" value={`${fmt(gt.transferOutTao, 6)} τ`} />
              <Stat label="Current portfolio" value={`${fmt(gt.currentPortfolioTao, 6)} τ`} />
            </div>
            {gt.dailyIncomeTao > 0 && (
              <div className="stats stats-staking-income">
                <Stat
                  label={`Staking income (${gt.effectiveWindowDays}d)`}
                  value={`${fmt(gt.dailyIncomeTao, 4)} τ ($${fmt(gt.dailyIncomeUsd, 2)} · A$${fmt(gt.dailyIncomeAud, 2)})`}
                  cls="pos"
                />
                {Array.isArray(gt.dailyIncomeSeries) && gt.dailyIncomeSeries.length >= 7 && (
                  <div className="staking-income-trend">
                    <div className="lbl">Daily trend</div>
                    <StakingIncomeSparkline series={gt.dailyIncomeSeries} />
                  </div>
                )}
              </div>
            )}
            <p className="hint">
              Formula: <code className="addr small">current + transfer_out − transfer_in − starting</code>.
              Source: Taostats tax-report endpoint — same data the Bittensor weekly FINAL doc uses.
              {' '}{gt.snapshotCount} daily snapshots, {gt.transferCount} transfers.
            </p>
          </>
        ) : (
          <p className="hint">
            Ground-truth PnL unavailable for this coldkey
            {gt?.reason ? ` (${gt.reason})` : ''}. Showing alpha-position PnL only.
          </p>
        )}

        {dd && dd.available && (
          <div className="drawdown-panel">
            <div className="drawdown-head">
              <h3 className="dd-head-title">
                Drawdown &amp; recovery
                {/* iter 196: drawdownVerdict token already computed in
                    lib/report.js (one of at_peak / resilient_absorb / recovered
                    / beyond_historical_tail / flag_worthy / within_typical_stretch
                    / recent_deep_dip / shallow_but_extended / recent_noise /
                    material_dip) and consumed by §0 AI Insights since iter 121,
                    but never rendered to the user. Same "data already computed,
                    never shown" pattern as iter 193 emission chip — surface the
                    label inline next to the §2 header so the user sees the same
                    verdict the AI sees. Tooltip carries verdictReason. Tiered
                    opacity only; severity colour reserved for §0 narrative. */}
                {ddv && ddv.available && ddv.verdict && (
                  <span
                    className={`dd-verdict-chip dd-verdict-${ddv.verdict.replace(/_/g, '-')}`}
                    title={ddv.verdictReason || `Drawdown verdict: ${ddv.verdict}`}
                  >
                    {' · '}
                    {ddv.verdict.replace(/_/g, ' ')}
                  </span>
                )}
              </h3>
              {Array.isArray(dd.series) && dd.series.length > 0 && (
                <CopyCsvButton
                  getCsv={() => buildDrawdownCsv(dd)}
                  coldkey={data.coldkey}
                  filenamePrefix="drawdown"
                  ariaLabel="Copy drawdown series as CSV"
                />
              )}
            </div>
            <div className="dd-row">
              <div className="dd-stat">
                <div className="dd-lbl">Peak balance</div>
                <div className="dd-val">{fmt(dd.allTimePeakTao, 2)} τ</div>
                <div className="dd-sub">{formatShortDate(dd.allTimePeakDate)}</div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Days since peak</div>
                <div className={`dd-val ${dd.isAtAllTimeHigh ? 'pos' : ''}`}>
                  {dd.isAtAllTimeHigh ? 'at ATH' : `${dd.daysSincePeak}d`}
                </div>
                <div className="dd-sub">
                  {dd.isAtAllTimeHigh
                    ? 'all-time high'
                    : `currently ${fmt(dd.currentDrawdownPct * 100, 1)}% off`}
                </div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Max drawdown</div>
                <div className={`dd-val ${dd.maxDrawdownPct >= 0.1 ? 'neg' : ''}`}>
                  −{fmt(dd.maxDrawdownPct * 100, 1)}%
                </div>
                <div className="dd-sub">−{fmt(dd.maxDrawdownTao, 2)} τ peak-to-trough</div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Worst dip window</div>
                <div className="dd-val dd-window">
                  {formatShortDate(dd.maxDrawdownPeakDate)} → {formatShortDate(dd.maxDrawdownTroughDate)}
                </div>
                <div className="dd-sub">
                  {fmt(dd.maxDrawdownPeakTao, 2)} τ → {fmt(dd.maxDrawdownTroughTao, 2)} τ
                </div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Recovery time</div>
                {dd.recoveryDays != null ? (
                  <>
                    <div className="dd-val pos">{dd.recoveryDays}d</div>
                    <div className="dd-sub">
                      recovered {formatShortDate(dd.recoveryDate)}
                    </div>
                  </>
                ) : dd.currentlyUnderwater ? (
                  <>
                    <div className="dd-val neg">{dd.daysUnderwater}d underwater</div>
                    <div className="dd-sub">
                      still below {fmt(dd.maxDrawdownPeakTao, 2)} τ peak
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dd-val">—</div>
                    <div className="dd-sub">no drawdown observed</div>
                  </>
                )}
              </div>
              {dd.underwaterRunCount > 0 && dd.ddDurationP50 != null && (
                <div
                  className="dd-stat"
                  title={`Across ${dd.windowDays}d of daily snapshots, ${dd.underwaterRunCount} contiguous underwater stretch${dd.underwaterRunCount === 1 ? '' : 'es'} (balance below prior running peak). Median (p50) gives typical stretch length; p90 gives the slow-recovery tail. The CURRENT stretch is included if still open. Compare against “Days since peak” above to see if the live dip is shorter, typical, or beyond the historical tail.`}
                >
                  <div className="dd-lbl">Underwater stretches</div>
                  <div className="dd-val dd-window">
                    p50 {dd.ddDurationP50}d · p90 {dd.ddDurationP90}d
                  </div>
                  <div className="dd-sub">
                    max {dd.ddDurationMax}d · {dd.underwaterRunCount} stretch{dd.underwaterRunCount === 1 ? '' : 'es'} over {dd.windowDays}d
                  </div>
                </div>
              )}
            </div>
            {dd.sparkline90d && dd.sparkline90d.str && (
              <div
                className="sparkline-row"
                title={`Last ${dd.sparkline90d.points} daily balance snapshots (drawdown window): ${dd.sparkline90d.firstTao.toFixed(4)} τ (${formatShortDate(dd.sparkline90d.firstDate)}) → ${dd.sparkline90d.lastTao.toFixed(4)} τ (${formatShortDate(dd.sparkline90d.lastDate)}). Min ${dd.sparkline90d.minTao.toFixed(4)} τ · Max ${dd.sparkline90d.maxTao.toFixed(4)} τ. Visualises the dip + recovery shape the stats above describe.`}
              >
                <span className="sparkline-lbl">90d τ</span>
                <span className="sparkline">{dd.sparkline90d.str}</span>
                <span className="sparkline-meta">
                  {dd.sparkline90d.firstTao.toFixed(2)} → {dd.sparkline90d.lastTao.toFixed(2)} τ
                </span>
              </div>
            )}
            {(() => {
              const peak = Number(dd.maxDrawdownPeakTao);
              const trough = Number(dd.maxDrawdownTroughTao);
              const cur = Number(dd.currentTao);
              if (!(peak > 0) || !(trough >= 0) || !(cur >= 0) || !(peak > trough)) {
                return null;
              }
              const span = peak - trough;
              const rawProgress = (cur - trough) / span;
              const recovered = cur >= peak;
              const beyondPct = recovered ? ((cur - peak) / peak) * 100 : 0;
              const fillPct = recovered
                ? 100
                : Math.max(0, Math.min(100, rawProgress * 100));
              const tier = recovered
                ? 'full'
                : fillPct >= 75
                ? 'high'
                : fillPct >= 40
                ? 'mid'
                : 'low';
              const centerLabel = recovered
                ? beyondPct > 1
                  ? `Fully recovered · +${beyondPct.toFixed(1)}% beyond peak`
                  : 'Fully recovered'
                : `${fillPct.toFixed(0)}% recovered from trough`;
              return (
                <div
                  className={`dd-recovery dd-rec-${tier}`}
                  title={`Trough ${fmt(trough, 4)} τ → Current ${fmt(cur, 4)} τ → Peak ${fmt(peak, 4)} τ. ${recovered ? 'Balance has reclaimed (and exceeded) the pre-drawdown peak.' : `Climbed ${fmt(cur - trough, 4)} τ of the ${fmt(span, 4)} τ peak-to-trough gap.`}`}
                >
                  <div className="dd-rec-track">
                    <div
                      className="dd-rec-fill"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <div className="dd-rec-axis">
                    <span className="dd-rec-left">
                      <span className="dd-rec-tic">▼</span>{' '}
                      Trough <strong>{fmt(trough, 2)} τ</strong>
                    </span>
                    <span className="dd-rec-center">{centerLabel}</span>
                    <span className="dd-rec-right">
                      Peak <strong>{fmt(peak, 2)} τ</strong>{' '}
                      <span className="dd-rec-tic">▲</span>
                    </span>
                  </div>
                </div>
              );
            })()}
            <p className="hint">
              Drawdown stats from {dd.pointCount} daily balance snapshots
              ({formatShortDate(dd.firstDate)} → {formatShortDate(dd.lastDate)}).
              Recovery time = days from trough until balance climbed back to the peak.
              Source: Taostats /api/account/history/v1.
            </p>
          </div>
        )}
        {vol && vol.available && (
          <div className="vol-panel">
            <div className="dd-row">
              <div className="dd-stat">
                <div className="dd-lbl">Annualised volatility</div>
                <div className="dd-val">{fmt(vol.annualisedVolPct * 100, 1)}%</div>
                <div className="dd-sub">daily σ {fmt(vol.dailyVolPct * 100, 2)}%</div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Return-per-risk</div>
                <div className={`dd-val ${vol.returnPerRisk != null ? cls(vol.returnPerRisk) : ''}`}>
                  {vol.returnPerRisk != null
                    ? `${vol.returnPerRisk >= 0 ? '+' : ''}${fmt(vol.returnPerRisk, 2)}`
                    : '—'}
                </div>
                <div className="dd-sub">
                  ann. return {vol.annualisedReturnPct != null
                    ? `${vol.annualisedReturnPct >= 0 ? '+' : ''}${fmt(vol.annualisedReturnPct * 100, 1)}%`
                    : '—'} ÷ vol
                </div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Best / worst day</div>
                <div className="dd-val dd-window">
                  <span className="pos">+{fmt(vol.bestDayPct * 100, 1)}%</span>
                  {' / '}
                  <span className="neg">{fmt(vol.worstDayPct * 100, 1)}%</span>
                </div>
                <div className="dd-sub">
                  {formatShortDate(vol.bestDayDate)} / {formatShortDate(vol.worstDayDate)}
                </div>
              </div>
              <div className="dd-stat">
                <div className="dd-lbl">Positive days</div>
                <div className="dd-val">{fmt(vol.positiveDayPct * 100, 0)}%</div>
                <div className="dd-sub">{vol.positiveDayCount}/{vol.returnsCount} sessions</div>
              </div>
            </div>
            {vol.returnsSparkline30d && vol.returnsSparkline30d.str && (
              <div
                className="sparkline-row"
                title={`Last ${vol.returnsSparkline30d.points} daily returns (${formatShortDate(vol.returnsSparkline30d.firstDate)} → ${formatShortDate(vol.returnsSparkline30d.lastDate)}). Worst ${(vol.returnsSparkline30d.minPct * 100).toFixed(2)}% · Best ${(vol.returnsSparkline30d.maxPct * 100).toFixed(2)}%. Symmetric around zero — mid block = flat day, taller = positive return, shorter = negative.`}
              >
                <span className="sparkline-lbl">30d ret</span>
                <span className="sparkline">{vol.returnsSparkline30d.str}</span>
                <span className="sparkline-meta">
                  {(vol.returnsSparkline30d.minPct * 100).toFixed(1)}% / +{(vol.returnsSparkline30d.maxPct * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {Array.isArray(vol.volSeries) && vol.volSeries.length >= 7 && (
              <div className="vol-trend">
                <div className="vol-trend-lbl">30d rolling annualised σ</div>
                <Sparkline
                  series={vol.volSeries}
                  valueKey="sigma"
                  anchor="minmax"
                  titlePrefix="30d rolling annualised σ"
                  valueFmt={(v) => `${(v * 100).toFixed(1)}%`}
                />
              </div>
            )}
            <p className="hint">
              Volatility from {vol.returnsCount} daily-return observations
              over {vol.windowDays}d. Annualised σ ≈ daily σ × √365.
              Return-per-risk ≈ Sharpe with rf=0 (crypto convention).
            </p>
          </div>
        )}
        {vol && vol.available && vol.bestDeltaDay && vol.worstDeltaDay && (
          <div className="bw-day-strip">
            <div className="bw-day bw-day-best" title={`Best day: balance grew from ${vol.bestDeltaDay.prevBalanceTao.toFixed(4)} τ to ${vol.bestDeltaDay.balanceTao.toFixed(4)} τ (+${vol.bestDeltaDay.deltaTao.toFixed(4)} τ in one snapshot).`}>
              <span className="bw-day-icon">🚀</span>
              <div className="bw-day-body">
                <div className="bw-day-lbl">Best day</div>
                <div className="bw-day-val">+{fmt(vol.bestDeltaDay.deltaTao, 4)} τ</div>
                <div className="bw-day-sub">{formatShortDate(vol.bestDeltaDay.date)}</div>
              </div>
            </div>
            <div className="bw-day bw-day-worst" title={`Worst day: balance dropped from ${vol.worstDeltaDay.prevBalanceTao.toFixed(4)} τ to ${vol.worstDeltaDay.balanceTao.toFixed(4)} τ (${vol.worstDeltaDay.deltaTao.toFixed(4)} τ in one snapshot).`}>
              <span className="bw-day-icon">🩸</span>
              <div className="bw-day-body">
                <div className="bw-day-lbl">Worst day</div>
                <div className="bw-day-val">{fmt(vol.worstDeltaDay.deltaTao, 4)} τ</div>
                <div className="bw-day-sub">{formatShortDate(vol.worstDeltaDay.date)}</div>
              </div>
            </div>
          </div>
        )}

        <p className="sub-h">Alpha-position breakdown</p>
        <div className="stats">
          <Stat label="Spent on α" value={`${fmt(pnl.spentTao)} τ`} />
          <Stat label="Sold α" value={`${fmt(pnl.soldTao)} τ`} />
          <Stat label="α value now" value={`${fmt(pnl.currentTao)} τ`} />
          <Stat
            label="α PnL"
            value={`${fmt(pnl.totalPnlTao)} τ ($${fmt(pnl.totalPnlUsd, 0)})`}
            cls={cls(pnl.totalPnlTao)}
          />
        </div>
        <div className="stats">
          <Stat
            label="α 24h"
            value={`${fmt(pnl.change24hTao)} τ ($${fmt(pnl.change24hUsd, 0)})`}
            cls={cls(pnl.change24hTao)}
          />
          <Stat
            label="α 7d"
            value={`${fmt(pnl.change7dTao)} τ ($${fmt(pnl.change7dUsd, 0)})`}
            cls={cls(pnl.change7dTao)}
          />
          <Stat
            label="α 30d"
            value={`${fmt(pnl.change30dTao)} τ ($${fmt(pnl.change30dUsd, 0)})`}
            cls={cls(pnl.change30dTao)}
          />
        </div>
        <p className="hint">
          {pnl.eventsCount} delegation events analysed (alpha-trading-only PnL, complements
          the ground-truth balance-based number above).
        </p>

        {Array.isArray(pnl.perSubnet) && pnl.perSubnet.length > 0 && (() => {
          const ps = pnl.perSubnet;
          let pnlSumCurrent = 0;
          let pnlSumSpent = 0;
          let pnlSumSold = 0;
          let pnlSumPnl = 0;
          for (const s of ps) {
            pnlSumCurrent += s.currentTao || 0;
            pnlSumSpent += s.spentTao || 0;
            pnlSumSold += s.soldTao || 0;
            pnlSumPnl += s.pnlTao || 0;
          }
          return (
          <>
            <div className="pnl-attrib-head">
              <h3 className="sub-h">Per-subnet PnL attribution</h3>
              <CopyCsvButton
                getCsv={() => buildPnlAttribCsv(pnl.perSubnet)}
                coldkey={data.coldkey}
                filenamePrefix="pnl-attribution"
                ariaLabel="Copy per-subnet PnL attribution as CSV"
              />
            </div>
            <table className="pnl-attrib-table">
              <thead>
                <tr>
                  <th>Subnet</th>
                  <th>α value now</th>
                  <th>Spent</th>
                  <th>Sold</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {pnl.perSubnet
                  .filter((s) => Math.abs(s.pnlTao) >= 0.001 || s.currentTao > 0.001)
                  .slice(0, 5)
                  .map((s) => (
                    <tr key={`win-${s.netuid}`}>
                      <td>sn{s.netuid} {s.name}</td>
                      <td>{fmt(s.currentTao, 3)} τ</td>
                      <td>{fmt(s.spentTao, 3)} τ</td>
                      <td>{fmt(s.soldTao, 3)} τ</td>
                      <td className={cls(s.pnlTao)}>
                        {s.pnlTao >= 0 ? '+' : ''}{fmt(s.pnlTao, 4)} τ
                        <PnlTrendChip pct7d={s.pct7d} />
                      </td>
                    </tr>
                  ))}
                {(() => {
                  const losers = pnl.perSubnet
                    .filter((s) => s.pnlTao < -0.001)
                    .slice(-3)
                    .reverse();
                  if (losers.length === 0) return null;
                  return losers.map((s) => (
                    <tr key={`lose-${s.netuid}`} className="loser-row">
                      <td>sn{s.netuid} {s.name}</td>
                      <td>{fmt(s.currentTao, 3)} τ</td>
                      <td>{fmt(s.spentTao, 3)} τ</td>
                      <td>{fmt(s.soldTao, 3)} τ</td>
                      <td className={cls(s.pnlTao)}>
                        {fmt(s.pnlTao, 4)} τ
                        <PnlTrendChip pct7d={s.pct7d} />
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
              <tfoot>
                <tr className="tfoot-totals">
                  <td>
                    <span
                      className="tfoot-lbl"
                      title={`Grand total summed across all ${ps.length} subnets in the full perSubnet array — should reconcile with the §4 stats grid above.`}
                    >
                      Total ({ps.length} sn)
                    </span>
                  </td>
                  <td>{fmt(pnlSumCurrent, 3)} τ</td>
                  <td>{fmt(pnlSumSpent, 3)} τ</td>
                  <td>{fmt(pnlSumSold, 3)} τ</td>
                  <td className={cls(pnlSumPnl)}>
                    {pnlSumPnl >= 0 ? '+' : ''}{fmt(pnlSumPnl, 4)} τ
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="hint">
              Top 5 contributors + bottom 3 detractors (subnets with PnL impact ≥ 0.001 τ). Computed from delegation history × current α value. Totals row sums every subnet ever held (not just the visible 8).
            </p>
          </>
          );
        })()}
      </Section>

      <Section n="3" title="Yield">
        {/* iter 199: annualVsApyVerdict token chip surfaces inline next to a new
            §3 "Realised vs structural" h3 sub-header. The 3-label verdict
            (far_above_structural / roughly_structural / below_structural)
            compares the wallet's IMPLIED ANNUALISED RETURN (from realised
            window PnL) to the weighted-APY structural rate. Has been computed
            by lib/report.js pnlDecomposition() since iter ~115 and consumed by
            §0 AI Insights via lib/ai-insights.js (line 192 — "gap ±Xpp →
            verdict") but never rendered to the user. SEVENTH iter in the
            surface-symmetry sweep (validatorConcentration iter 192,
            EMISSION_ALIGNMENT chips iter 193+194+195, drawdownVerdict iter 196,
            stakingFlowVerdict iter 197, multiWindowDurabilityVerdict iter 198,
            annualVsApyVerdict iter 199), completes the major-verdict pass.
            Producer at lib/report.js:465 (3 thresholds: gap > 20pp →
            far_above_structural, gap < -10pp → below_structural, else
            roughly_structural). Payload at pnlDecomp top-level per line 2839.
            verdictReason not produced server-side — synthesized inline from
            pnlDec fields (impliedAnnualReturn / weightedApy / gap). Three
            opacity tiers: "quiet" roughly_structural reads italic 0.7 (this
            IS the expected state, no signal); "active" far_above_structural
            falls through to base 0.85 (positive, doesn't need alarm — high
            return is good but call out it's a windfall not yield-driven);
            "cautionary" below_structural reads 500-weight 0.95 (yield not
            landing at structural rate is the one label worth user eyes).
            NO green/red — §0 narrative owns severity. */}
        {pnlDec && pnlDec.available && pnlDec.annualVsApyVerdict && (
          <h3 className="sub-h aav-head-title">
            Realised vs structural
            <span
              className={`aav-verdict-chip aav-verdict-${pnlDec.annualVsApyVerdict.replace(/_/g, '-')}`}
              title={(() => {
                const imp = pnlDec.impliedAnnualReturn != null ? `${(pnlDec.impliedAnnualReturn * 100).toFixed(1)}%` : '—';
                const apy = pnlDec.weightedApy != null ? `${(pnlDec.weightedApy * 100).toFixed(1)}%` : '—';
                const gap = pnlDec.annualVsApyGapPp != null ? `${pnlDec.annualVsApyGapPp >= 0 ? '+' : ''}${pnlDec.annualVsApyGapPp.toFixed(1)}pp` : '—';
                const explain =
                  pnlDec.annualVsApyVerdict === 'far_above_structural'
                    ? 'gap > +20pp — non-yield drivers (price tailwind, windfall) carried return above structural; treat headline as non-repeatable'
                    : pnlDec.annualVsApyVerdict === 'below_structural'
                    ? 'gap < -10pp — yield delivery dragged by price headwinds, fee leakage, or sub-optimal validators; structural rate not landing'
                    : 'gap within -10pp to +20pp band — realised annualised return tracking structural yield as expected';
                return `realised annualised return ${imp} vs weighted APY ${apy} (gap ${gap}) — ${explain}`;
              })()}
            >
              {' · '}
              {pnlDec.annualVsApyVerdict.replace(/_/g, ' ')}
            </span>
          </h3>
        )}
        <div className="stats">
          <Stat
            label="Weighted APY"
            value={y.weightedApy != null ? `${fmt(y.weightedApy * 100, 2)}%` : '—'}
          />
          <Stat label="Coverage" value={`${fmt(y.coverage * 100, 0)}%`} />
          {y.best && (
            <Stat label="Best" value={`sn${y.best.netuid} @ ${fmt(y.best.apy * 100, 2)}%`} />
          )}
          {y.worst && (
            <Stat label="Worst" value={`sn${y.worst.netuid} @ ${fmt(y.worst.apy * 100, 2)}%`} />
          )}
        </div>

        {/* iter 201: apyTrendVerdict token chip surfaces inline next to a new
            §3 "APY trend" h3 sub-header, placed between the Weighted APY stats
            grid and the existing .weighted-apy-trend mini-chart. The 9-label
            verdict from lib/report.js apyTrendVerdict() (accelerating_climb /
            accelerating_fade / peaking / recovering / climbing / fading /
            recent_lift / recent_dip / stable) classifies the weighted-APY
            trajectory across the 30d/7d/1d window triple — has been computed
            by lib/report.js:498 since iter 119 and consumed by §0 AI Insights
            via lib/ai-insights.js:267 ("Verdict: {verdict} — {verdictReason}"),
            but never rendered to the user. NINTH iter in the surface-symmetry
            sweep across major verdict classifiers (validatorConcentration
            iter 192, EMISSION_ALIGNMENT chips iter 193+194+195, drawdownVerdict
            iter 196, stakingFlowVerdict iter 197, multiWindowDurabilityVerdict
            iter 198, annualVsApyVerdict iter 199, pnlDecomp.verdict iter 200,
            apyTrendVerdict iter 201). Payload at apyTrend top-level per
            lib/report.js:2840. verdictReason per branch carries the threshold-
            citing rationale verbatim (lines 532/535/538/541/544/547/550/553/
            556) — chip title=apyt.verdictReason directly (same iter 196/197/
            198/200 pattern where the user sees the same threshold the AI sees).
            Three opacity tiers: "quiet" stable reads italic 0.7 (yield is
            flat — no signal worth narrating); "cautionary" deteriorating
            labels (fading / accelerating_fade / recent_dip / peaking) read
            500-weight 0.95 — APY decline is the actionable signal worth user
            eyes; "active" positive-motion labels (climbing / accelerating_climb
            / recovering / recent_lift) fall through to base 0.85 — yield
            building is positive context but not warning. NO green/red — §0
            narrative owns severity. Surface placement: between .stats grid
            and .weighted-apy-trend mini-chart — chip is the verdict header
            for the chart that follows (verdict then visual proof). */}
        {apyt && apyt.available && apyt.verdict && (
          <h3 className="sub-h apyt-head-title">
            APY trend
            <span
              className={`apyt-verdict-chip apyt-verdict-${apyt.verdict.replace(/_/g, '-')}`}
              title={apyt.verdictReason || `APY trend verdict: ${apyt.verdict}`}
            >
              {' · '}
              {apyt.verdict.replace(/_/g, ' ')}
            </span>
          </h3>
        )}

        {(() => {
          const series = Array.isArray(y.weightedApySeries) ? y.weightedApySeries : [];
          if (series.length < 2) return null;
          const baseline = series.find((r) => r.label === '30d')?.value ?? series[0].value;
          const values = series.map((r) => r.value);
          const max = Math.max(...values);
          const titleParts = series.map((r) => `${r.label} ${(r.value * 100).toFixed(2)}%`);
          const recent = series[series.length - 1];
          const direction =
            baseline > 0
              ? (recent.value - baseline) / baseline > 0.02
                ? 'up'
                : (recent.value - baseline) / baseline < -0.02
                ? 'down'
                : 'flat'
              : 'flat';
          const arrow = direction === 'up' ? '↗' : direction === 'down' ? '↘' : '→';
          return (
            <div
              className={`weighted-apy-trend weighted-apy-${direction}`}
              title={`Weighted APY trend · ${titleParts.join(' · ')}`}
            >
              <span className="wat-lbl">Weighted APY trend</span>
              <div className="wat-bars">
                {series.map((r) => {
                  const heightPct = max > 0 ? (r.value / max) * 100 : 0;
                  const tier =
                    r.value > baseline * 1.02
                      ? 'up'
                      : r.value < baseline * 0.98
                      ? 'down'
                      : 'flat';
                  return (
                    <div key={r.label} className="wat-bar-col">
                      <div className="wat-bar-wrap">
                        <div
                          className={`wat-bar wat-bar-${tier}`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <div className="wat-bar-val">{(r.value * 100).toFixed(1)}%</div>
                      <div className="wat-bar-lbl">{r.label}</div>
                    </div>
                  );
                })}
              </div>
              <span className={`wat-arrow wat-arrow-${direction}`}>{arrow}</span>
            </div>
          );
        })()}

        {y.liftIfOptimised != null && y.liftIfOptimised > 0.02 && (
          <p className="yield-lift">
            ↗ Re-delegating each position to the best validator on its subnet would lift weighted APY by{' '}
            <strong>+{fmt(y.liftIfOptimised * 100, 2)}pp</strong>{' '}
            (to {fmt(y.bestCaseWeightedApy * 100, 2)}%).
          </p>
        )}

        {(() => {
          // Filter out dust positions (< 0.01 τ exposure ≈ <$3) so chip titles
          // don't show "0.00 α held · ≈ 0.0000 τ/yr" — meaningless as a "top yielder".
          const DUST_TAO = 0.01;
          const candidates = (y.perPosition || [])
            .filter((p) => {
              if (p.apy == null || p.apy <= 0 || !(p.alphaTokens > 0)) return false;
              const priceTao = Number(p.alphaPriceTao || subnetLookup.get(p.netuid)?.priceTao || 0);
              return p.alphaTokens * priceTao >= DUST_TAO;
            })
            .slice()
            .sort((a, b) => b.apy - a.apy)
            .slice(0, 3);
          if (candidates.length < 2) return null;
          return (
            <div className="top-apy-strip">
              <div className="top-apy-head">
                <span className="top-apy-lbl">🏆 Top yielders</span>
                <span className="top-apy-sub">your highest-APY positions — earning most per α held</span>
              </div>
              <div className="top-apy-chips">
                {candidates.map((p) => {
                  const apyPct = p.apy * 100;
                  const validatorShort = p.validatorName
                    ? p.validatorName
                    : p.hotkey
                    ? `${p.hotkey.slice(0, 6)}…${p.hotkey.slice(-4)}`
                    : '—';
                  const priceTao = Number(p.alphaPriceTao || subnetLookup.get(p.netuid)?.priceTao || 0);
                  const taoPerYr = p.alphaTokens * priceTao * p.apy;
                  const titleParts = [
                    `sn${p.netuid} ${p.subnetName || ''}`.trim(),
                    `validator: ${validatorShort}`,
                    `${apyPct.toFixed(2)}% APY${p.apyIsFallback ? ' (subnet median — your validator not in response)' : ''}`,
                    `${p.alphaTokens.toFixed(2)} α held`,
                    taoPerYr > 0 ? `≈ ${taoPerYr.toFixed(4)} τ/yr at current price` : null,
                  ].filter(Boolean);
                  return (
                    <a
                      key={`${p.netuid}-${p.hotkey || p.subnetName || ''}`}
                      className="top-apy-chip"
                      href={`https://taostats.io/subnets/${p.netuid}/metagraph`}
                      title={titleParts.join(' · ')}
                    >
                      <span className="a-sn">sn{p.netuid}</span> {p.subnetName || `Subnet ${p.netuid}`}{' '}
                      <span className="a-apy">{apyPct.toFixed(1)}%</span>
                      {p.apyIsFallback && <span className="a-fb">~</span>}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {Array.isArray(y.perPosition) && y.perPosition.length > 0 && (() => {
          const renderedRows = y.perPosition
            .slice()
            .sort((a, b) => b.alphaTokens - a.alphaTokens)
            .slice(0, 10);
          // Aggregate totals across rendered rows for tfoot row.
          let sumAlpha = 0;
          let yWApyNum = 0;
          let yWApyDen = 0;
          let yTotalTaoYr = 0;
          let yCovered = 0;
          for (const p of renderedRows) {
            sumAlpha += p.alphaTokens || 0;
            if (p.apy != null && Number.isFinite(p.apy) && p.alphaTokens > 0) {
              yWApyNum += p.apy * p.alphaTokens;
              yWApyDen += p.alphaTokens;
              if (p.alphaPriceTao > 0) {
                yTotalTaoYr += p.alphaTokens * p.alphaPriceTao * p.apy;
              }
              yCovered += 1;
            }
          }
          const yWApy = yWApyDen > 0 ? yWApyNum / yWApyDen : null;
          return (
          <>
            <div className="yield-head">
              <h3 className="sub-h">Per-validator breakdown</h3>
              <CopyCsvButton
                getCsv={() => buildYieldCsv(y.perPosition)}
                coldkey={data.coldkey}
                filenamePrefix="yield"
                ariaLabel="Copy per-validator yield as CSV"
              />
            </div>
            <table className="yield-table">
              <thead>
                <tr>
                  <th>Subnet</th>
                  <th>Validator</th>
                  <th>α held</th>
                  <th>APY</th>
                  <th>Subnet best</th>
                  <th>Δ to best</th>
                </tr>
              </thead>
              <tbody>
                {renderedRows.map((p, i) => {
                    const apyPct = p.apy != null ? `${fmt(p.apy * 100, 2)}%` : '—';
                    const bestPct =
                      p.subnetBestApy != null ? `${fmt(p.subnetBestApy * 100, 2)}%` : '—';
                    // iter 192: surface subnet field shape (median + validator
                    // count) under the "Subnet best" cell so the user reads
                    // best as outlier-or-par against a typed field, not an
                    // absolute target. Δ to best stays the actionable column;
                    // the median line is anchoring context for the gap.
                    const medianPct =
                      p.subnetMedianApy != null
                        ? `${fmt(p.subnetMedianApy * 100, 2)}%`
                        : null;
                    const fieldValStr =
                      p.subnetValidatorCount > 0
                        ? `${p.subnetValidatorCount} val`
                        : null;
                    const deltaPp =
                      p.deltaToBest != null ? p.deltaToBest * 100 : null;
                    const deltaStr =
                      deltaPp != null
                        ? `${deltaPp >= 0 ? '+' : ''}${fmt(deltaPp, 2)}pp`
                        : '—';
                    const deltaCls =
                      deltaPp == null
                        ? ''
                        : deltaPp <= -5
                        ? 'neg-strong'
                        : deltaPp <= -1
                        ? 'neg'
                        : 'pos';
                    const validatorShort = p.validatorName
                      ? p.validatorName
                      : p.hotkey
                      ? `${p.hotkey.slice(0, 6)}…${p.hotkey.slice(-4)}`
                      : '—';
                    return (
                      <tr key={`${p.netuid}-${p.hotkey || i}`}>
                        <td>
                          sn{p.netuid} {p.subnetName}
                          {(() => {
                            // iter 195: symmetric emission chip in §3 yield-table
                            // subnet column, mirrors the §1 portfolio chip from
                            // iter 193 (reframed iter 194 with snapshot caveat).
                            // Same fields, same tier classifier, same (epoch)
                            // glyph so both surfaces teach the same per-epoch
                            // semantics: tao.app screener emission_pct is a
                            // snapshot (Yuma rotates per ~72min tempo), not a
                            // sustained metric.
                            if (p.emissionPct == null || !Number.isFinite(p.emissionPct)) return null;
                            const tier =
                              p.emissionPct >= 1.0 ? 'emit-high'
                              : p.emissionPct === 0 ? 'emit-off-epoch'
                              : 'emit-fair';
                            const tierLabel =
                              tier === 'emit-high' ? 'above 1.0% high-emission threshold in this epoch snapshot (≈1.3× fair share of 1/128)'
                              : tier === 'emit-off-epoch' ? 'no emission share in this epoch snapshot — Yuma consensus rotates validator weight per ~72min tempo, over 24h most active subnets receive some share'
                              : 'below the 1.0% high-emission threshold but above zero in this epoch snapshot';
                            return (
                              <span
                                className={`subnet-emit-chip ${tier}`}
                                title={`Network emission share for sn${p.netuid}: ${p.emissionPct.toFixed(2)}% — ${tierLabel}. tao.app screener emission_pct is a per-epoch SNAPSHOT (sums to 100 across subnets; rotates per ~72min Yuma tempo); fair share at 128 subnets ≈ 0.78%. Read as "this epoch" not "sustained".`}
                              >
                                {' · '}{p.emissionPct.toFixed(2)}% emit (epoch)
                              </span>
                            );
                          })()}
                        </td>
                        <td title={p.hotkey || ''}>{validatorShort}</td>
                        <td>{fmt(p.alphaTokens, 2)}</td>
                        <td>
                          {apyPct}
                          {p.apyIsFallback && (
                            <span className="apy-fallback" title="Specific validator not in yield response — using subnet median">
                              {' '}
                              ~
                            </span>
                          )}
                          {(() => {
                            // iter 130: visual surfacing of the 1h × 1d × 7d × 30d yield quartet
                            // (KB iter 128, deterministic §0 iter 129). Subnet-median fallback
                            // rows are skipped — single-snapshot noise per iter 116.
                            if (p.apyIsFallback) return null;
                            if (p.apy7d == null || p.apy30d == null) return null;
                            const a1h = p.apy1h;
                            const a1d = p.apy1d;
                            const a7d = p.apy7d;
                            const a30d = p.apy30d;
                            const isStray = (x) => {
                              if (x == null) return false;
                              const off7 = a7d > 0 && (x > a7d * 2 || x < a7d * 0.4);
                              const off30 = a30d > 0 && (x > a30d * 2 || x < a30d * 0.4);
                              return off7 && off30;
                            };
                            const stray1h = isStray(a1h);
                            const stray1d = isStray(a1d);
                            let dirCls = 'qw-stable';
                            let dirLbl = 'stable';
                            if (a30d > 0) {
                              const ratio = a7d / a30d;
                              if (ratio >= 1.15) { dirCls = 'qw-improving'; dirLbl = 'improving (7d>30d)'; }
                              else if (ratio <= 0.85) { dirCls = 'qw-regressing'; dirLbl = 'regressing (7d<30d)'; }
                            }
                            const fmtPct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
                            const title =
                              `1h × 1d × 7d × 30d yield quartet. ` +
                              `7d = planning window, 30d = durability check. ` +
                              `Direction: ${dirLbl}. ` +
                              `Greyed windows are stray-epoch sampling artefacts (KB iter 128) — ignore.`;
                            return (
                              <div className="apy-quartet" title={title}>
                                <span className={`qw ${stray1h ? 'qw-stray' : ''}`}>
                                  <span className="qw-lbl">1h</span>
                                  <span className="qw-val">{fmtPct(a1h)}</span>
                                </span>
                                <span className={`qw ${stray1d ? 'qw-stray' : ''}`}>
                                  <span className="qw-lbl">1d</span>
                                  <span className="qw-val">{fmtPct(a1d)}</span>
                                </span>
                                <span className={`qw ${dirCls}`}>
                                  <span className="qw-lbl">7d</span>
                                  <span className="qw-val">{fmtPct(a7d)}</span>
                                </span>
                                <span className="qw">
                                  <span className="qw-lbl">30d</span>
                                  <span className="qw-val">{fmtPct(a30d)}</span>
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          {bestPct}
                          {medianPct && fieldValStr && (
                            <span
                              className="subnet-field"
                              title={`Subnet field across ${p.subnetValidatorCount} validators: best ${bestPct}, median ${medianPct}. Read Δ to best in context — a gap to best on a thin field (median ≈ best) is real lift; on a wide field where median sits below you, "best" is an outlier and the lift may not sustain.`}
                            >
                              <br />
                              <span className="field-lbl">median</span>{' '}
                              <span className="field-val">{medianPct}</span>
                              {' · '}
                              <span className="field-lbl">{fieldValStr}</span>
                            </span>
                          )}
                        </td>
                        <td className={`yield-delta ${deltaCls}`}>
                          {deltaStr}
                          {(() => {
                            if (p.deltaToBest == null || p.deltaToBest >= 0) return null;
                            if (!(p.alphaTokens > 0) || !(p.alphaPriceTao > 0)) return null;
                            const liftTaoPerYr = p.alphaTokens * p.alphaPriceTao * Math.abs(p.deltaToBest);
                            if (!Number.isFinite(liftTaoPerYr) || liftTaoPerYr < 0.001) return null;
                            return (
                              <span
                                className="yield-lift-chip"
                                title={`Re-delegating this row to the best validator on sn${p.netuid} would lift earnings by ≈ ${liftTaoPerYr.toFixed(4)} τ/yr at current α price (${p.alphaTokens.toFixed(2)} α × ${p.alphaPriceTao.toFixed(6)} τ/α × ${(Math.abs(p.deltaToBest) * 100).toFixed(2)}pp).`}
                              >
                                {' '}+{fmt(liftTaoPerYr, 3)} τ/yr
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="tfoot-totals">
                  <td><span className="tfoot-lbl">Total ({renderedRows.length} val)</span></td>
                  <td></td>
                  <td>{fmt(sumAlpha, 2)}</td>
                  <td>
                    {yWApy != null ? (
                      <div
                        className="apy-chip apy-chip-foot"
                        title={`Alpha-weighted APY across ${yCovered} of ${renderedRows.length} rendered validators: ${(yWApy * 100).toFixed(2)}%${yTotalTaoYr > 0 ? ` · ≈ ${yTotalTaoYr.toFixed(4)} τ/yr at current α prices.` : '.'}`}
                      >
                        <span className="apy-lbl">Σ APY</span>{' '}
                        <span className="apy-val">{(yWApy * 100).toFixed(2)}%</span>
                        {yTotalTaoYr > 0 && (
                          <>
                            {' '}
                            <span className="apy-yr">· {yTotalTaoYr.toFixed(4)} τ/yr</span>
                          </>
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <p className="hint">
              Δ to best shows how far each validator is behind the best validator on the same subnet (in percentage points). Negative values are re-delegation opportunities — green chip beside the Δ shows the τ/yr lift you'd capture at current alpha levels.
            </p>
          </>
          );
        })()}

        {Array.isArray(y.delegationOpportunities) && y.delegationOpportunities.length > 0 && (
          <>
            <h3 className="sub-h">↻ Delegation opportunities ({y.delegationOpportunities.length})</h3>
            <ul className="deleg-ops">
              {y.delegationOpportunities.slice(0, 5).map((p, i) => (
                <li key={i}>
                  <strong>sn{p.netuid} {p.subnetName}</strong>: your validator yields{' '}
                  {fmt(p.apy * 100, 2)}% vs subnet best {fmt(p.subnetBestApy * 100, 2)}%
                  (Δ {fmt(p.deltaToBest * 100, 2)}pp). Re-delegating could add roughly{' '}
                  {fmt(p.potentialLiftTaoPerYear, 4)} τ/yr at current alpha levels.
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section n="4" title={`Flags (${f.length})`}>
        {f.length === 0 ? (
          <p className="empty">No rule-based flags. Portfolio looks balanced.</p>
        ) : (
          <ul className="flags">
            {f.map((flag, i) => (
              <li key={i} className={`flag ${flag.severity}`}>
                <span className="badge">{flag.severity}</span> {flag.message}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n="5" title="Recommendations">
        {r.items.length > 1 ? (
          <>
            <div className="top-rec-banner">
              <div className="top-rec-tag">🎯 Top action</div>
              <div className="top-rec-obs">{r.items[0].observation}</div>
              <div className="top-rec-act">→ {r.items[0].action}</div>
            </div>
            <h3 className="sub-h">Other recommendations</h3>
            <ol className="recs" start={2}>
              {r.items.slice(1).map((it, i) => (
                <li key={i + 1}>
                  <div className="obs">{it.observation}</div>
                  <div className="act">→ {it.action}</div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <ol className="recs">
            {r.items.map((it, i) => (
              <li key={i}>
                <div className="obs">{it.observation}</div>
                <div className="act">→ {it.action}</div>
              </li>
            ))}
          </ol>
        )}
        <p className="disclaimer">{r.disclaimer}</p>
      </Section>

      <Section n="6" title="Broader market">
        <div className="stats">
          <Stat label="TAO/USD" value={`$${fmt(b.taoPrice, 2)}`} />
          <Stat label="Subnets" value={b.subnetCount} />
        </div>
        {b.marketContext && (() => {
          const mc = b.marketContext;
          const pc = b.portfolioContext;
          const pctCls = (v) => v == null ? '' : v > 0 ? 'mc-up' : v < 0 ? 'mc-down' : '';
          const breadthCls = (b) => b == null ? '' : b > 55 ? 'mc-up' : b < 45 ? 'mc-down' : '';
          const breadthLbl = (b) => b == null ? '—' : b > 55 ? 'risk-on' : b < 45 ? 'risk-off' : 'mixed';
          const fmtPctSigned = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
          // Comparison hint: market median vs portfolio median 24h. Lets the
          // tooltip on the "You" row say "leaning with the market" or "bucking
          // the trend" without making the reader subtract two numbers.
          const leanLabel = (() => {
            if (!pc || mc.median24hPct == null || pc.median24hPct == null) return null;
            const diff = pc.median24hPct - mc.median24hPct;
            if (Math.abs(diff) < 0.1) return 'in line with market';
            return `${diff > 0 ? 'outperforming' : 'underperforming'} market by ${Math.abs(diff).toFixed(2)} pts`;
          })();
          return (
            <div className="market-context-block">
              <div className="market-context-strip mc-row-market" title={`Market snapshot across ${mc.tradeableCount} tradeable subnets (>1τ daily volume). ${mc.greenCount} up vs ${mc.redCount} down on 24h. Median centres the typical subnet day — frames whether any single pct figure below is unusual or routine.`}>
                <div className="mc-rowlbl">Market</div>
                <div className="mc-cell">
                  <div className="mc-lbl">Tradeable</div>
                  <div className="mc-val">{mc.tradeableCount}<span className="mc-sub">/ {mc.totalActive}</span></div>
                </div>
                <div className="mc-cell">
                  <div className="mc-lbl">Median 24h</div>
                  <div className={`mc-val ${pctCls(mc.median24hPct)}`}>{fmtPctSigned(mc.median24hPct)}</div>
                </div>
                <div className="mc-cell">
                  <div className="mc-lbl">Median 24h vol</div>
                  <div className="mc-val">{mc.median24hVolumeTao == null ? '—' : `${fmt(mc.median24hVolumeTao, 0)} τ`}</div>
                </div>
                <div className="mc-cell">
                  <div className="mc-lbl">Breadth</div>
                  <div className={`mc-val ${breadthCls(mc.breadth)}`}>{mc.greenCount}↑ {mc.redCount}↓<span className="mc-sub"> · {breadthLbl(mc.breadth)}</span></div>
                </div>
              </div>
              {pc && (
                <div className="market-context-strip mc-row-portfolio" title={`Same 4 metrics over YOUR ${pc.positionCount} positions (${pc.coveredCount} with 24h price data). ${pc.greenCount} up vs ${pc.redCount} down today.${leanLabel ? ` You are ${leanLabel}.` : ''}`}>
                  <div className="mc-rowlbl mc-rowlbl-you">Your holdings</div>
                  <div className="mc-cell">
                    <div className="mc-lbl">Positions</div>
                    <div className="mc-val">{pc.positionCount}{pc.coveredCount < pc.positionCount && <span className="mc-sub">/ {pc.coveredCount} priced</span>}</div>
                  </div>
                  <div className="mc-cell">
                    <div className="mc-lbl">Median 24h</div>
                    <div className={`mc-val ${pctCls(pc.median24hPct)}`}>
                      {fmtPctSigned(pc.median24hPct)}
                      {leanLabel && <span className="mc-sub mc-lean"> · {leanLabel.startsWith('out') ? '↗ outperf' : leanLabel.startsWith('under') ? '↘ underperf' : '= in line'}</span>}
                    </div>
                  </div>
                  <div className="mc-cell">
                    <div className="mc-lbl">Median pos τ</div>
                    <div className="mc-val">{pc.medianPositionValueTao == null ? '—' : `${fmt(pc.medianPositionValueTao, 3)} τ`}</div>
                  </div>
                  <div className="mc-cell">
                    <div className="mc-lbl">Breadth</div>
                    <div className={`mc-val ${breadthCls(pc.breadth)}`}>{pc.greenCount}↑ {pc.redCount}↓<span className="mc-sub"> · {breadthLbl(pc.breadth)}</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <CopyCsvButton
          getCsv={() => buildBroaderMarketCsv(b)}
          coldkey={data.coldkey}
          filenamePrefix="broader-market"
          ariaLabel="Copy broader market as CSV"
        />
        <h3 className="sub-h">Biggest 24h movers</h3>
        {(() => {
          const moversMaxAbs1d = Math.max(...b.topMovers24h.map((x) => Math.abs(x.pct1d || 0)), 0);
          // 7d heat normalised over THIS table's 7d values only — keeps the
          // colour gradient internally calibrated (the 7d movers table below
          // has its own — a 50% week in here may colour mid, not extreme).
          const moversMaxAbs7d = Math.max(...b.topMovers24h.map((x) => Math.abs(x.pct7d || 0)), 0);
          const moversMaxVol = Math.max(...b.topMovers24h.map((x) => x.volumeTao24h || 0), 0);
          return (
            <div className="tbl-scroll">
              <table className="tbl tbl-heatmap">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subnet</th>
                    <th className="num">Price (τ)</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                    <th className="num">Volume (τ)</th>
                  </tr>
                </thead>
                <tbody>
                  {b.topMovers24h.map((m) => {
                    const rgb1 = (m.pct1d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                    const rgb7 = (m.pct7d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                    // Day-vs-week narrative hint: green 24h + red 7d = bounce
                    // off weekly low, red 24h + green 7d = pullback in uptrend,
                    // same sign = trend continuation. Cheap text annotation
                    // surfaces the relationship without another column.
                    const sameSign = m.pct7d != null &&
                      ((m.pct1d > 0 && m.pct7d > 0) || (m.pct1d < 0 && m.pct7d < 0));
                    const oppSign = m.pct7d != null &&
                      ((m.pct1d > 0 && m.pct7d < 0) || (m.pct1d < 0 && m.pct7d > 0));
                    const trendHint = sameSign
                      ? (m.pct1d > 0 ? 'week-long rally' : 'week-long bleed')
                      : oppSign
                        ? (m.pct1d > 0 ? 'bounce off weekly low' : 'pullback in uptrend')
                        : null;
                    return (
                      <tr key={m.netuid} title={trendHint ? `Day shape vs week shape: ${trendHint}.` : undefined}>
                        <td>{m.netuid}</td>
                        <td>
                          <SubnetLink
                            netuid={m.netuid}
                            name={m.name}
                            info={subnetLookup.get(m.netuid)}
                            href={`https://taostats.io/subnets/${m.netuid}/metagraph`}
                          />
                        </td>
                        <td className="num">{fmt(m.priceTao, 6)}</td>
                        <td className={`num heat ${cls(m.pct1d)}`} style={heatBg(m.pct1d, moversMaxAbs1d, rgb1)}>{fmtPct(m.pct1d)}</td>
                        <td className={`num heat ${cls(m.pct7d)}`} style={heatBg(m.pct7d, moversMaxAbs7d, rgb7)}>{m.pct7d == null ? '—' : fmtPct(m.pct7d)}</td>
                        <td className="num heat" style={heatBg(m.volumeTao24h, moversMaxVol, HEAT_ORANGE)}>{fmt(m.volumeTao24h, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        {b.topMovers7d && b.topMovers7d.length > 0 && (() => {
          const moversMaxAbs7d = Math.max(...b.topMovers7d.map((x) => Math.abs(x.pct7d || 0)), 0);
          const moversMaxAbs1d = Math.max(...b.topMovers7d.map((x) => Math.abs(x.pct1d || 0)), 0);
          return (
            <>
              <h3 className="sub-h">Biggest 7d movers</h3>
              <div className="tbl-scroll">
                <table className="tbl tbl-heatmap">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subnet</th>
                      <th className="num">Price (τ)</th>
                      <th className="num">7d</th>
                      <th className="num">24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.topMovers7d.map((m) => {
                      const rgb7 = (m.pct7d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                      const rgb1 = (m.pct1d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                      // Symmetric to the 24h table: day-vs-week narrative hint
                      // surfaces trend continuation / bounce / pullback.
                      const sameSign = m.pct1d != null &&
                        ((m.pct1d > 0 && m.pct7d > 0) || (m.pct1d < 0 && m.pct7d < 0));
                      const oppSign = m.pct1d != null &&
                        ((m.pct1d > 0 && m.pct7d < 0) || (m.pct1d < 0 && m.pct7d > 0));
                      const trendHint = sameSign
                        ? (m.pct7d > 0 ? 'week-long rally' : 'week-long bleed')
                        : oppSign
                          ? (m.pct7d > 0 ? 'pullback in uptrend' : 'bounce off weekly low')
                          : null;
                      return (
                        <tr key={m.netuid} title={trendHint ? `Day shape vs week shape: ${trendHint}.` : undefined}>
                          <td>{m.netuid}</td>
                          <td>
                            <SubnetLink
                              netuid={m.netuid}
                              name={m.name}
                              info={subnetLookup.get(m.netuid)}
                              href={`https://taostats.io/subnets/${m.netuid}/metagraph`}
                            />
                          </td>
                          <td className="num">{fmt(m.priceTao, 6)}</td>
                          <td className={`num heat ${cls(m.pct7d)}`} style={heatBg(m.pct7d, moversMaxAbs7d, rgb7)}>{fmtPct(m.pct7d)}</td>
                          {m.pct1d != null ? (
                            <td className={`num heat ${cls(m.pct1d)}`} style={heatBg(m.pct1d, moversMaxAbs1d, rgb1)}>{fmtPct(m.pct1d)}</td>
                          ) : (
                            <td className="num muted">—</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
        {b.subnetsToWatch && b.subnetsToWatch.length > 0 && (() => {
          // "vs market" delta — separates idiosyncratic outperformance from
          // the broader market lifting all boats. If watch row is +25% and
          // the median 7d is -5%, that's +30 pts of alpha; if the median
          // 7d is +20%, that's only +5 pts (not as exciting as the raw +25%).
          const mkt7d = b.marketContext?.median7dPct;
          return (
            <div className="watch-strip">
              <div className="watch-head">
                <span className="watch-lbl">🔭 Subnets to watch</span>
                <span className="watch-sub">top 7d gainers you don't hold{mkt7d != null && ` · vs market 7d ${mkt7d >= 0 ? '+' : ''}${mkt7d.toFixed(2)}%`}</span>
              </div>
              <div className="watch-chips">
                {b.subnetsToWatch.map((w) => {
                  const vsMkt = mkt7d != null ? w.pct7d - mkt7d : null;
                  const vsMktCls = vsMkt == null ? '' : vsMkt > 0 ? 'vs-mkt-up' : vsMkt < 0 ? 'vs-mkt-down' : '';
                  return (
                    <a
                      key={w.netuid}
                      className="watch-chip"
                      href={`https://taostats.io/subnets/${w.netuid}/metagraph`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`sn${w.netuid} ${w.name} · ${fmt(w.priceTao, 6)} τ · vol ${fmt(w.volumeTao24h, 0)} τ/24h${vsMkt != null ? ` · 7d ${vsMkt > 0 ? 'outperforming' : 'underperforming'} market median by ${Math.abs(vsMkt).toFixed(2)} pts` : ''}`}
                    >
                      <span className="w-sn">sn{w.netuid}</span> {w.name}{' '}
                      <span className="w-pct">+{fmt(w.pct7d, 2)}%</span>
                      {vsMkt != null && (
                        <span className={`vs-mkt ${vsMktCls}`}>{vsMkt >= 0 ? '+' : ''}{vsMkt.toFixed(1)} vs mkt</span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {b.subnetsToTrim && b.subnetsToTrim.length > 0 && (() => {
          const mkt7d = b.marketContext?.median7dPct;
          return (
            <div className="trim-strip">
              <div className="trim-head">
                <span className="trim-lbl">🩸 Worst held this week</span>
                <span className="trim-sub">top 7d losers you currently hold — consider trimming{mkt7d != null && ` · vs market 7d ${mkt7d >= 0 ? '+' : ''}${mkt7d.toFixed(2)}%`}</span>
              </div>
              <div className="trim-chips">
                {b.subnetsToTrim.map((t) => {
                  const vsMkt = mkt7d != null ? t.pct7d - mkt7d : null;
                  // For trim chips a NEGATIVE vs-mkt means "bleeding worse than
                  // the market" — still red, the colour-by-sign logic is the
                  // same as watch (vs-mkt-up = green) but the read is "your
                  // pain is subnet-specific, not market-wide" when red.
                  const vsMktCls = vsMkt == null ? '' : vsMkt > 0 ? 'vs-mkt-up' : vsMkt < 0 ? 'vs-mkt-down' : '';
                  return (
                    <a
                      key={t.netuid}
                      className="trim-chip"
                      href={`https://taostats.io/subnets/${t.netuid}/metagraph`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`sn${t.netuid} ${t.name} · ${fmt(t.valueTao, 3)} τ${
                        t.pctOfPortfolio != null
                          ? ` (${fmt(t.pctOfPortfolio, 1)}% of port)`
                          : ''
                      } · price ${fmt(t.priceTao, 6)} τ${vsMkt != null ? ` · 7d ${vsMkt < 0 ? 'underperforming' : 'outperforming'} market median by ${Math.abs(vsMkt).toFixed(2)} pts (${vsMkt < 0 ? 'subnet-specific bleed' : 'market-wide weakness'})` : ''}`}
                    >
                      <span className="t-sn">sn{t.netuid}</span> {t.name}{' '}
                      <span className="t-pct">{fmt(t.pct7d, 2)}%</span>
                      {vsMkt != null && (
                        <span className={`vs-mkt ${vsMktCls}`}>{vsMkt >= 0 ? '+' : ''}{vsMkt.toFixed(1)} vs mkt</span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Section>
    </div>
  );
}
