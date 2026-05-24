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
  const volume = (broader && broader.topByVolume24h) || [];
  const cols = ['#', 'Subnet', 'Netuid', 'Price (TAO)', '24h pct', 'Volume (TAO)'];
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

function formatShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function Report({ data, showSubscribeNudge = true }) {
  const { portfolio: p, pnl, pnlGroundTruth: gt, drawdown: dd, volatility: vol, taxYear: ty, yield: y, flags: f, recommendations: r, broader: b } = data;
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
        {p.top10.length > 0 ? (() => {
          const maxValue = Math.max(...p.top10.map((x) => x.taoValue || 0));
          const maxPort = Math.max(...p.top10.map((x) => x.pctOfPortfolio || 0));
          const maxAbs1d = Math.max(...p.top10.map((x) => Math.abs(x.pct1d || 0)));
          const maxAbs7d = Math.max(...p.top10.map((x) => Math.abs(x.pct7d || 0)));
          return (
            <>
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
                        </td>
                        <td className="num">{fmt(pos.alphaHeld)}</td>
                        <td className="num">{fmt(pos.alphaPriceTao, 6)}</td>
                        <td className="num heat" style={heatBg(pos.taoValue, maxValue, HEAT_ORANGE)}>{fmt(pos.taoValue)}</td>
                        <td className="num heat" style={heatBg(pos.pctOfPortfolio, maxPort, HEAT_ORANGE)}>{fmt(pos.pctOfPortfolio, 1)}%</td>
                        <td className={`num heat ${cls(pos.pct1d)}`} style={heatBg(pos.pct1d, maxAbs1d, rgb1d)}>{fmtPct(pos.pct1d)}</td>
                        <td className={`num heat ${cls(pos.pct7d)}`} style={heatBg(pos.pct7d, maxAbs7d, rgb7d)}>{fmtPct(pos.pct7d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
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
              <div className="pnl-window">
                Over last {gt.windowDays} days ({gt.firstSnapshotDate} → {gt.lastSnapshotDate})
              </div>
            </div>
            {dd && dd.available && (
              <div className="drawdown-panel">
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
                </div>
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
                <p className="hint">
                  Volatility from {vol.returnsCount} daily-return observations
                  over {vol.windowDays}d. Annualised σ ≈ daily σ × √365.
                  Return-per-risk ≈ Sharpe with rf=0 (crypto convention).
                </p>
              </div>
            )}
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
            <div className="stats">
              <Stat label="Starting balance" value={`${fmt(gt.startingBalanceTao, 6)} τ`} />
              <Stat label="Transfers in" value={`${fmt(gt.transferInTao, 6)} τ`} />
              <Stat label="Transfers out" value={`${fmt(gt.transferOutTao, 6)} τ`} />
              <Stat label="Current portfolio" value={`${fmt(gt.currentPortfolioTao, 6)} τ`} />
            </div>
            {gt.dailyIncomeTao > 0 && (
              <div className="stats">
                <Stat
                  label={`Staking income (${gt.windowDays}d)`}
                  value={`${fmt(gt.dailyIncomeTao, 4)} τ ($${fmt(gt.dailyIncomeUsd, 2)} · A$${fmt(gt.dailyIncomeAud, 2)})`}
                  cls="pos"
                />
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

        {Array.isArray(pnl.perSubnet) && pnl.perSubnet.length > 0 && (
          <>
            <h3 className="sub-h">Per-subnet PnL attribution</h3>
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
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            <p className="hint">
              Top 5 contributors + bottom 3 detractors (subnets with PnL impact ≥ 0.001 τ). Computed from delegation history × current α value.
            </p>
          </>
        )}
      </Section>

      <Section n="3" title="Yield">
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

        {y.liftIfOptimised != null && y.liftIfOptimised > 0.02 && (
          <p className="yield-lift">
            ↗ Re-delegating each position to the best validator on its subnet would lift weighted APY by{' '}
            <strong>+{fmt(y.liftIfOptimised * 100, 2)}pp</strong>{' '}
            (to {fmt(y.bestCaseWeightedApy * 100, 2)}%).
          </p>
        )}

        {Array.isArray(y.perPosition) && y.perPosition.length > 0 && (
          <>
            <h3 className="sub-h">Per-validator breakdown</h3>
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
                {y.perPosition
                  .slice()
                  .sort((a, b) => b.alphaTokens - a.alphaTokens)
                  .slice(0, 10)
                  .map((p, i) => {
                    const apyPct = p.apy != null ? `${fmt(p.apy * 100, 2)}%` : '—';
                    const bestPct =
                      p.subnetBestApy != null ? `${fmt(p.subnetBestApy * 100, 2)}%` : '—';
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
                        </td>
                        <td>{bestPct}</td>
                        <td className={`yield-delta ${deltaCls}`}>{deltaStr}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="hint">
              Δ to best shows how far each validator is behind the best validator on the same subnet (in percentage points). Negative values are re-delegation opportunities.
            </p>
          </>
        )}

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
        <ol className="recs">
          {r.items.map((it, i) => (
            <li key={i}>
              <div className="obs">{it.observation}</div>
              <div className="act">→ {it.action}</div>
            </li>
          ))}
        </ol>
        <p className="disclaimer">{r.disclaimer}</p>
      </Section>

      <Section n="6" title="Broader market">
        <div className="stats">
          <Stat label="TAO/USD" value={`$${fmt(b.taoPrice, 2)}`} />
          <Stat label="Subnets" value={b.subnetCount} />
        </div>
        <CopyCsvButton
          getCsv={() => buildBroaderMarketCsv(b)}
          coldkey={data.coldkey}
          filenamePrefix="broader-market"
          ariaLabel="Copy broader market as CSV"
        />
        <h3 className="sub-h">Biggest 24h movers</h3>
        {(() => {
          const moversMaxAbs1d = Math.max(...b.topMovers24h.map((x) => Math.abs(x.pct1d || 0)), 0);
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
                    <th className="num">Volume (τ)</th>
                  </tr>
                </thead>
                <tbody>
                  {b.topMovers24h.map((m) => {
                    const rgb = (m.pct1d || 0) >= 0 ? HEAT_GREEN : HEAT_RED;
                    return (
                      <tr key={m.netuid}>
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
                        <td className={`num heat ${cls(m.pct1d)}`} style={heatBg(m.pct1d, moversMaxAbs1d, rgb)}>{fmtPct(m.pct1d)}</td>
                        <td className="num heat" style={heatBg(m.volumeTao24h, moversMaxVol, HEAT_ORANGE)}>{fmt(m.volumeTao24h, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Section>
    </div>
  );
}
