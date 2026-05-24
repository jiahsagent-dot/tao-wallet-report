'use client';

import { useState } from 'react';

const fmt = (n, d = 2) =>
  n == null || !isFinite(n)
    ? '—'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

const fmtPct = (n, d = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${fmt(n, d)}%`);

const TIP = process.env.NEXT_PUBLIC_TIP_WALLET_ADDRESS || '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH';

export default function Page() {
  const [coldkey, setColdkey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  async function onSubmit(e) {
    e?.preventDefault();
    setError(null);
    setReport(null);
    setLoading(true);
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coldkey: coldkey.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setReport(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <header className="head">
        <h1>Tao Wallet Report</h1>
        <p className="sub">
          Paste any Bittensor coldkey. Get a personalised report with portfolio, PnL,
          yield, flags, and rule-based recommendations. Free, instant, public data only.
        </p>
      </header>

      <form onSubmit={onSubmit} className="form">
        <input
          className="input"
          value={coldkey}
          onChange={(e) => setColdkey(e.target.value)}
          placeholder="5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="btn" type="submit" disabled={loading || !coldkey.trim()}>
          {loading ? 'Building…' : 'Get report'}
        </button>
      </form>

      {error && <div className="err">⚠ {error}</div>}

      {loading && !report && <Skeleton />}

      {report && <Report data={report} />}

      <TipJar address={TIP} />

      <footer className="foot">
        <p>
          Built on <a href="https://taostats.io" target="_blank" rel="noopener">Taostats</a>{' '}
          + <a href="https://tao.app" target="_blank" rel="noopener">tao.app</a> public data.
          Not financial advice.
        </p>
        <p>
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener">
            Open source on GitHub
          </a>
        </p>
      </footer>
    </main>
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

function Report({ data }) {
  const { portfolio: p, pnl, yield: y, flags: f, recommendations: r, broader: b } = data;
  return (
    <div className="report">
      <p className="meta">
        Coldkey <code className="addr small">{data.coldkey}</code> · TAO ${fmt(data.taoPriceUsd, 2)} ·
        Generated {new Date(data.generatedAt).toUTCString()}
      </p>

      <Section n="1" title="Portfolio">
        <div className="stats">
          <Stat label="Total" value={`${fmt(p.totalTao)} τ`} />
          <Stat label="USD" value={`$${fmt(p.totalUsd)}`} />
          <Stat label="AUD" value={`A$${fmt(p.totalAud)}`} />
          <Stat label="Positions" value={p.positionCount} />
        </div>
        {p.top10.length > 0 ? (
          <div className="tbl-scroll">
            <table className="tbl">
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
                {p.top10.map((pos) => (
                  <tr key={pos.netuid}>
                    <td>{pos.netuid}</td>
                    <td>{pos.name}</td>
                    <td className="num">{fmt(pos.alphaHeld)}</td>
                    <td className="num">{fmt(pos.alphaPriceTao, 6)}</td>
                    <td className="num">{fmt(pos.taoValue)}</td>
                    <td className="num">{fmt(pos.pctOfPortfolio, 1)}%</td>
                    <td className={`num ${cls(pos.pct1d)}`}>{fmtPct(pos.pct1d)}</td>
                    <td className={`num ${cls(pos.pct7d)}`}>{fmtPct(pos.pct7d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No alpha-token holdings found for this coldkey.</p>
        )}
      </Section>

      <Section n="2" title="PnL">
        <div className="stats">
          <Stat label="Spent" value={`${fmt(pnl.spentTao)} τ`} />
          <Stat label="Sold" value={`${fmt(pnl.soldTao)} τ`} />
          <Stat label="Current" value={`${fmt(pnl.currentTao)} τ`} />
          <Stat
            label="Total PnL"
            value={`${fmt(pnl.totalPnlTao)} τ ($${fmt(pnl.totalPnlUsd, 0)})`}
            cls={cls(pnl.totalPnlTao)}
          />
        </div>
        <div className="stats">
          <Stat
            label="24h"
            value={`${fmt(pnl.change24hTao)} τ ($${fmt(pnl.change24hUsd, 0)})`}
            cls={cls(pnl.change24hTao)}
          />
          <Stat
            label="7d"
            value={`${fmt(pnl.change7dTao)} τ ($${fmt(pnl.change7dUsd, 0)})`}
            cls={cls(pnl.change7dTao)}
          />
          <Stat
            label="30d"
            value={`${fmt(pnl.change30dTao)} τ ($${fmt(pnl.change30dUsd, 0)})`}
            cls={cls(pnl.change30dTao)}
          />
        </div>
        <p className="hint">
          {pnl.eventsCount} delegation events analysed. PnL excludes SN0 root staking
          (not a trade).
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
        <div className="tbl-scroll">
          <table className="tbl">
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
              {b.topMovers24h.map((m) => (
                <tr key={m.netuid}>
                  <td>{m.netuid}</td>
                  <td>{m.name}</td>
                  <td className="num">{fmt(m.priceTao, 6)}</td>
                  <td className={`num ${cls(m.pct1d)}`}>{fmtPct(m.pct1d)}</td>
                  <td className="num">{fmt(m.volumeTao24h, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
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

function cls(n) {
  if (n == null) return '';
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}

function TipJar({ address }) {
  const [copied, setCopied] = useState(false);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&bgcolor=131720&color=eef0f4&data=${encodeURIComponent(address)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <section className="tipjar">
      <div className="tipjar-content">
        <div className="tipjar-text">
          <h3>Useful? Tip TAO.</h3>
          <p className="tipjar-hint">
            Suggested: <strong>0.01 τ</strong> (~$3 USD). Any amount keeps this tool free.
          </p>
          <button className="tipjar-addr" onClick={copy} title="Click to copy">
            <code>{address}</code>
            <span className="copy-badge">{copied ? '✓ copied' : 'copy'}</span>
          </button>
          <p className="tipjar-meta">
            Send via your Bittensor wallet (taostats / Polkadot.js extension / mobile app).
          </p>
        </div>
        <div className="tipjar-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Donation QR code" width="160" height="160" />
        </div>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="report">
      <p className="meta sk-line" style={{ width: '70%' }}>&nbsp;</p>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <section className="card" key={n}>
          <h2><span className="num">§{n}</span> <span className="sk-text">Loading…</span></h2>
          <div className="stats">
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
          </div>
        </section>
      ))}
    </div>
  );
}
