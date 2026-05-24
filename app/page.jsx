'use client';

import { useState } from 'react';
import Report from './_components/Report.jsx';
import TipJar from './_components/TipJar.jsx';
import WeeklyEmailCTA from './_components/WeeklyEmailCTA.jsx';
import UsageBadge from './_components/UsageBadge.jsx';
import Skeleton from './_components/Skeleton.jsx';
import ShareButton from './_components/ShareButton.jsx';
import RecentColdkeys, { addRecent } from './_components/RecentColdkeys.jsx';

const TIP = process.env.NEXT_PUBLIC_TIP_WALLET_ADDRESS || '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH';
const DEMO_COLDKEY = '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd';

// Deterministic per-hour rotation so server + client agree (no hydration
// mismatch) and visitors who reload at different times see variety.
const PLACEHOLDERS = [
  '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd',
  'Paste any Bittensor SS58 coldkey (starts with 5)',
  'Your Bittensor coldkey — public address only, never your hotkey',
  'Paste a coldkey to see portfolio, PnL, yield, and AI Insights',
  'Tap "▸ Try a demo report" below, or paste your own coldkey',
];

export default function Page() {
  const [coldkey, setColdkey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  async function runReport(rawKey) {
    const key = rawKey.trim();
    if (!key) return;
    setError(null);
    setReport(null);
    setLoading(true);
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coldkey: key }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setReport(j);
      addRecent(j.coldkey || key);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e?.preventDefault();
    return runReport(coldkey);
  }

  function onDemo() {
    setColdkey(DEMO_COLDKEY);
    return runReport(DEMO_COLDKEY);
  }

  const placeholder = PLACEHOLDERS[new Date().getUTCHours() % PLACEHOLDERS.length];

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
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="btn" type="submit" disabled={loading || !coldkey.trim()}>
          {loading ? 'Building…' : 'Get report'}
        </button>
      </form>

      <div className="demo-row">
        <button
          type="button"
          className="demo-btn"
          onClick={onDemo}
          disabled={loading}
          title="Run a sample report against a known-good coldkey"
        >
          ▸ Try a demo report
        </button>
        <span className="demo-hint">no coldkey? we'll load a sample wallet</span>
      </div>

      <RecentColdkeys />

      {error && <div className="err">⚠ {error}</div>}

      {loading && !report && <Skeleton />}

      {report && (
        <>
          <div className="share-row">
            <ShareButton coldkey={report.coldkey} />
            <a className="share-permalink" href={`/report/${report.coldkey}`}>
              Open permalink page →
            </a>
          </div>
          <Report data={report} />
        </>
      )}

      {report && <WeeklyEmailCTA defaultColdkey={coldkey.trim()} />}

      <TipJar address={TIP} />

      <footer className="foot">
        <p>
          Built on <a href="https://taostats.io" target="_blank" rel="noopener">Taostats</a>{' '}
          + <a href="https://tao.app" target="_blank" rel="noopener">tao.app</a> public data.
          Not financial advice.
        </p>
        <p>
          <a href="/about">How it works</a>
          {' · '}
          <a href="/press">Press kit</a>
          {' · '}
          <a href="/changelog">Changelog</a>
          {' · '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener">
            Open source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
