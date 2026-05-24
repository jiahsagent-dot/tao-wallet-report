import Link from 'next/link';
import CopyBlock from '../_components/CopyBlock.jsx';

const TITLE = 'Press kit — Tao Wallet Report';
const DESCRIPTION =
  'Logo, screenshots, and ready-to-paste copy for anyone writing about Tao Wallet Report. Tweet-length, paragraph-length, and long-form descriptions included.';
const SITE_URL = 'https://tao-wallet-report.vercel.app';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/press' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/press',
    siteName: 'Tao Wallet Report',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const TWEET = `Built a free Bittensor wallet report tool. Paste a coldkey → get portfolio, PnL, yield, and rule-based flags in 5 seconds. Same formula as the Taostats tax-report. No signup. ${SITE_URL}`;

const PARAGRAPH = `Tao Wallet Report is a free, instant Bittensor wallet report. Paste any coldkey and get a six-section breakdown: portfolio by subnet, ground-truth PnL using the same formula as the Taostats tax-report CSV, weighted APY across your stake, rule-based risk flags, recommendations, and the broader market view. No signup, no wallet connect, no API key — just public on-chain data, formatted. Optional ~$3 TAO subscription delivers the report to your inbox every Monday.`;

const SHORT_LONG = `Tao Wallet Report (${SITE_URL}) is a free web tool that turns any Bittensor coldkey into a personalised one-page report. Built because every Bittensor stakeholder I know was opening five tabs on Monday morning to figure out the same numbers — and most of them were getting it slightly wrong because naive trackers don't account for transfers in and out of the wallet.

The tool uses the canonical accounting formula:
  profit = current_balance + transfers_out − transfers_in − starting_balance
  return_pct = profit / (starting_balance + transfers_in)

This is the same formula the Taostats tax-report CSV uses — the one tax professionals trust to file actual returns. Data sources are entirely public: Taostats /api/accounting/tax/v1 for balances and transfers, /api/dtao/* for subnet prices and holdings, and the Taostats live TAO/USD feed.

What the tool does NOT do: it doesn't store coldkey data (5-min in-memory cache, then gone), it doesn't ask for private keys (coldkeys are public addresses), and the recommendations section is rule-based — not financial advice.

For ~0.01 τ (~$3 USD) you get 30 days of Monday morning emails with a fresh report. Open source on GitHub: https://github.com/jiahsagent-dot/tao-wallet-report`;

const LOGO_SVG = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="#f9a826"/>
  <text x="32" y="44" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="800" fill="#1a1100" text-anchor="middle">τ</text>
</svg>`;

const FACTS = [
  ['Live URL', SITE_URL],
  ['Source code', 'https://github.com/jiahsagent-dot/tao-wallet-report'],
  ['Cost to user', 'Free (one-time ~$3 TAO for weekly email subscription)'],
  ['Data source', 'Taostats public APIs (same as the tax-report CSV)'],
  ['PnL formula', 'profit = current + transfers_out − transfers_in − starting'],
  ['Storage policy', 'No coldkey storage; 5-min in-memory response cache only'],
  ['License', 'MIT'],
  ['Built by', 'Jai (indie Bittensor stakeholder)'],
];

export default function PressPage() {
  return (
    <main className="wrap">
      <header className="head">
        <Link href="/" className="back-link">← Back to the report tool</Link>
        <h1>Press kit</h1>
        <p className="sub">
          Everything you need to write about, tweet about, or DM a friend about
          Tao Wallet Report. Copy any block with one click.
        </p>
      </header>

      <article className="prose press">
        <h2>The one-liner</h2>
        <CopyBlock
          label="Tweet (under 280 chars)"
          text={TWEET}
        />

        <h2>Paragraph description</h2>
        <CopyBlock
          label="One paragraph"
          text={PARAGRAPH}
          multiline
        />

        <h2>Long-form description</h2>
        <CopyBlock
          label="Multi-paragraph (for articles, blog posts)"
          text={SHORT_LONG}
          multiline
        />

        <h2>Logo</h2>
        <div className="press-logo-grid">
          <div className="press-logo-tile">
            <div className="press-logo-preview">
              <div className="press-logo-mark">τ</div>
            </div>
            <p className="press-logo-meta">
              64×64 SVG · accent #f9a826 on dark #0b0e14
            </p>
            <CopyBlock
              label="Inline SVG"
              text={LOGO_SVG}
              multiline
            />
          </div>
          <div className="press-logo-tile">
            <div className="press-logo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon" alt="Tao Wallet Report icon" width="64" height="64" style={{ borderRadius: 14 }} />
            </div>
            <p className="press-logo-meta">
              PNG via <code>/icon</code> (64×64) — also <code>/apple-icon</code> (180×180)
            </p>
            <CopyBlock label="PNG URL (64×64)" text={`${SITE_URL}/icon`} />
            <CopyBlock label="PNG URL (180×180)" text={`${SITE_URL}/apple-icon`} />
          </div>
        </div>

        <h2>Screenshots / OG previews</h2>
        <p>
          The site auto-generates a dynamic Open Graph image for every shared
          coldkey, showing the live PnL number. Right-click → save image, or
          link the URL directly in markdown / X / Telegram.
        </p>
        <div className="press-screenshots">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/opengraph-image"
              alt="Default OG card — Tao Wallet Report"
              width="600"
            />
            <figcaption>
              <code>{SITE_URL}/opengraph-image</code>
              <span className="press-screenshot-meta">— default share card (1200×630)</span>
            </figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/report/5EKFph3D839fxdbQwhAHyM4CQzBHNpLSecUAteNZKqW1G5cd/opengraph-image"
              alt="Dynamic per-coldkey OG card"
              width="600"
            />
            <figcaption>
              <code>{SITE_URL}/report/&lt;coldkey&gt;/opengraph-image</code>
              <span className="press-screenshot-meta">— per-coldkey card, shows live PnL</span>
            </figcaption>
          </figure>
        </div>

        <h2>Key facts</h2>
        <table className="press-facts">
          <tbody>
            {FACTS.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>
                  {/^https?:\/\//.test(v) ? (
                    <a href={v} target="_blank" rel="noopener noreferrer">{v}</a>
                  ) : (
                    v
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Quotes you can use</h2>
        <CopyBlock
          label="On the formula"
          text={`"Most Bittensor PnL trackers just sum up alpha-token values and call that your profit. That number drifts 5–10% from your actual on-chain balance. This tool uses the same accounting formula the Taostats tax-report CSV uses — the one tax professionals trust to file actual returns."`}
          multiline
        />
        <CopyBlock
          label="On the why"
          text={`"Every Bittensor stakeholder I know was opening five tabs on Monday morning to figure out the same numbers. Most of them were getting it slightly wrong. So I built the calculation as a free web tool."`}
          multiline
        />

        <h2>Contact</h2>
        <p>
          Questions, corrections, or interview requests:{' '}
          <a href="mailto:jaismith044@gmail.com">jaismith044@gmail.com</a> or open an issue on{' '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report/issues" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          .
        </p>
        <p>
          Full methodology and FAQ on the <Link href="/about">about page</Link>.
        </p>
      </article>

      <footer className="foot">
        <p>
          <Link href="/">← Back to the report tool</Link>
          {' · '}
          <Link href="/about">How it works</Link>
          {' · '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
