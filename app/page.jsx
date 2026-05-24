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
      addRecent(j.coldkey || coldkey.trim());
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
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener">
            Open source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
