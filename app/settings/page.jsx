// Iter 380: Settings skeleton — container + heading + one empty-state card per
// coming subsection (wallets, appearance). No state yet; the wallet-list CRUD
// (localStorage-backed) is the next iter's work. Ships the destination so the
// sidebar link out of iter 379 has somewhere to land.
export default function SettingsPage() {
  return (
    <div className="wrap">
      <header className="head">
        <h1>Settings</h1>
        <p className="sub">
          Manage the Bittensor coldkeys you track and how the Tao app looks.
        </p>
      </header>

      <section className="card" aria-labelledby="settings-wallets-h">
        <h2 id="settings-wallets-h">Wallets</h2>
        <p style={{ color: 'var(--dim)', marginBottom: 0, fontSize: 14 }}>
          You'll be able to add, rename, and remove Bittensor coldkeys here.
          The active wallet will drive Dashboard, Transactions, Portfolio, and
          Performance across the app. Coming in the next iter.
        </p>
      </section>

      <section className="card" aria-labelledby="settings-appearance-h">
        <h2 id="settings-appearance-h">Appearance</h2>
        <p style={{ color: 'var(--dim)', marginBottom: 0, fontSize: 14 }}>
          Light/dark theme toggle lands here once the app shell has stabilised.
        </p>
      </section>
    </div>
  );
}
