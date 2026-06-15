'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'tao-wr:pinned-coldkeys';
const MAX_PINNED = 20;
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

function normaliseEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.coldkey !== 'string') return null;
  return {
    coldkey: e.coldkey,
    label: typeof e.label === 'string' ? e.label : '',
    note: typeof e.note === 'string' ? e.note : '',
    pinnedAt: typeof e.pinnedAt === 'number' ? e.pinnedAt : Date.now(),
    lastBalanceTao:
      typeof e.lastBalanceTao === 'number' && isFinite(e.lastBalanceTao)
        ? e.lastBalanceTao
        : null,
    lastProfitTao:
      typeof e.lastProfitTao === 'number' && isFinite(e.lastProfitTao)
        ? e.lastProfitTao
        : null,
    lastReturnPct:
      typeof e.lastReturnPct === 'number' && isFinite(e.lastReturnPct)
        ? e.lastReturnPct
        : null,
    lastSnapshotAt:
      typeof e.lastSnapshotAt === 'number' ? e.lastSnapshotAt : null,
  };
}

function load() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normaliseEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tao-wr:pinned-updated'));
  }
}

export function isPinned(coldkey) {
  return load().some((e) => e.coldkey === coldkey);
}

export function loadPinned() {
  return load();
}

export function addPin(coldkey, opts = {}) {
  if (typeof window === 'undefined' || !coldkey) return;
  // Backward compat: opts used to be a plain note string.
  const norm =
    typeof opts === 'string'
      ? { note: opts }
      : opts && typeof opts === 'object'
        ? opts
        : {};
  const list = load();
  if (list.some((e) => e.coldkey === coldkey)) return;
  const entry = normaliseEntry({
    coldkey,
    label: String(norm.label || '').slice(0, 40),
    note: String(norm.note || '').slice(0, 80),
    pinnedAt: Date.now(),
    lastBalanceTao: norm.lastBalanceTao,
    lastProfitTao: norm.lastProfitTao,
    lastReturnPct: norm.lastReturnPct,
    lastSnapshotAt:
      norm.lastBalanceTao != null || norm.lastProfitTao != null ? Date.now() : null,
  });
  list.unshift(entry);
  save(list.slice(0, MAX_PINNED));
}

export function removePin(coldkey) {
  save(load().filter((e) => e.coldkey !== coldkey));
}

export function updateLabel(coldkey, label) {
  const list = load();
  const idx = list.findIndex((e) => e.coldkey === coldkey);
  if (idx === -1) return;
  list[idx] = { ...list[idx], label: String(label || '').slice(0, 40) };
  save(list);
}

export function updateNote(coldkey, note) {
  const list = load();
  const idx = list.findIndex((e) => e.coldkey === coldkey);
  if (idx === -1) return;
  list[idx] = { ...list[idx], note: String(note || '').slice(0, 80) };
  save(list);
}

// Persist the latest portfolio snapshot for a pinned wallet so the saved-wallet
// card can show balance + PnL on the next visit WITHOUT any API call. Called
// from PinButton when a report renders for a coldkey that's already pinned.
export function updatePinSnapshot(coldkey, snap) {
  if (!coldkey || !snap || typeof snap !== 'object') return;
  const list = load();
  const idx = list.findIndex((e) => e.coldkey === coldkey);
  if (idx === -1) return;
  const cur = list[idx];
  const next = {
    ...cur,
    lastBalanceTao:
      typeof snap.currentPortfolioTao === 'number' && isFinite(snap.currentPortfolioTao)
        ? snap.currentPortfolioTao
        : cur.lastBalanceTao,
    lastProfitTao:
      typeof snap.profitTao === 'number' && isFinite(snap.profitTao)
        ? snap.profitTao
        : cur.lastProfitTao,
    lastReturnPct:
      typeof snap.returnPct === 'number' && isFinite(snap.returnPct)
        ? snap.returnPct
        : cur.lastReturnPct,
    lastSnapshotAt: Date.now(),
  };
  // Avoid a save if nothing actually changed (cuts the cross-tab event spam).
  if (
    next.lastBalanceTao === cur.lastBalanceTao &&
    next.lastProfitTao === cur.lastProfitTao &&
    next.lastReturnPct === cur.lastReturnPct
  ) {
    return;
  }
  list[idx] = next;
  save(list);
}

function shortKey(k) {
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}

function fmtTao(n) {
  if (n == null || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(3)} τ`;
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—';
  const v = n * 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtAge(ms) {
  if (!ms) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function PinnedColdkeys() {
  const [pinned, setPinned] = useState([]);

  useEffect(() => {
    setPinned(load());
    const refresh = () => setPinned(load());
    window.addEventListener('tao-wr:pinned-updated', refresh);
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('tao-wr:pinned-updated', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function onEditLabel(coldkey, existing) {
    const next = window.prompt(
      'Label for this saved wallet (e.g. Subnets, Mantat, Root):',
      existing || '',
    );
    if (next === null) return;
    updateLabel(coldkey, next);
  }

  function onAddWallet() {
    const ck = window.prompt(
      'Wallet coldkey (SS58, starts with 5, 48 chars):',
      '',
    );
    if (!ck) return;
    const key = ck.trim();
    if (!SS58_RE.test(key)) {
      window.alert(
        'That doesn\'t look like a valid Bittensor SS58 coldkey. Should start with 5 and be 48 characters.',
      );
      return;
    }
    if (isPinned(key)) {
      window.alert('This wallet is already saved.');
      return;
    }
    const label = window.prompt('Label this wallet (e.g. Subnets, Mantat, Root):', '');
    if (label === null) return;
    addPin(key, { label });
  }

  return (
    <section className="saved-wallets">
      <div className="saved-wallets-head">
        <h2 className="saved-wallets-title">
          {pinned.length > 0 ? '⭐ Your saved wallets' : '⭐ Save a wallet for instant access'}
        </h2>
        <button
          type="button"
          className="saved-wallets-add"
          onClick={onAddWallet}
          title="Save a wallet address with a friendly label"
        >
          + Add wallet
        </button>
      </div>
      {pinned.length === 0 ? (
        <p className="saved-wallets-empty">
          Add your Bittensor coldkeys here with a label (e.g. Subnets, Mantat, Root).
          Balance and PnL are cached on your device — they show instantly on every visit,
          no waiting for the API.
        </p>
      ) : (
        <div className="saved-wallet-grid">
          {pinned.map((p) => {
            const display = p.label || p.note || '';
            const hasSnap = p.lastBalanceTao != null || p.lastProfitTao != null;
            const pnlTone =
              p.lastProfitTao == null
                ? ''
                : p.lastProfitTao > 0
                  ? ' pos'
                  : p.lastProfitTao < 0
                    ? ' neg'
                    : '';
            return (
              <div key={p.coldkey} className="saved-wallet-card">
                <Link
                  href={`/report/${p.coldkey}`}
                  className="saved-wallet-link"
                  title={p.coldkey}
                >
                  <div className="saved-wallet-label-row">
                    {display ? (
                      <span className="saved-wallet-label">{display}</span>
                    ) : (
                      <span className="saved-wallet-label saved-wallet-label-empty">
                        unnamed
                      </span>
                    )}
                    <span className="saved-wallet-addr">{shortKey(p.coldkey)}</span>
                  </div>
                  {hasSnap ? (
                    <div className="saved-wallet-snap">
                      <div className="saved-wallet-balance">
                        {p.lastBalanceTao != null
                          ? `${p.lastBalanceTao.toFixed(3)} τ`
                          : '—'}
                      </div>
                      <div className={`saved-wallet-pnl${pnlTone}`}>
                        {fmtTao(p.lastProfitTao)}
                        {p.lastReturnPct != null && (
                          <span className="saved-wallet-pnl-pct">
                            {' '}({fmtPct(p.lastReturnPct)})
                          </span>
                        )}
                      </div>
                      <div className="saved-wallet-age">
                        snapshot {fmtAge(p.lastSnapshotAt)}
                      </div>
                    </div>
                  ) : (
                    <div className="saved-wallet-snap saved-wallet-snap-empty">
                      Open report to capture balance
                    </div>
                  )}
                </Link>
                <div className="saved-wallet-actions">
                  <button
                    type="button"
                    className="saved-wallet-action"
                    onClick={() => onEditLabel(p.coldkey, display)}
                    title="Rename this wallet"
                  >
                    ✎ rename
                  </button>
                  <button
                    type="button"
                    className="saved-wallet-action saved-wallet-action-del"
                    onClick={() => removePin(p.coldkey)}
                    title="Forget this wallet"
                  >
                    × remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
