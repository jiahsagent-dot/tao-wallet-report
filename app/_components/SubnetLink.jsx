'use client';

import { useCallback, useRef, useState } from 'react';

const fmt = (n, d = 2) =>
  n == null || !isFinite(n)
    ? '—'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

const fmtPct = (n, d = 1) =>
  n == null ? null : `${n >= 0 ? '+' : ''}${fmt(n, d)}%`;

function pctClass(n) {
  if (n == null) return '';
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}

// Build a per-render lookup keyed by netuid so SubnetLink can pull whatever
// fields are already in the report payload — no extra API call.
export function buildSubnetLookup(data) {
  const map = new Map();
  const upsert = (netuid, fields) => {
    if (netuid == null) return;
    const existing = map.get(netuid) || { netuid };
    map.set(netuid, { ...existing, ...fields });
  };
  for (const p of data?.portfolio?.top10 || []) {
    upsert(p.netuid, {
      name: p.name,
      priceTao: p.alphaPriceTao,
      pct1d: p.pct1d,
      pct7d: p.pct7d,
      holdingTao: p.taoValue,
      pctOfPortfolio: p.pctOfPortfolio,
    });
  }
  for (const m of data?.broader?.topMovers24h || []) {
    upsert(m.netuid, {
      name: m.name,
      priceTao: m.priceTao,
      pct1d: m.pct1d,
      volumeTao24h: m.volumeTao24h,
    });
  }
  for (const m of data?.broader?.topByVolume24h || []) {
    upsert(m.netuid, {
      name: m.name,
      priceTao: m.priceTao,
      pct1d: m.pct1d,
      volumeTao24h: m.volumeTao24h,
    });
  }
  return map;
}

export default function SubnetLink({ netuid, name, info, href }) {
  const [card, setCard] = useState(null); // { top, left } or null
  const linkRef = useRef(null);
  const enterTimer = useRef(null);
  const leaveTimer = useRef(null);

  const open = useCallback(() => {
    if (!linkRef.current) return;
    const r = linkRef.current.getBoundingClientRect();
    const CARD_W = 240;
    const margin = 8;
    let left = r.left;
    if (left + CARD_W + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - CARD_W - margin);
    }
    const top = r.bottom + 6;
    setCard({ top, left });
  }, []);

  const onEnter = useCallback(
    (e) => {
      // Skip touch / pen — hover cards on touch turn into sticky modals
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      if (enterTimer.current) clearTimeout(enterTimer.current);
      enterTimer.current = setTimeout(open, 80);
    },
    [open],
  );

  const onLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setCard(null), 150);
  }, []);

  const cardOnEnter = useCallback(() => {
    // Cursor moved INTO the card — cancel pending close.
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  return (
    <>
      <a
        ref={linkRef}
        className="subnet-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open subnet ${netuid} on Taostats`}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        {name}
      </a>
      {card && info && (
        <div
          className="subnet-hover-card"
          style={{ top: card.top, left: card.left }}
          onPointerEnter={cardOnEnter}
          onPointerLeave={onLeave}
          role="tooltip"
        >
          <div className="shc-head">
            <span className="shc-netuid">sn{info.netuid}</span>
            <span className="shc-name">{info.name || `Subnet ${info.netuid}`}</span>
          </div>
          <div className="shc-price">
            {info.priceTao != null ? `${fmt(info.priceTao, 6)} τ` : '—'}
            {info.pct1d != null && (
              <span className={`shc-pct ${pctClass(info.pct1d)}`}>
                {fmtPct(info.pct1d)}
              </span>
            )}
          </div>
          <div className="shc-rows">
            {info.pct7d != null && (
              <div className="shc-row">
                <span className="shc-lbl">7d</span>
                <span className={`shc-val ${pctClass(info.pct7d)}`}>{fmtPct(info.pct7d)}</span>
              </div>
            )}
            {info.holdingTao != null && (
              <div className="shc-row">
                <span className="shc-lbl">Your holding</span>
                <span className="shc-val">
                  {fmt(info.holdingTao)} τ
                  {info.pctOfPortfolio != null && (
                    <span className="shc-sub"> · {fmt(info.pctOfPortfolio, 1)}%</span>
                  )}
                </span>
              </div>
            )}
            {info.volumeTao24h != null && (
              <div className="shc-row">
                <span className="shc-lbl">Volume 24h</span>
                <span className="shc-val">{fmt(info.volumeTao24h, 0)} τ</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
