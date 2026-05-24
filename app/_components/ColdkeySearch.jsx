'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPinned } from './PinnedColdkeys.jsx';
import { loadRecent } from './RecentColdkeys.jsx';

const MAX_CANDIDATES = 8;

function shortKey(k) {
  return `${k.slice(0, 8)}…${k.slice(-8)}`;
}

function buildCandidates() {
  const pinned = loadPinned().map((p) => ({
    kind: 'pinned',
    coldkey: p.coldkey,
    note: p.note || '',
  }));
  const recent = loadRecent().map((c) => ({ kind: 'recent', coldkey: c, note: '' }));
  const seen = new Set();
  const merged = [];
  for (const item of [...pinned, ...recent]) {
    if (seen.has(item.coldkey)) continue;
    seen.add(item.coldkey);
    merged.push(item);
    if (merged.length >= MAX_CANDIDATES) break;
  }
  return merged;
}

export default function ColdkeySearch({
  value,
  onChange,
  onPick,
  placeholder,
  disabled,
  name = 'coldkey',
}) {
  const [candidates, setCandidates] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setCandidates(buildCandidates());
    const refresh = () => setCandidates(buildCandidates());
    window.addEventListener('tao-wr:pinned-updated', refresh);
    window.addEventListener('tao-wr:recent-updated', refresh);
    const onStorage = (e) => {
      if (e.key === 'tao-wr:pinned-coldkeys' || e.key === 'tao-wr:recent-coldkeys') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('tao-wr:pinned-updated', refresh);
      window.removeEventListener('tao-wr:recent-updated', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const v = (value || '').trim().toLowerCase();
    if (!v) return candidates;
    return candidates.filter(
      (c) =>
        c.coldkey.toLowerCase().includes(v) ||
        (c.note && c.note.toLowerCase().includes(v)),
    );
  }, [candidates, value]);

  const pick = useCallback(
    (item) => {
      if (!item) return;
      onChange(item.coldkey);
      setOpen(false);
      setActiveIdx(-1);
      if (onPick) onPick(item.coldkey);
    },
    [onChange, onPick],
  );

  function onKeyDown(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < filtered.length) {
        e.preventDefault();
        pick(filtered[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  const showDropdown = open && filtered.length > 0;

  return (
    <div className="coldkey-search-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        name={name}
        className="input"
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="coldkey-search-list"
      />
      {showDropdown && (
        <ul
          className="coldkey-search-dropdown"
          id="coldkey-search-list"
          role="listbox"
        >
          {filtered.map((item, i) => (
            <li
              key={item.coldkey}
              role="option"
              aria-selected={i === activeIdx}
              className={`coldkey-search-item${i === activeIdx ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focus
                pick(item);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="coldkey-search-item-icon" aria-hidden="true">
                {item.kind === 'pinned' ? '★' : '🕐'}
              </span>
              <span className="coldkey-search-item-key">{shortKey(item.coldkey)}</span>
              {item.note && (
                <span className="coldkey-search-item-meta">{item.note}</span>
              )}
              <span className="coldkey-search-item-kind">{item.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
