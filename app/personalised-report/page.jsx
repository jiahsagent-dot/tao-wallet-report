'use client';

import { useState, useEffect, useRef } from 'react';
import Report from '../_components/Report.jsx';
import TipJar from '../_components/TipJar.jsx';
import WeeklyEmailCTA from '../_components/WeeklyEmailCTA.jsx';
import UsageBadge from '../_components/UsageBadge.jsx';
import Skeleton from '../_components/Skeleton.jsx';
import ShareButton from '../_components/ShareButton.jsx';
import RecentColdkeys, { addRecent } from '../_components/RecentColdkeys.jsx';
import PinnedColdkeys from '../_components/PinnedColdkeys.jsx';
import PinButton from '../_components/PinButton.jsx';
import ColdkeySearch from '../_components/ColdkeySearch.jsx';

const TIP = process.env.NEXT_PUBLIC_TIP_WALLET_ADDRESS || '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH';
const DEMO_COLDKEY = '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd';

const PLACEHOLDERS = [
  '5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd',
  'Paste any Bittensor SS58 coldkey (starts with 5)',
  'Your Bittensor coldkey — public address only, never your hotkey',
  'Paste a coldkey to see portfolio, PnL, yield, and AI Insights',
  'Tap "▸ Try a demo report" below, or paste your own coldkey',
];

export default function PersonalisedReportPage() {
  const [coldkey, setColdkey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  // Iter 203 (BACKLOG iter 166): ?embed=1 (set by the bittensor-tracker iframe
  // src) hides the page's own chrome (h1, sub, UsageBadge, paste form, demo
  // row, PinnedColdkeys, RecentColdkeys, share-row, WeeklyEmailCTA, TipJar,
  // footer) — the embedding tracker already supplies the tab title + selected
  // wallet, so re-rendering them inside the iframe produces "tracker chrome
  // wrapping report chrome". Layout.jsx strips the sidebar via Sec-Fetch-Dest;
  // page.jsx strips its own header surface via ?embed=1. Either signal
  // independently produces a chrome-free embed body.
  const [isEmbed, setIsEmbed] = useState(false);
  const autoRanRef = useRef(false);

  useEffect(() => {
    if (autoRanRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') setIsEmbed(true);
    const ck = params.get('coldkey');
    if (ck && /^5[1-9A-HJ-NP-Za-km-z]{47}$/.test(ck.trim())) {
      autoRanRef.current = true;
      setColdkey(ck.trim());
      runReport(ck.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <main className={`wrap${isEmbed ? ' wrap-embed' : ''}`}>
      {!isEmbed && (
        <header className="head">
          <h1>Personalised Report</h1>
          <p className="sub">
            Paste any Bittensor coldkey. Get a personalised report with portfolio, PnL,
            yield, flags, and rule-based recommendations. Free, instant, public data only.
          </p>
          <UsageBadge />
        </header>
      )}

      {!isEmbed && <PinnedColdkeys />}

      {!isEmbed && (
        <form onSubmit={onSubmit} className="form">
          <ColdkeySearch
            value={coldkey}
            onChange={setColdkey}
            onPick={(k) => { setColdkey(k); runReport(k); }}
            placeholder={placeholder}
            disabled={loading}
          />
          <button className="btn" type="submit" disabled={loading || !coldkey.trim()}>
            {loading ? 'Building…' : 'Generate report'}
          </button>
        </form>
      )}

      {!isEmbed && (
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
      )}

      {!isEmbed && <RecentColdkeys />}

      {error && <div className="err">⚠ {error}</div>}

      {loading && !report && <Skeleton />}

      {report && (
        <>
          {!isEmbed && (
            <div className="share-row">
              <ShareButton coldkey={report.coldkey} />
              <PinButton coldkey={report.coldkey} pnl={report?.pnlGroundTruth} />
              <a className="share-permalink" href={`/report/${report.coldkey}`}>
                Open permalink page →
              </a>
            </div>
          )}
          <Report data={report} />
        </>
      )}

      {!isEmbed && report && <WeeklyEmailCTA defaultColdkey={coldkey.trim()} />}

      {!isEmbed && <TipJar address={TIP} />}

      {!isEmbed && (
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
      )}
    </main>
  );
}
