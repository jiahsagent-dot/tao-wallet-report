'use client';

import { useCallback, useState } from 'react';

function composeText(pnl) {
  const gt = pnl;
  if (gt?.available && Number.isFinite(gt.profitTao) && Number.isFinite(gt.returnPct)) {
    const sign = gt.profitTao >= 0 ? '+' : '';
    const pctSign = gt.returnPct >= 0 ? '+' : '';
    const days = Number(gt.effectiveWindowDays) || 365;
    return `Bittensor PnL last ${days}d: ${sign}${gt.profitTao.toFixed(3)} τ (${pctSign}${(gt.returnPct * 100).toFixed(2)}%) — full report:`;
  }
  return 'Live Bittensor wallet report:';
}

export default function ShareToXButton({ coldkey, pnl }) {
  const [state, setState] = useState('idle'); // idle | opened

  const onClick = useCallback(() => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://tao-wallet-report.vercel.app';
    const url = `${origin}/report/${coldkey}`;
    const text = composeText(pnl);
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer,width=600,height=500');
    setState('opened');
    setTimeout(() => setState('idle'), 1500);
  }, [coldkey, pnl]);

  return (
    <button
      type="button"
      className={`share-x-btn${state === 'opened' ? ' opened' : ''}`}
      onClick={onClick}
      title="Tweet this report — the OG card unfurls with live PnL"
      aria-label="Share this report to X (Twitter)"
    >
      <span className="share-x-icon" aria-hidden="true">𝕏</span>
      <span>{state === 'opened' ? 'Opened' : 'Share to X'}</span>
    </button>
  );
}
