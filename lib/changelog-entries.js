// Single source of truth for changelog entries. Imported by:
//   - app/changelog/page.jsx (HTML render)
//   - app/changelog/feed.xml/route.js (Atom)
//   - app/changelog/feed.json/route.js (JSON Feed 1.1)
//
// Each entry: { date (YYYY-MM-DD), tag, title, body, links? }
// Newest first.

export const ENTRIES = [
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights short-circuits during Pollinations rate-limit windows',
    body:
      'When Pollinations returns a 429, the next 60 seconds of /api/insights requests fall through to the next provider in chain (or soft-fail) immediately instead of hammering the same upstream and amplifying the throttle. Retry-After header honoured if present. 5xx upstream errors trigger a shorter 10s cooldown. Cooldown lives per Vercel instance on globalThis, wiped on cold start.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights guarantees all 4 sections via deterministic fallback',
    body:
      'If the model still refuses a heading after the auto-retry, a conservative canonical line is spliced in for the missing slot (e.g. "No material risk flags surfaced by the analyst pass" for Risk Flags). The model\'s prose for sections it did emit is left untouched; only the gaps are filled. The four-section contract now holds 100% at the UI and email layer, even when the LLM is stubborn. Each response exposes validation.patched so downstream can show a "(structured fallback)" badge if desired.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights now validated for all 4 sections, with auto-retry on miss',
    body:
      'The four headings (Summary, What Changed, Recommendations, Risk Flags) are now treated as a contract — if the model omits any, we re-prompt once with the exact missing list and the strict instruction to include a one-line acknowledgement rather than skip the heading. Soft-fails to the partial narrative if the retry also misses, so the AI block always renders. Each /api/insights response now includes a validation field exposing requiredSections / present / missing / retried for downstream visibility.',
  },
  {
    date: '2026-05-24',
    tag: 'Press kit',
    title: 'Press kit now leads with AI Insights as the headline feature',
    body:
      'Tweet, paragraph, and long-form copy on /press now frame the tool as an "AI-generated personalised Bittensor analyst report" instead of "structured Bittensor data". New FACTS row documents the AI stack — GPT-OSS 20B Reasoning via Pollinations.ai anonymous tier, $0/report default, optional Groq/Gemini/Anthropic fallbacks. New pull-quote about AI Insights ready to paste.',
    links: [{ label: 'Press kit', href: '/press' }],
  },
  {
    date: '2026-05-24',
    tag: 'Paid',
    title: 'Weekly emails now include AI Insights narrative',
    body:
      'Paying subscribers get the §0 AI Insights card (Summary, What Changed, Recommendations, Risk Flags) at the top of every Monday email — same plain-English analyst write-up that runs on the site, delivered to your inbox. Inline-styled HTML so it renders in Gmail, Outlook, Apple Mail, plain-text fallback for raw mail clients.',
  },
  {
    date: '2026-05-24',
    tag: 'AI',
    title: 'AI Insights — personalised analyst narrative on top of the data',
    body:
      'Every report now opens with a §0 AI Insights card: Summary, What Changed, Recommendations, and Risk Flags written in plain English from your specific portfolio. Backed by a multi-provider LLM chain (Pollinations free tier primary, optional Groq/Gemini/Anthropic fallbacks). 1h cache per coldkey so refreshes are free.',
  },
  {
    date: '2026-05-24',
    tag: 'UX',
    title: 'Heatmap colour intensity on portfolio + market tables',
    body:
      'Value, % portfolio, 24h, 7d, and 24h-volume cells now carry a column-relative background tint — instantly shows who you are overweight in and which subnets are moving most, without reading numbers. Green/red for signed columns, orange for magnitude.',
  },
  {
    date: '2026-05-24',
    tag: 'Syndication',
    title: 'RSS + JSON feeds for the changelog',
    body:
      'Every shipped change now syndicates to /changelog/feed.xml (Atom) and /changelog/feed.json (JSON Feed 1.1). Newsroom tools, dev dashboards, and personal RSS readers can subscribe and surface ships automatically.',
    links: [
      { label: 'Atom feed', href: '/changelog/feed.xml' },
      { label: 'JSON feed', href: '/changelog/feed.json' },
    ],
  },
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

export const TAG_TONE = {
  AI: 'tag-ai',
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
  Syndication: 'tag-seo',
  'Press kit': 'tag-seo',
  'Social proof': 'tag-seo',
  Safety: 'tag-safety',
  Performance: 'tag-safety',
  UX: 'tag-ux',
  Tip: 'tag-paid',
};

// Stable per-entry id for Atom <id> and JSON Feed `id` field. Same input ⇒
// same URN, so subscribers don't see duplicates if we re-render.
export function entryId(entry, index) {
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `tag:tao-wallet-report.vercel.app,${entry.date}:${slug}-${index}`;
}

export function entryUrl(entry, index, baseUrl) {
  // No per-entry pages yet, so deep-link with a fragment id derived from the
  // entry id. /changelog renders all entries in one document; fragments let
  // RSS readers jump to the right card.
  return `${baseUrl}/changelog#entry-${index}`;
}
