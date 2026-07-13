import Link from 'next/link';

export const metadata = {
  title: 'Settings — Tao app',
  description:
    'Manage your Bittensor coldkey wallet list, appearance, and preferences for the Tao app.',
};

// Iter 380: Settings page owns the multi-wallet CRUD surface (coming online in
// a later iter). For now this layout just renders the same app-shell sidebar
// as /personalised-report but with Settings marked active — so the nav slot
// added in iter 379 is now a real destination, not a "soon" pill.
export default function SettingsLayout({ children }) {
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
          <Link href="/personalised-report" className="app-nav-item">
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
          <Link
            href="/settings"
            className="app-nav-item active"
            aria-current="page"
          >
            <span className="app-nav-icon" aria-hidden="true">⚙</span>
            <span className="app-nav-label">Settings</span>
          </Link>
        </nav>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
