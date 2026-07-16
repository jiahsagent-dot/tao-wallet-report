'use client';

import { useEffect, useState } from 'react';
import {
  loadWallets,
  loadActive,
  addWallet,
  removeWallet,
  renameWallet,
  setActiveWallet,
  subscribe,
  shortKey,
} from '../../lib/wallet-store';

// Iter 381: localStorage-backed wallet CRUD for the Settings Wallets card.
// Add / remove / rename coldkeys and mark one active — the active wallet is what
// the app-shell pages (Dashboard, Transactions, Portfolio, Performance) will
// render once they land.
export default function WalletManager() {
  const [wallets, setWallets] = useState([]);
  const [active, setActive] = useState(null);
  const [coldkey, setColdkey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setWallets(loadWallets());
      setActive(loadActive());
    };
    refresh();
    setHydrated(true);
    return subscribe(refresh);
  }, []);

  function onAdd(e) {
    e.preventDefault();
    const res = addWallet(coldkey, label);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setColdkey('');
    setLabel('');
    setError('');
  }

  function onRename(w) {
    const next = window.prompt('Label for this wallet (e.g. Root, Subnets, Mantat):', w.label || '');
    if (next === null) return;
    renameWallet(w.coldkey, next);
  }

  // Server render and pre-hydration render must match, so hold the empty-state
  // copy until localStorage has been read on the client.
  if (!hydrated) {
    return (
      <p style={{ color: 'var(--dim)', marginBottom: 0, fontSize: 14 }}>
        Loading your wallets…
      </p>
    );
  }

  return (
    <div className="wallet-manager">
      <form className="wallet-add" onSubmit={onAdd}>
        <input
          className="input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Coldkey (SS58, starts with 5)"
          value={coldkey}
          onChange={(e) => setColdkey(e.target.value)}
          aria-label="Wallet coldkey"
        />
        <input
          className="input"
          type="text"
          autoComplete="off"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Wallet label"
          style={{ flex: '1 1 180px' }}
        />
        <button className="btn" type="submit">Add wallet</button>
      </form>
      {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}

      {wallets.length === 0 ? (
        <p style={{ color: 'var(--dim)', marginTop: 16, marginBottom: 0, fontSize: 14 }}>
          No wallets yet. Add a Bittensor coldkey above — the first one becomes your
          active wallet and will drive the app once the shell pages land.
        </p>
      ) : (
        <ul className="wallet-list">
          {wallets.map((w) => {
            const isActive = w.coldkey === active;
            return (
              <li
                key={w.coldkey}
                className={`wallet-row${isActive ? ' wallet-row-active' : ''}`}
              >
                <button
                  type="button"
                  className="wallet-active-dot"
                  onClick={() => setActiveWallet(w.coldkey)}
                  aria-pressed={isActive}
                  title={isActive ? 'Active wallet' : 'Make active'}
                >
                  {isActive ? '●' : '○'}
                </button>
                <div className="wallet-id">
                  <span className="wallet-label">
                    {w.label || 'unnamed'}
                    {isActive && <span className="wallet-active-tag"> active</span>}
                  </span>
                  <span className="wallet-addr" title={w.coldkey}>{shortKey(w.coldkey)}</span>
                </div>
                <div className="wallet-row-actions">
                  <button type="button" className="wallet-action" onClick={() => onRename(w)}>
                    rename
                  </button>
                  <button
                    type="button"
                    className="wallet-action wallet-action-del"
                    onClick={() => removeWallet(w.coldkey)}
                  >
                    remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
