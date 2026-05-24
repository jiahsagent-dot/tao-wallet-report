'use client';

import { useState } from 'react';

export default function CopyBlock({ label, text, multiline = false }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="copy-block">
      <div className="copy-block-head">
        <span className="copy-block-label">{label}</span>
        <button type="button" className="copy-block-btn" onClick={copy}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      {multiline ? (
        <pre className="copy-block-body">{text}</pre>
      ) : (
        <p className="copy-block-body">{text}</p>
      )}
    </div>
  );
}
