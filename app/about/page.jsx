import Link from 'next/link';

const TITLE = 'About Tao Wallet Report — methodology, data sources, FAQ';
const DESCRIPTION =
  'How the Bittensor PnL formula works, where the data comes from, and what this tool does and does not do. Same numbers as the weekly Taostats tax report.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/about',
    siteName: 'Tao Wallet Report',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function AboutPage() {
  return (
    <main className="wrap">
      <header className="head">
        <Link href="/" className="back-link">← Back to the report tool</Link>
        <h1>About Tao Wallet Report</h1>
        <p className="sub">
          A free Bittensor wallet report. Same numbers as the weekly Taostats
          tax-report — but personalised, instant, and shareable. Built by an
          indie developer who got tired of doing this calculation by hand.
        </p>
      </header>

      <article className="prose">
        <h2>What it does</h2>
        <p>
          Paste a Bittensor coldkey. You get back a six-section report:
          portfolio breakdown by subnet, ground-truth PnL, weighted APY, rule-based
          risk flags, recommendations, and the broader market view. No signup,
          no wallet connect, no API key. Just public on-chain data, formatted.
        </p>

        <h2>The PnL formula (plain English)</h2>
        <p>
          The headline PnL number is calculated like this:
        </p>
        <pre className="formula">
          profit = current_balance + transfers_out − transfers_in − starting_balance
        </pre>
        <p>
          In English: take what the wallet is worth today. Add back anything that
          was sent out (those went somewhere, they&apos;re still yours).
          Subtract anything that was sent in (those weren&apos;t earned — they
          came from elsewhere). Subtract the starting balance (the wallet
          already had that on day one).
        </p>
        <p>
          What&apos;s left is the actual gain from staking, trading, and price action.
        </p>
        <p>
          The return percentage is then:
        </p>
        <pre className="formula">
          return_pct = profit / (starting_balance + transfers_in)
        </pre>
        <p>
          The denominator is the total &quot;capital deployed&quot; — what you
          started with plus anything you added during the period. This is the
          standard time-weighted return formula used by most accounting tools.
        </p>

        <h2>Why this formula matters</h2>
        <p>
          A lot of Bittensor PnL trackers just sum up your <em>alpha-token
          values</em> and call that your profit. That number drifts 5–10% from
          your actual on-chain balance because alpha token prices fluctuate
          independently of subnet emission rates.
        </p>
        <p>
          Worse, naive trackers don&apos;t subtract starting balance — so a
          wallet that pre-dates the lookup window will look like it earned
          everything that was already there. We&apos;ve seen tools report
          &quot;+150%&quot; returns on wallets that did nothing but sit idle.
        </p>
        <p>
          This tool uses the same accounting formula that the Taostats tax-report
          CSV uses — the one tax professionals and serious Bittensor stakeholders
          actually trust.
        </p>

        <h2>Where the data comes from</h2>
        <ul>
          <li>
            <strong>Balances + transfers:</strong>{' '}
            <a href="https://taostats.io" target="_blank" rel="noopener noreferrer">
              Taostats
            </a>{' '}
            <code>/api/accounting/tax/v1</code> (same source as the Pro UI&apos;s
            tax-report export) and <code>/api/account/history/v1</code>.
          </li>
          <li>
            <strong>Subnet prices, holdings, screener:</strong> Taostats
            <code> /api/dtao/*</code> endpoints and{' '}
            <a href="https://tao.app" target="_blank" rel="noopener noreferrer">
              tao.app
            </a>
            .
          </li>
          <li>
            <strong>TAO/USD price:</strong> Taostats live price feed (NOT
            CoinGecko — CoinGecko&apos;s TAO feed has historically drifted
            25%+).
          </li>
          <li>
            <strong>USD→AUD conversion:</strong>{' '}
            <a href="https://open.er-api.com" target="_blank" rel="noopener noreferrer">
              open.er-api.com
            </a>
            .
          </li>
        </ul>

        <h2>What this tool does NOT do</h2>
        <ul>
          <li>
            <strong>It does not predict prices.</strong> The
            &quot;recommendations&quot; section is rule-based — it flags
            concentration risk, big drawdowns, and yield spread. It is not a
            trading signal. It is not financial advice.
          </li>
          <li>
            <strong>It does not store your data.</strong> The coldkey you paste
            is sent to Taostats, the report is built, and the response is cached
            in memory for 5 minutes (so refresh is fast) — then it&apos;s gone.
            If you subscribe to weekly emails, we store your email + coldkey in
            Supabase so we know who to send to. That&apos;s the only persistence.
          </li>
          <li>
            <strong>It does not know your hotkeys.</strong> A coldkey is your
            public on-chain address — anyone can look up its holdings. We never
            ask for or touch any private key.
          </li>
          <li>
            <strong>It does not work for hotkey addresses.</strong> Paste the
            coldkey only (the address starting with <code>5</code> that you see
            on the &quot;Accounts&quot; tab in Taostats, not the hotkey under
            each subnet).
          </li>
        </ul>

        <h2>Why is the number slightly different from my own spreadsheet?</h2>
        <p>
          Three usual reasons:
        </p>
        <ul>
          <li>
            <strong>Time window:</strong> we use a 365-day lookback. Your sheet
            might be year-to-date, 90-day, or all-time.
          </li>
          <li>
            <strong>Snapshot timing:</strong> Taostats balance snapshots are
            taken once per day at ~00:00 UTC. If you check mid-day after a
            price move, the &quot;current portfolio&quot; field uses the latest
            available snapshot.
          </li>
          <li>
            <strong>Hotkey-level vs coldkey-level:</strong> we aggregate every
            hotkey under your coldkey. If you&apos;ve been comparing one hotkey
            at a time, the totals will look different.
          </li>
        </ul>
        <p>
          If the numbers diverge by more than ~1%, click the{' '}
          <strong>verify on Taostats ↗</strong> link in the report header and
          compare against the source. If you find a genuine bug,{' '}
          <a
            href="https://github.com/jiahsagent-dot/tao-wallet-report/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            open an issue
          </a>{' '}
          and we&apos;ll fix it.
        </p>

        <h2>Who built this</h2>
        <p>
          Built by an indie Bittensor stakeholder who got sick of opening five
          tabs every Monday morning to figure out PnL. The
          {' '}
          <a
            href="https://github.com/jiahsagent-dot/tao-wallet-report"
            target="_blank"
            rel="noopener noreferrer"
          >
            source is on GitHub
          </a>{' '}
          — fork it, file issues, send PRs.
        </p>
        <p>
          If you find it useful and want to keep it running:{' '}
          <strong>tip a tiny bit of TAO</strong> via the wallet on the home
          page. Anything keeps the tool free.
        </p>

        <h2>The weekly email</h2>
        <p>
          One-time <strong>~0.01 τ (~$3 USD)</strong> gets you 30 days of
          Monday morning emails — fresh report, your coldkey, your inbox.
          Same formula. Same data. Zero effort.
        </p>
        <p>
          Send the TAO payment from any Bittensor wallet (Taostats web,
          Polkadot.js, mobile). We poll the chain every 5 seconds for your
          transfer and confirm in under a minute.
        </p>

        <h2>License</h2>
        <p>
          MIT. Use it however you want.
        </p>
      </article>

      <footer className="foot">
        <p>
          <Link href="/">← Back to the report tool</Link>
          {' · '}
          <a href="https://github.com/jiahsagent-dot/tao-wallet-report" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
