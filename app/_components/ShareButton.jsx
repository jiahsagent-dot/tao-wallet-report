'use client';

import { useState } from 'react';

export default function ShareButton({ coldkey }) {
  const [copied, setCopied] = useState(false);
  // Build URL on click so SSR doesn't bake in localhost in dev or
  // a stale origin in preview deploys.
  async function share() {
    const url = `${window.location.origin}/report/${coldkey}`;
    try {
      // Try the native Web Share API first (mobile)
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Tao Wallet Report',
            text: `Check out this Bittensor wallet report`,
            url,
          });
          return;
        } catch {
          // user dismissed; fall through to copy
        }
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button className="share-btn" onClick={share} type="button" title="Share permalink to this report">
      <span className="share-icon">🔗</span>
      <span>{copied ? '✓ Link copied' : 'Share this report'}</span>
    </button>
  );
}
