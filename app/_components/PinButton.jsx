'use client';

import { useEffect, useState } from 'react';
import { addPin, removePin, isPinned, updatePinSnapshot } from './PinnedColdkeys.jsx';

function snapshotFromPnl(pnl) {
  if (!pnl || typeof pnl !== 'object' || !pnl.available) return null;
  const snap = {};
  if (typeof pnl.currentPortfolioTao === 'number') snap.currentPortfolioTao = pnl.currentPortfolioTao;
  if (typeof pnl.profitTao === 'number') snap.profitTao = pnl.profitTao;
  if (typeof pnl.returnPct === 'number') snap.returnPct = pnl.returnPct;
  return Object.keys(snap).length > 0 ? snap : null;
}

export default function PinButton({ coldkey, pnl }) {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    setPinned(isPinned(coldkey));
    const refresh = () => setPinned(isPinned(coldkey));
    window.addEventListener('tao-wr:pinned-updated', refresh);
    const onStorage = (e) => {
      if (e.key === 'tao-wr:pinned-coldkeys') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('tao-wr:pinned-updated', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [coldkey]);

  // Whenever the current report's PnL data lands AND this coldkey is already
  // pinned, refresh its cached balance/PnL snapshot so the saved-wallet card
  // shows current numbers on the next visit. Cheap no-op when nothing changed.
  useEffect(() => {
    if (!pinned) return;
    const snap = snapshotFromPnl(pnl);
    if (snap) updatePinSnapshot(coldkey, snap);
  }, [coldkey, pinned, pnl]);

  function toggle() {
    if (pinned) {
      removePin(coldkey);
      return;
    }
    const label = window.prompt(
      'Save this wallet. Label it (e.g. Subnets, Mantat, Root) or leave blank:',
      '',
    );
    if (label === null) return; // cancelled
    const snap = snapshotFromPnl(pnl) || {};
    addPin(coldkey, { label, ...snap });
  }

  return (
    <button
      type="button"
      className={`pin-btn${pinned ? ' pinned' : ''}`}
      onClick={toggle}
      title={pinned ? 'Forget this wallet' : 'Save this wallet for instant access'}
      aria-pressed={pinned}
    >
      <span className="pin-icon">{pinned ? '★' : '☆'}</span>
      <span>{pinned ? 'Saved' : 'Save wallet'}</span>
    </button>
  );
}
