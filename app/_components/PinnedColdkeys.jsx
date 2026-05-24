'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'tao-wr:pinned-coldkeys';
const MAX_PINNED = 20;

function load() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e === 'object' && typeof e.coldkey === 'string',
    );
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

export function addPin(coldkey, note = '') {
  if (typeof window === 'undefined' || !coldkey) return;
  const list = load();
  if (list.some((e) => e.coldkey === coldkey)) return;
  list.unshift({ coldkey, note: String(note || '').slice(0, 80), pinnedAt: Date.now() });
  save(list.slice(0, MAX_PINNED));
}

export function removePin(coldkey) {
  save(load().filter((e) => e.coldkey !== coldkey));
}

export function updateNote(coldkey, note) {
  const list = load();
  const idx = list.findIndex((e) => e.coldkey === coldkey);
  if (idx === -1) return;
  list[idx] = { ...list[idx], note: String(note || '').slice(0, 80) };
  save(list);
}

function shortKey(k) {
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
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

  function onEditNote(coldkey, existing) {
    const next = window.prompt('Note for this pinned report:', existing || '');
    if (next === null) return; // cancelled
    updateNote(coldkey, next);
  }

  if (pinned.length === 0) return null;

  return (
    <div className="pinned">
      <span className="pinned-label">📌 Pinned</span>
      <div className="pinned-chips">
        {pinned.map(({ coldkey, note }) => (
          <span key={coldkey} className="pinned-chip">
            <Link href={`/report/${coldkey}`} className="pinned-chip-link" title={coldkey}>
              {shortKey(coldkey)}
            </Link>
            {note ? (
              <button
                type="button"
                className="pinned-chip-note"
                onClick={() => onEditNote(coldkey, note)}
                title="Click to edit note"
              >
                {note}
              </button>
            ) : (
              <button
                type="button"
                className="pinned-chip-note pinned-chip-note-add"
                onClick={() => onEditNote(coldkey, '')}
                title="Add a note"
              >
                + note
              </button>
            )}
            <button
              type="button"
              className="pinned-chip-x"
              onClick={() => removePin(coldkey)}
              title="Unpin this coldkey"
              aria-label={`Unpin ${shortKey(coldkey)}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
