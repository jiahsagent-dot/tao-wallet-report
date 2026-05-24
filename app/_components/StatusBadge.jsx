'use client';

import { useEffect, useState } from 'react';

function formatCooldown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

export default function StatusBadge() {
  const [data, setData] = useState(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Soft-fail: never render a broken badge.
  if (errored) return null;
  if (!data) {
    return (
      <div className="status-badge status-badge-loading" aria-hidden="true">
        <span className="status-dot loading" />
        <span className="status-text">Checking live status…</span>
      </div>
    );
  }

  const ok = data.status === 'ok';
  const cooldown = data.providers?.pollinations?.cooldown;
  const remainingMs = cooldown?.remainingMs || 0;
  const reportEntries = data.caches?.report?.entries ?? 0;
  const insightsEntries = data.caches?.insights?.entries ?? 0;

  return (
    <div className="status-badge">
      <span className={`status-dot ${ok ? 'ok' : 'degraded'}`} aria-hidden="true" />
      <span className="status-text">
        <strong>Live status: {ok ? 'OK' : 'Degraded'}</strong>
        {' · '}
        Provider: <code>Pollinations</code>
        {data.aiDisabled && <> · <em>AI disabled</em></>}
        {remainingMs > 0 && (
          <> · Cooldown: <code>{formatCooldown(remainingMs)}</code></>
        )}
        {' · '}
        Cache: <code>{reportEntries}</code> reports / <code>{insightsEntries}</code> insights
        {data.region && data.region !== 'unknown' && (
          <> · Region: <code>{data.region}</code></>
        )}
      </span>
      <a className="status-link" href="/api/health" target="_blank" rel="noopener noreferrer">
        raw ↗
      </a>
    </div>
  );
}
