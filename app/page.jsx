'use client';

import { useEffect, useState } from 'react';

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
        <UsageBadge />
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

      {report && <WeeklyEmailCTA defaultColdkey={coldkey.trim()} />}

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
  const { portfolio: p, pnl, pnlGroundTruth: gt, yield: y, flags: f, recommendations: r, broader: b } = data;
  return (
    <div className="report">
      <p className="meta">
        Coldkey <code className="addr small">{data.coldkey}</code> · TAO ${fmt(data.taoPriceUsd, 2)} ·
        Generated {new Date(data.generatedAt).toUTCString()}
      </p>

      <a href="#subscribe" className="top-nudge">
        <span className="top-nudge-icon">📬</span>
        <span>
          Want this report every Monday? <strong>Subscribe for ~$3 TAO</strong>
        </span>
        <span className="top-nudge-arrow">→</span>
      </a>

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

function WeeklyEmailCTA({ defaultColdkey }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function start(e) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/start-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, coldkey: defaultColdkey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSession(j);
      setStatus('pending');
      pollStatus(j.sessionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function pollStatus(sessionId) {
    const deadline = Date.now() + 11 * 60_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch('/api/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const j = await r.json();
        if (j.status === 'confirmed') {
          setStatus('confirmed');
          return;
        }
        if (j.status === 'expired') {
          setStatus('expired');
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
    setStatus('expired');
  }

  if (!open) {
    return (
      <section className="cta" id="subscribe">
        <h3>📬 Want this every Monday?</h3>
        <p>
          A fresh personalised report delivered to your inbox every Monday morning.
          Same numbers, same format, same data source — but you don&apos;t have to remember to check.
          <br />
          <strong>One-time ~0.01 τ (~$3 USD). 30 days of weekly emails.</strong>
        </p>
        <button className="btn" onClick={() => setOpen(true)}>Subscribe for ~$3 TAO</button>
      </section>
    );
  }

  if (status === 'confirmed') {
    return (
      <section className="cta confirmed">
        <h3>✓ Payment received</h3>
        <p>You'll get your first weekly report Monday morning at <code>{email}</code>. Thank you!</p>
      </section>
    );
  }

  if (status === 'expired') {
    return (
      <section className="cta expired">
        <h3>Session expired</h3>
        <p>Didn't see your payment in time. <button className="link-btn" onClick={() => { setSession(null); setStatus(null); }}>Try again</button></p>
      </section>
    );
  }

  if (session) {
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&bgcolor=131720&color=eef0f4&data=${encodeURIComponent(session.address)}`;
    return (
      <section className="cta paying">
        <h3>Send exactly <span className="amount">{session.amountTao.toFixed(4)} τ</span></h3>
        <p className="hint">to the address below. We poll every 5 seconds. Window: 10 minutes.</p>
        <div className="pay-grid">
          <div className="pay-info">
            <div className="kv"><span className="lbl">Amount</span><code className="code-big">{session.amountTao.toFixed(4)} τ</code></div>
            <div className="kv"><span className="lbl">To</span><code className="code-addr">{session.address}</code></div>
            <div className="kv"><span className="lbl">Email</span><code>{email}</code></div>
            <p className="status">Waiting for confirmation… <span className="spin">●</span></p>
          </div>
          <img src={qr} alt="QR" width="180" height="180" />
        </div>
      </section>
    );
  }

  return (
    <section className="cta">
      <h3>Get weekly reports</h3>
      <form onSubmit={start} className="cta-form">
        <input
          type="email"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn" disabled={submitting || !email}>
          {submitting ? 'Starting…' : 'Continue'}
        </button>
      </form>
      {error && <div className="err" style={{ marginTop: 12 }}>⚠ {error}</div>}
      <p className="hint">Send ~0.01 τ (~$3) once. We'll email you a fresh report every Monday for 30 days.</p>
    </section>
  );
}

function UsageBadge() {
  const [total, setTotal] = useState(null);
  useEffect(() => {
    fetch('/api/usage')
      .then((r) => r.json())
      .then((j) => setTotal(Number(j?.total || 0)))
      .catch(() => {});
  }, []);
  if (total == null || total < 1) return null;
  const formatted = total.toLocaleString();
  return (
    <p className="usage-badge">
      📊 {formatted} {total === 1 ? 'report' : 'reports'} generated so far
    </p>
  );
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
