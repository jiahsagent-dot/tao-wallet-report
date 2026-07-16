import WalletManager from './WalletManager';

// Iter 380: Settings skeleton. Iter 381: the Wallets card now hosts the
// localStorage-backed WalletManager (add/remove/rename + active-wallet marker).
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
        <p style={{ color: 'var(--dim)', marginTop: 0, marginBottom: 16, fontSize: 14 }}>
          Add the Bittensor coldkeys you track. The active wallet drives Dashboard,
          Transactions, Portfolio, and Performance across the app. Stored only on
          this device.
        </p>
        <WalletManager />
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
