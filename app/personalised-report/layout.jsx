import Link from 'next/link';

export const metadata = {
  title: 'Personalised Report — Tao app',
  description:
    'Generate a personalised Bittensor report for any coldkey: portfolio, PnL, yield, flags, AI insights. Free, public data only.',
};

export default function PersonalisedReportLayout({ children }) {
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
          <Link
            href="/personalised-report"
            className="app-nav-item active"
            aria-current="page"
          >
            <span className="app-nav-icon" aria-hidden="true">📄</span>
            <span className="app-nav-label">Personalised Report</span>
          </Link>
        </nav>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
