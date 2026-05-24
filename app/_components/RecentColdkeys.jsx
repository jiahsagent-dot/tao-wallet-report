'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'tao-wr:recent-coldkeys';
const MAX_RECENT = 5;

function load() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

// Read-only helper for components that want the recent list without mounting
// the chips UI (e.g. ColdkeySearch typeahead).
export function loadRecent() {
  return load();
}

// Pure helper exported for testability + so other components can call it
// without dragging in the React UI.
export function addRecent(coldkey) {
  if (typeof window === 'undefined' || !coldkey) return;
  const list = load();
  const filtered = list.filter((c) => c !== coldkey);
  filtered.unshift(coldkey);
  save(filtered.slice(0, MAX_RECENT));
  // Notify any mounted <RecentColdkeys> instances on this tab.
  window.dispatchEvent(new CustomEvent('tao-wr:recent-updated'));
}

function shortKey(k) {
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}

export default function RecentColdkeys() {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    setRecent(load());
    const refresh = () => setRecent(load());
    window.addEventListener('tao-wr:recent-updated', refresh);
    // Also refresh if the user changes recents in another tab.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener('tao-wr:recent-updated', refresh);
    };
  }, []);

  function removeOne(k) {
    const next = recent.filter((c) => c !== k);
    save(next);
    setRecent(next);
  }

  function clearAll() {
    save([]);
    setRecent([]);
  }

  if (recent.length === 0) return null;

  return (
    <div className="recent">
      <span className="recent-label">Recently viewed</span>
      <div className="recent-chips">
        {recent.map((k) => (
          <span key={k} className="recent-chip">
            <Link href={`/report/${k}`} className="recent-chip-link" title={k}>
              {shortKey(k)}
            </Link>
            <button
              type="button"
              className="recent-chip-x"
              onClick={() => removeOne(k)}
              title="Forget this coldkey"
              aria-label={`Remove ${shortKey(k)}`}
            >
              ×
            </button>
          </span>
        ))}
        {recent.length > 1 && (
          <button type="button" className="recent-clear" onClick={clearAll}>
            clear all
          </button>
        )}
      </div>
    </div>
  );
}
