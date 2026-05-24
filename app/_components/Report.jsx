'use client';

import AIInsights from './AIInsights.jsx';

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

export default function Report({ data, showSubscribeNudge = true }) {
  const { portfolio: p, pnl, pnlGroundTruth: gt, yield: y, flags: f, recommendations: r, broader: b } = data;
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
                          <a
                            className="subnet-link"
                            href={`https://taostats.io/subnets/${pos.netuid}/metagraph`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open subnet ${pos.netuid} on Taostats`}
                          >
                            {pos.name}
                          </a>
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
                          <a
                            className="subnet-link"
                            href={`https://taostats.io/subnets/${m.netuid}/metagraph`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open subnet ${m.netuid} on Taostats`}
                          >
                            {m.name}
                          </a>
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
