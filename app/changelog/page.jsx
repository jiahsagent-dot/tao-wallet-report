import Link from 'next/link';
import { ENTRIES, TAG_TONE } from '../../lib/changelog-entries.js';

const TITLE = 'Changelog — Tao Wallet Report';
const DESCRIPTION =
  'What\'s new in Tao Wallet Report — every shipped change, most recent first. We ship constantly.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/changelog',
    types: {
      'application/atom+xml': '/changelog/feed.xml',
      'application/feed+json': '/changelog/feed.json',
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/changelog',
    siteName: 'Tao Wallet Report',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

function formatDate(d) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  return (
    <main className="wrap">
      <header className="head">
        <Link href="/" className="back-link">← Back to the report tool</Link>
        <h1>Changelog</h1>
        <p className="sub">
          What&apos;s shipped. Newest first. We ship constantly — if something
          is missing that you&apos;d find useful,{' '}
          <a
            href="https://github.com/jiahsagent-dot/tao-wallet-report/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            open an issue
          </a>
          .
        </p>
        <div className="feed-row">
          <span className="feed-row-label">Subscribe:</span>
          <a className="feed-pill feed-pill-atom" href="/changelog/feed.xml">
            <span className="feed-pill-icon" aria-hidden="true">⤳</span> RSS / Atom
          </a>
          <a className="feed-pill feed-pill-json" href="/changelog/feed.json">
            <span className="feed-pill-icon" aria-hidden="true">{`{}`}</span> JSON Feed
          </a>
        </div>
      </header>

      <article className="changelog">
        {ENTRIES.map((e, i) => (
          <section className="changelog-entry" id={`entry-${i}`} key={i}>
            <header className="changelog-entry-head">
              <time className="changelog-date">{formatDate(e.date)}</time>
              <span className={`changelog-tag ${TAG_TONE[e.tag] || ''}`}>{e.tag}</span>
            </header>
            <h2 className="changelog-title">{e.title}</h2>
            <p className="changelog-body">{e.body}</p>
            {e.links?.length > 0 && (
              <p className="changelog-links">
                {e.links.map((l, j) => (
                  <Link key={j} href={l.href}>
                    {l.label} →
                  </Link>
                ))}
              </p>
            )}
          </section>
        ))}
      </article>

      <footer className="foot">
        <p>
          <Link href="/">← Back to the report tool</Link>
          {' · '}
          <Link href="/about">How it works</Link>
          {' · '}
          <Link href="/press">Press kit</Link>
          {' · '}
          <a href="/changelog/feed.xml">RSS</a>
          {' · '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report/commits/main" target="_blank" rel="noopener noreferrer">
            Full commit log on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
