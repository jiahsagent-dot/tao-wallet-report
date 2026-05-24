import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrBuildReport } from '../../../lib/report.js';
import Report from '../../_components/Report.jsx';
import WeeklyEmailCTA from '../../_components/WeeklyEmailCTA.jsx';
import TipJar from '../../_components/TipJar.jsx';
import RecordView from '../../_components/RecordView.jsx';

const TIP = process.env.NEXT_PUBLIC_TIP_WALLET_ADDRESS || '5Cnz1juP8ZovhWkujaaHFZ1rJw2nyUsKf8s8543PbkSLbinH';
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

// Vercel edge cache for 5 min — matches in-memory cache TTL in lib/report.js
// so even if the function instance cold-starts, the CDN can still serve.
export const revalidate = 300;
export const runtime = 'nodejs';
export const maxDuration = 30;

function shortKey(k) {
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}

export async function generateMetadata({ params }) {
  const { coldkey } = params;
  if (!SS58_RE.test(coldkey)) return { title: 'Invalid coldkey' };

  // Try to enrich metadata with the actual PnL number so social shares
  // show "Coldkey 5xyz…abc: +0.196 τ (+0.97%)" instead of generic text.
  // If the build fails (rate-limit, network), fall back to generic copy
  // — never block the page render on it.
  let pnlLine = '';
  try {
    const report = await getOrBuildReport(coldkey);
    const gt = report?.pnlGroundTruth;
    if (gt?.available) {
      const sign = gt.profitTao >= 0 ? '+' : '';
      const pctSign = gt.returnPct >= 0 ? '+' : '';
      pnlLine = ` · ${sign}${gt.profitTao.toFixed(3)} τ (${pctSign}${(gt.returnPct * 100).toFixed(2)}%)`;
    }
  } catch {}

  const short = shortKey(coldkey);
  const title = `Tao Wallet Report — ${short}${pnlLine}`;
  const description = `Portfolio, PnL, yield, and rule-based flags for Bittensor coldkey ${short}. Free, instant, public on-chain data.`;
  const url = `/report/${coldkey}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Tao Wallet Report',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ReportPermalinkPage({ params }) {
  const { coldkey } = params;
  if (!SS58_RE.test(coldkey)) notFound();

  let report = null;
  let buildError = null;
  try {
    report = await getOrBuildReport(coldkey);
  } catch (e) {
    buildError = String(e?.message || e).slice(0, 300);
  }

  return (
    <main className="wrap">
      <RecordView coldkey={coldkey} />
      <header className="head">
        <Link href="/" className="back-link">← Generate your own report</Link>
        <h1>Tao Wallet Report</h1>
        <p className="sub">
          Permalink for coldkey <code className="addr small">{shortKey(coldkey)}</code>.
          Share this URL — link previews show the live PnL.
        </p>
      </header>

      {buildError ? (
        <div className="err" style={{ marginTop: 24 }}>
          ⚠ Couldn&apos;t build report: {buildError}
        </div>
      ) : (
        <Report data={report} showSubscribeNudge={true} />
      )}

      {report && <WeeklyEmailCTA defaultColdkey={coldkey} />}

      <TipJar address={TIP} />

      <footer className="foot">
        <p>
          Built on <a href="https://taostats.io" target="_blank" rel="noopener">Taostats</a>{' '}
          + <a href="https://tao.app" target="_blank" rel="noopener">tao.app</a> public data.
          Not financial advice.
        </p>
        <p>
          <Link href="/">← Generate your own report</Link>
          {' · '}
          <Link href="/about">How it works</Link>
          {' · '}
          <Link href="/press">Press kit</Link>
          {' · '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener">
            Open source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
