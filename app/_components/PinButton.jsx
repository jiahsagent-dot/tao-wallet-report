'use client';

import { useEffect, useState } from 'react';
import { addPin, removePin, isPinned } from './PinnedColdkeys.jsx';

export default function PinButton({ coldkey }) {
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

  function toggle() {
    if (pinned) {
      removePin(coldkey);
      return;
    }
    const note = window.prompt(
      'Pin this report. Add an optional note (e.g. "watching SN21 closely"), or leave blank:',
      '',
    );
    if (note === null) return; // cancelled
    addPin(coldkey, note);
  }

  return (
    <button
      type="button"
      className={`pin-btn${pinned ? ' pinned' : ''}`}
      onClick={toggle}
      title={pinned ? 'Unpin this report' : 'Pin this report (and add an optional note)'}
      aria-pressed={pinned}
    >
      <span className="pin-icon">{pinned ? '★' : '☆'}</span>
      <span>{pinned ? 'Pinned' : 'Pin this report'}</span>
    </button>
  );
}
