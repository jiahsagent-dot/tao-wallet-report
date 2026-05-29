'use client';

import { useEffect, useState } from 'react';
import Report from '../_components/Report.jsx';
import Skeleton from '../_components/Skeleton.jsx';
import { aggregateSummary } from '../../lib/aggregator.js';

const WALLETS = [
  { coldkey: '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH', label: 'Root' },
  { coldkey: '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd', label: 'Subnets' },
];

const fmt = (n, d = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : Number(n).toLocaleString(undefined, {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });

async function fetchReport(coldkey) {
  const r = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coldkey }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export default function MePage() {
  const [reports, setReports] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(WALLETS.map((w) => fetchReport(w.coldkey))).then((results) => {
      if (cancelled) return;
      const ok = [];
      const fail = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push({ ...WALLETS[i], data: r.value });
        else fail.push({ ...WALLETS[i], error: String(r.reason?.message || r.reason) });
      });
      setReports(ok);
      setErrors(fail);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = aggregateSummary(reports.map((w) => w.data));

  return (
    <main className="wrap">
      <header className="head">
        <h1>My Portfolio</h1>
        <p className="sub">
          Combined view across {WALLETS.length} wallets. Per-wallet reports stacked below
          — PnL, drawdown, and yield are wallet-specific (cost basis differs) so they're
          shown separately rather than merged.
        </p>
      </header>

      {loading && <Skeleton />}

      {!loading && summary && (
        <section className="card me-summary">
          <h2>
            <span className="num">∑</span> Combined Total
          </h2>
          <div className="stats">
            <div className="stat">
              <div className="lbl">Total τ</div>
              <div className="val">{fmt(summary.totalTao, 3)} τ</div>
            </div>
            <div className="stat">
              <div className="lbl">USD</div>
              <div className="val">${fmt(summary.totalUsd)}</div>
            </div>
            <div className="stat">
              <div className="lbl">AUD</div>
              <div className="val">A${fmt(summary.totalAud)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Positions</div>
              <div className="val">
                {summary.positionCount}{' '}
                <span className="me-unique">
                  ({summary.uniqueSubnetCount} unique)
                </span>
              </div>
            </div>
          </div>

          <div className="me-wallet-strip">
            {summary.perWallet.map((w, i) => {
              const wlabel = WALLETS.find((x) => x.coldkey === w.coldkey)?.label || w.coldkey.slice(0, 6);
              const share = summary.totalTao > 0 ? (100 * w.totalTao) / summary.totalTao : 0;
              return (
                <a
                  key={w.coldkey}
                  href={`#wallet-${i}`}
                  className="me-wallet-pill"
                  title={w.coldkey}
                >
                  <span className="me-wallet-label">{wlabel}</span>
                  <span className="me-wallet-amt">{fmt(w.totalTao, 2)} τ</span>
                  <span className="me-wallet-share">{fmt(share, 0)}%</span>
                </a>
              );
            })}
          </div>

          {summary.positions.length > 0 && (
            <div className="me-positions">
              <h3 className="me-positions-title">Subnet exposure across all wallets</h3>
              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>SN</th>
                      <th>Name</th>
                      <th className="num">τ</th>
                      <th className="num">USD</th>
                      <th className="num">% port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.positions.slice(0, 15).map((p) => (
                      <tr key={p.netuid}>
                        <td>{p.netuid}</td>
                        <td>{p.name || p.netuid}</td>
                        <td className="num">{fmt(p.taoValue, 3)}</td>
                        <td className="num">${fmt(p.usdValue)}</td>
                        <td className="num">{fmt(p.pctOfPortfolio, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {errors.length > 0 && (
        <div className="err">
          ⚠ {errors.length} wallet{errors.length > 1 ? 's' : ''} failed:
          <ul>
            {errors.map((e) => (
              <li key={e.coldkey}>
                <strong>{e.label}</strong> ({e.coldkey.slice(0, 6)}…): {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reports.map((w, i) => (
        <section key={w.coldkey} id={`wallet-${i}`} className="me-wallet-report">
          <h2 className="me-wallet-heading">
            <span className="me-wallet-tag">{w.label}</span>{' '}
            <span className="me-wallet-key">
              {w.coldkey.slice(0, 6)}…{w.coldkey.slice(-6)}
            </span>
          </h2>
          <Report data={w.data} />
        </section>
      ))}

      <footer className="foot">
        <p>
          <a href="/">← Back to home</a>
        </p>
      </footer>
    </main>
  );
}
