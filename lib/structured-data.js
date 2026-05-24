// Schema.org structured data generators. Returned as plain objects ready for
// JSON.stringify into a <script type="application/ld+json"> tag.
//
// Google reads these to power rich results: WebApplication shows brand cards
// for "Tao Wallet Report" search, FAQPage shows an expandable Q&A accordion
// inline in search results, HowTo can surface as a step-by-step rich snippet.

const SITE_URL = 'https://tao-wallet-report.vercel.app';

export function webApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Tao Wallet Report',
    description:
      'Free, instant Bittensor wallet report. Paste a coldkey, get portfolio, PnL, yield, and rule-based flags from public on-chain data.',
    url: SITE_URL,
    applicationCategory: 'FinanceApplication',
    applicationSubCategory: 'Cryptocurrency Portfolio Tracker',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript',
    offers: [
      {
        '@type': 'Offer',
        name: 'Free wallet report',
        price: '0',
        priceCurrency: 'USD',
        description: 'Instant report from any Bittensor coldkey',
      },
      {
        '@type': 'Offer',
        name: 'Weekly email subscription',
        price: '3',
        priceCurrency: 'USD',
        description: '30 days of Monday morning emails, paid in TAO (~0.01 τ)',
      },
    ],
    author: {
      '@type': 'Person',
      name: 'Jai',
      url: 'https://github.com/jiahsagent-dot',
    },
  };
}

export function faqPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How is Bittensor PnL calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'profit = current_balance + transfers_out − transfers_in − starting_balance. The return percentage is profit divided by (starting_balance + transfers_in). This is the same accounting formula the Taostats tax-report CSV uses.',
        },
      },
      {
        '@type': 'Question',
        name: 'Where does the data come from?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Balances and transfers come from Taostats /api/accounting/tax/v1 and /api/account/history/v1. Subnet prices and holdings come from Taostats /api/dtao endpoints and tao.app. TAO/USD price comes from the Taostats live feed.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is my data stored?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'No. The coldkey you paste is sent to Taostats, the report is built, the response is cached in memory for 5 minutes, then it is gone. If you subscribe to weekly emails, we store your email and coldkey in Supabase to know who to send to — that is the only persistence.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why is the number slightly different from my own spreadsheet?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Three usual reasons: (1) time window — we use a 365-day lookback, your sheet might be year-to-date or all-time; (2) snapshot timing — Taostats balance snapshots happen once per day at 00:00 UTC; (3) hotkey-level vs coldkey-level aggregation. If the divergence exceeds ~1%, click the verify-on-Taostats link in the report header to compare against the source.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does this tool ever ask for a private key?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'No. A coldkey is a public on-chain address — anyone can look up its holdings. We never ask for, see, or touch any private key. This tool is read-only and cannot move funds.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does this tool give financial advice?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'No. The recommendations section is rule-based: it flags concentration risk, big drawdowns, and yield spread. It is not a trading signal, prediction, or financial advice.',
        },
      },
    ],
  };
}

export function howToSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to calculate Bittensor PnL the same way the Taostats tax report does',
    description:
      'The accurate formula for Bittensor coldkey PnL using on-chain balances and transfer history, accounting for capital added and withdrawn during the period.',
    totalTime: 'PT1M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
    tool: [
      { '@type': 'HowToTool', name: 'Bittensor coldkey (the SS58 address starting with 5)' },
      { '@type': 'HowToTool', name: 'Taostats wallet history (or this tool)' },
    ],
    step: [
      {
        '@type': 'HowToStep',
        name: 'Get your starting balance',
        text:
          'Look up the wallet balance at the start of your lookup window (e.g. 365 days ago). Use the total_balance from the first daily snapshot in the Taostats tax-report endpoint.',
        position: 1,
      },
      {
        '@type': 'HowToStep',
        name: 'Sum transfers in and transfers out over the window',
        text:
          'From the same tax-report data, sum credit_amount on all transfer_in rows (capital added) and debit_amount on all transfer_out rows (capital withdrawn).',
        position: 2,
      },
      {
        '@type': 'HowToStep',
        name: 'Get your current balance',
        text:
          'Pull the latest balance from /api/account/history/v1. This is your wallet today, including everything staked across all hotkeys and subnets.',
        position: 3,
      },
      {
        '@type': 'HowToStep',
        name: 'Apply the formula',
        text:
          'profit = current_balance + transfers_out − transfers_in − starting_balance. Then return_pct = profit / (starting_balance + transfers_in). The denominator is the capital deployed over the window.',
        position: 4,
      },
    ],
  };
}
