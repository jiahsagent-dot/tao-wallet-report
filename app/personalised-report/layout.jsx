import Link from 'next/link';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Personalised Report — Tao app',
  description:
    'Generate a personalised Bittensor report for any coldkey: portfolio, PnL, yield, flags, AI insights. Free, public data only.',
};

// Iter 203 (BACKLOG iter 166): when this page is rendered inside an <iframe>
// (e.g. as the "Generate Personalised Report" tab inside bittensor-tracker),
// strip the sidebar+brand chrome so the embed doesn't render "tracker chrome
// wrapping report chrome" — two h1s, two nav surfaces, scroll-in-scroll. The
// browser-supplied `Sec-Fetch-Dest: iframe` header is the reliable server-side
// signal; the page itself also honours `?embed=1` (set by the tracker iframe
// src) for the same reason. Either signal independently strips chrome.
export default function PersonalisedReportLayout({ children }) {
  const isIframe = headers().get('sec-fetch-dest') === 'iframe';

  if (isIframe) {
    return <div className="app-main app-main-embed">{children}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="app-brand">
          <Link href="/personalised-report" className="app-brand-link">
            <span className="app-brand-mark">τ</span>
            <span className="app-brand-name">Tao app</span>
          </Link>
        </div>
        <nav className="app-nav">
          <span className="app-nav-item app-nav-disabled" aria-disabled="true">
            <span className="app-nav-icon" aria-hidden="true">▦</span>
            <span className="app-nav-label">Dashboard</span>
            <span className="app-nav-soon">soon</span>
          </span>
          <Link
            href="/personalised-report"
            className="app-nav-item active"
            aria-current="page"
          >
            <span className="app-nav-icon" aria-hidden="true">▤</span>
            <span className="app-nav-label">Personalised Report</span>
          </Link>
          <span className="app-nav-item app-nav-disabled" aria-disabled="true">
            <span className="app-nav-icon" aria-hidden="true">⇄</span>
            <span className="app-nav-label">Transactions</span>
            <span className="app-nav-soon">soon</span>
          </span>
          <span className="app-nav-item app-nav-disabled" aria-disabled="true">
            <span className="app-nav-icon" aria-hidden="true">◔</span>
            <span className="app-nav-label">Portfolio</span>
            <span className="app-nav-soon">soon</span>
          </span>
          <span className="app-nav-item app-nav-disabled" aria-disabled="true">
            <span className="app-nav-icon" aria-hidden="true">◈</span>
            <span className="app-nav-label">Performance</span>
            <span className="app-nav-soon">soon</span>
          </span>
          <span className="app-nav-item app-nav-disabled" aria-disabled="true">
            <span className="app-nav-icon" aria-hidden="true">⚙</span>
            <span className="app-nav-label">Settings</span>
            <span className="app-nav-soon">soon</span>
          </span>
        </nav>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
