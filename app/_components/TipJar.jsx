'use client';

import { useState } from 'react';

export default function TipJar({ address }) {
  const [copied, setCopied] = useState(false);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&bgcolor=131720&color=eef0f4&data=${encodeURIComponent(address)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <section className="tipjar">
      <div className="tipjar-content">
        <div className="tipjar-text">
          <h3>Useful? Tip TAO.</h3>
          <p className="tipjar-hint">
            Suggested: <strong>0.01 τ</strong> (~$3 USD). Any amount keeps this tool free.
          </p>
          <button className="tipjar-addr" onClick={copy} title="Click to copy">
            <code>{address}</code>
            <span className="copy-badge">{copied ? '✓ copied' : 'copy'}</span>
          </button>
          <p className="tipjar-meta">
            Send via your Bittensor wallet (taostats / Polkadot.js extension / mobile app).
          </p>
        </div>
        <div className="tipjar-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Donation QR code" width="160" height="160" />
        </div>
      </div>
    </section>
  );
}
