'use client';

import { useState } from 'react';

export default function WeeklyEmailCTA({ defaultColdkey }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function start(e) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/start-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, coldkey: defaultColdkey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSession(j);
      setStatus('pending');
      pollStatus(j.sessionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function pollStatus(sessionId) {
    const deadline = Date.now() + 11 * 60_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch('/api/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const j = await r.json();
        if (j.status === 'confirmed') {
          setStatus('confirmed');
          return;
        }
        if (j.status === 'expired') {
          setStatus('expired');
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
    setStatus('expired');
  }

  if (!open) {
    return (
      <section className="cta" id="subscribe">
        <h3>📬 Want this every Monday?</h3>
        <p>
          A fresh personalised report delivered to your inbox every Monday morning.
          Same numbers, same format, same data source — but you don&apos;t have to remember to check.
          <br />
          <strong>One-time ~0.01 τ (~$3 USD). 30 days of weekly emails.</strong>
        </p>
        <button className="btn" onClick={() => setOpen(true)}>Subscribe for ~$3 TAO</button>
      </section>
    );
  }

  if (status === 'confirmed') {
    return (
      <section className="cta confirmed">
        <h3>✓ Payment received</h3>
        <p>You&apos;ll get your first weekly report Monday morning at <code>{email}</code>. Thank you!</p>
      </section>
    );
  }

  if (status === 'expired') {
    return (
      <section className="cta expired">
        <h3>Session expired</h3>
        <p>Didn&apos;t see your payment in time. <button className="link-btn" onClick={() => { setSession(null); setStatus(null); }}>Try again</button></p>
      </section>
    );
  }

  if (session) {
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&bgcolor=131720&color=eef0f4&data=${encodeURIComponent(session.address)}`;
    return (
      <section className="cta paying">
        <h3>Send exactly <span className="amount">{session.amountTao.toFixed(4)} τ</span></h3>
        <p className="hint">to the address below. We poll every 5 seconds. Window: 10 minutes.</p>
        <div className="pay-grid">
          <div className="pay-info">
            <div className="kv"><span className="lbl">Amount</span><code className="code-big">{session.amountTao.toFixed(4)} τ</code></div>
            <div className="kv"><span className="lbl">To</span><code className="code-addr">{session.address}</code></div>
            <div className="kv"><span className="lbl">Email</span><code>{email}</code></div>
            <p className="status">Waiting for confirmation… <span className="spin">●</span></p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" width="180" height="180" />
        </div>
      </section>
    );
  }

  return (
    <section className="cta">
      <h3>Get weekly reports</h3>
      <form onSubmit={start} className="cta-form">
        <input
          type="email"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn" disabled={submitting || !email}>
          {submitting ? 'Starting…' : 'Continue'}
        </button>
      </form>
      {error && <div className="err" style={{ marginTop: 12 }}>⚠ {error}</div>}
      <p className="hint">Send ~0.01 τ (~$3) once. We&apos;ll email you a fresh report every Monday for 30 days.</p>
    </section>
  );
}
