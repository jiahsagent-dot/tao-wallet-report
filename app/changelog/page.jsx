import Link from 'next/link';

const TITLE = 'Changelog — Tao Wallet Report';
const DESCRIPTION =
  'What\'s new in Tao Wallet Report — every shipped change, most recent first. We ship constantly.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/changelog' },
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

// User-facing changes only — internal refactors and bugfixes are in the git
// log. Each entry: { date (YYYY-MM-DD), tag, title, body, links? }
const ENTRIES = [
  {
    date: '2026-05-24',
    tag: 'Press kit',
    title: 'New /press page with one-click copy blocks',
    body:
      'Tweet-length, paragraph-length, and long-form descriptions ready to paste. Logo in SVG + PNG. Two dynamic OG-image previews. Facts table and pull-quotes. So anyone writing about the tool has the right artifacts in 10 seconds.',
    links: [{ label: 'Press kit', href: '/press' }],
  },
  {
    date: '2026-05-24',
    tag: 'Retention',
    title: 'Recently-viewed coldkey chips',
    body:
      'Last 5 coldkeys you looked at show as one-click chips below the input. Stored in localStorage (nothing leaves your browser). Per-chip ×, plus a clear-all button. Synced across tabs.',
  },
  {
    date: '2026-05-24',
    tag: 'SEO',
    title: 'JSON-LD structured data',
    body:
      'WebApplication schema site-wide. FAQPage + HowTo schemas on /about. Google can now render an expandable FAQ accordion inline in search results and a step-by-step rich snippet for "how to calculate bittensor PnL" queries.',
  },
  {
    date: '2026-05-24',
    tag: 'Trust',
    title: 'New /about page — methodology, data sources, FAQ',
    body:
      'Plain-English explanation of the PnL formula, where the data comes from, what the tool does and does NOT do, and why your numbers might differ slightly from your own spreadsheet.',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    date: '2026-05-24',
    tag: 'Credibility',
    title: 'Taostats cross-links throughout the report',
    body:
      'New "verify on Taostats ↗" link in the report header. Every subnet name in the Portfolio and Broader Market tables links to its Taostats subnet page. Skeptics can fact-check the data in one click.',
  },
  {
    date: '2026-05-24',
    tag: 'Viral',
    title: 'Permalink pages with dynamic per-coldkey OG images',
    body:
      'Every report is now a shareable URL at /report/<coldkey>. Sharing it on Twitter, Telegram, Discord, etc shows a custom preview card with the actual PnL number for that wallet — colour-coded green/red.',
  },
  {
    date: '2026-05-24',
    tag: 'Social proof',
    title: 'Usage counter on the homepage',
    body:
      'Live "📊 X reports generated so far" badge below the subhead. Backed by a Supabase atomic counter — only counts unique builds, not cache hits.',
  },
  {
    date: '2026-05-24',
    tag: 'Safety',
    title: 'Per-IP rate limit on the report API',
    body:
      '5 requests per minute per IP on cache misses (cached responses are free). Stops casual abuse without blocking real users.',
  },
  {
    date: '2026-05-24',
    tag: 'Discovery',
    title: 'SEO basics: robots.txt + sitemap.xml',
    body:
      'Next.js auto-emits both from app/robots.js and app/sitemap.js. Search indexing has weeks of lead time, so we did this early — by the time we promote, Google already knows we exist.',
  },
  {
    date: '2026-05-24',
    tag: 'Performance',
    title: '5-min response cache + branded favicon',
    body:
      'Repeated requests to the same coldkey (refresh, shared links) skip the ~5s of Taostats fetches and serve from memory. Plus a proper τ favicon and Apple touch icon — no more generic globe in browser tabs and iOS home screens.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Surface the paywall — top-of-report nudge',
    body:
      'Subscription CTA was buried at the bottom of the report. Added a small accent-coloured nudge at the top ("📬 Want this every Monday? Subscribe for ~$3 TAO →") that scrolls to the form.',
  },
  {
    date: '2026-05-24',
    tag: 'Share',
    title: 'Dynamic Open Graph image',
    body:
      'Site-wide og:image and twitter:image — any link shared on Twitter, Discord, Slack, iMessage now gets a polished preview card matching the dark theme.',
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'Weekly email delivery',
    body:
      'One-time ~0.01 τ (~$3 USD) gets you 30 days of Monday-morning emails. Vercel cron triggers Gmail SMTP every Monday at 09:00 UTC. Fresh build per recipient.',
  },
  {
    date: '2026-05-24',
    tag: 'Accuracy',
    title: 'Ground-truth PnL from the Taostats tax-report',
    body:
      'The headline PnL number now uses the canonical formula — same one the Taostats tax-report CSV uses, the one tax professionals trust. Replaces the naive alpha-token-value summation which drifts 5–10% from actual on-chain balance.',
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'TAO micropayment paywall',
    body:
      'Subscribers send a unique amount of TAO (e.g. 0.0143 τ) to a single tip wallet. We poll Taostats for matching inbound transfers every 5 seconds and confirm the subscription on first match.',
  },
  {
    date: '2026-05-24',
    tag: 'Tip',
    title: 'TAO tip jar',
    body:
      'Suggested 0.01 τ (~$3 USD) tip with QR code + click-to-copy address. Any amount keeps the tool free.',
  },
  {
    date: '2026-05-24',
    tag: 'Launch',
    title: 'Initial public release',
    body:
      'Paste any Bittensor coldkey, get a six-section report: portfolio, PnL, yield, flags, recommendations, broader market. Free, instant, no signup. Built on Next.js 14 on Vercel; data from Taostats + tao.app.',
  },
];

const TAG_TONE = {
  Launch: 'tag-launch',
  Paid: 'tag-paid',
  Accuracy: 'tag-accuracy',
  Trust: 'tag-trust',
  Credibility: 'tag-trust',
  Viral: 'tag-viral',
  Share: 'tag-viral',
  Retention: 'tag-viral',
  SEO: 'tag-seo',
  Discovery: 'tag-seo',
  'Press kit': 'tag-seo',
  'Social proof': 'tag-seo',
  Safety: 'tag-safety',
  Performance: 'tag-safety',
  UX: 'tag-ux',
  Tip: 'tag-paid',
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
      </header>

      <article className="changelog">
        {ENTRIES.map((e, i) => (
          <section className="changelog-entry" key={i}>
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
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report/commits/main" target="_blank" rel="noopener noreferrer">
            Full commit log on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
