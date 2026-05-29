'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Tiny markdown renderer: handles ## headings, bullet/numbered lists, bold
// inline (rarely used by the prompt), and paragraphs. Avoids pulling react-
// markdown into the bundle for a 1-page feature.
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      flushList();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      continue;
    }
    // Ordered list "1. " or unordered list "- "
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (olMatch) {
      flushPara();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(olMatch[2]);
      continue;
    }
    if (ulMatch) {
      flushPara();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(ulMatch[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  const renderInline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return blocks.map((b, i) => {
    if (b.type === 'h2') return <h3 key={i} className="ai-h2">{b.text}</h3>;
    if (b.type === 'h3') return <h4 key={i} className="ai-h3">{b.text}</h4>;
    if (b.type === 'p') return <p key={i}>{renderInline(b.text)}</p>;
    if (b.type === 'ul') {
      return (
        <ul key={i}>
          {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ul>
      );
    }
    if (b.type === 'ol') {
      return (
        <ol key={i}>
          {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ol>
      );
    }
    return null;
  });
}

const CACHE_TTL_MS = 60 * 60 * 1000; // mirrors the 1h cache in lib/ai-insights.js

function formatTtl(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function AIInsights({ coldkey }) {
  const [state, setState] = useState({ status: 'loading' });
  const [tick, setTick] = useState(0); // forces re-render every second for the TTL countdown
  const sectionRef = useRef(null);
  const inViewRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchInsights = useCallback(
    (opts = {}) => {
      if (!coldkey) return () => {};
      let cancelled = false;
      setState((prev) => ({
        status: opts.force ? 'regenerating' : 'loading',
        data: opts.force ? prev.data : undefined,
      }));
      fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coldkey, force: !!opts.force }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (cancelled) return;
          if (!ok || !j.available) {
            setState({ status: 'error', error: j.error || 'unavailable' });
            return;
          }
          setState({ status: 'ready', data: j });
        })
        .catch((e) => {
          if (cancelled) return;
          setState({ status: 'error', error: String(e.message || e) });
        });
      return () => {
        cancelled = true;
      };
    },
    [coldkey],
  );

  useEffect(() => fetchInsights(), [fetchInsights]);

  // Tick the TTL countdown once a second while we have a ready response.
  useEffect(() => {
    if (state.status !== 'ready' || !state.data?.generatedAt) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.status, state.data?.generatedAt]);

  // Track whether the AI Insights card is on-screen so the keyboard shortcut
  // only fires when the user can actually see what it acts on.
  useEffect(() => {
    if (!sectionRef.current || typeof IntersectionObserver === 'undefined') {
      inViewRef.current = true; // fail open — better than dead key
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 },
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  // Keyboard shortcut: single 'r' (no modifier) regenerates when the card is
  // visible AND no input is focused. Intentionally NOT Cmd/Ctrl+R — that's
  // sacred browser-reload territory and surprising to hijack.
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key !== 'r' && e.key !== 'R') return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (!inViewRef.current) return;
      const s = stateRef.current.status;
      if (s !== 'ready') return; // don't double-fire mid-regenerate
      e.preventDefault();
      fetchInsights({ force: true });
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fetchInsights]);

  if (state.status === 'error') {
    // Iter 134 — preserve §0 in the DOM on LLM failure instead of returning
    // null. A silent-vanish meant every KB→§0 bridge from iters 117-132 was
    // invisible whenever Pollinations timed out (e.g. iter 133 verify). Keep
    // the heading + offer a retry so the page structure stays intact and the
    // user has a recovery path. Deterministic verdict fallback is iter 135.
    return (
      <section ref={sectionRef} className="card ai-insights ai-insights-error">
        <h2>
          <span className="num">§0</span> AI Insights
          <span className="ai-beta">beta</span>
          <button
            type="button"
            className="ai-regenerate"
            onClick={() => fetchInsights({ force: true })}
            title="Retry the AI narrative pass (or press R)"
          >
            ↻ Retry
          </button>
        </h2>
        <p className="ai-error-body">
          AI narrative unavailable right now — the deterministic report below
          (§1–§6) still has every number. Click <strong>Retry</strong> to try
          again; the LLM provider occasionally times out on long prompts.
        </p>
      </section>
    );
  }

  const isLoading = state.status === 'loading';
  const isRegenerating = state.status === 'regenerating';
  const showSkeleton = isLoading || (isRegenerating && !state.data);

  let ttlRemaining = null;
  if (state.status === 'ready' && state.data?.generatedAt) {
    const generatedMs = new Date(state.data.generatedAt).getTime();
    ttlRemaining = formatTtl(generatedMs + CACHE_TTL_MS - Date.now());
  }

  return (
    <section ref={sectionRef} className="card ai-insights">
      <h2>
        <span className="num">§0</span> AI Insights
        <span className="ai-beta">beta</span>
        {(state.status === 'ready' || isRegenerating) && (
          <>
            <button
              type="button"
              className="ai-regenerate"
              onClick={() => fetchInsights({ force: true })}
              disabled={isRegenerating}
              title="Bypass cache and generate a fresh analyst pass (or press R)"
            >
              {isRegenerating ? '↻ Regenerating…' : '↻ Regenerate'}
            </button>
            {state.status === 'ready' && !isRegenerating && (
              <span className="ai-shortcut-hint" aria-hidden="true">
                press <kbd>R</kbd>
              </span>
            )}
          </>
        )}
      </h2>
      {showSkeleton && (
        <div className="ai-loading">
          <div className="ai-shimmer ai-shimmer-h" />
          <div className="ai-shimmer ai-shimmer-line" />
          <div className="ai-shimmer ai-shimmer-line" />
          <div className="ai-shimmer ai-shimmer-line" style={{ width: '60%' }} />
          <div className="ai-loading-label">
            {isRegenerating ? 'Re-reading your portfolio…' : 'Generating personalised analyst report…'}
          </div>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="ai-markdown">{renderMarkdown(state.data.text)}</div>
          <p className="ai-meta">
            Generated by <code>{state.data.model}</code> via{' '}
            <code>{state.data.provider}</code>
            {state.data.cached ? ' · cached' : ''}
            {ttlRemaining && (
              <span className="ai-ttl-countdown"> · refreshes free for {ttlRemaining}</span>
            )}
            {' · '}
            personalised summary of the structured data below — not financial advice.
          </p>
          <p className="ai-footnote">
            Powered by{' '}
            <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer">
              GPT-OSS 20B Reasoning via Pollinations
            </a>
            {' · '}
            zero-key anonymous tier
          </p>
        </>
      )}
    </section>
  );
}
