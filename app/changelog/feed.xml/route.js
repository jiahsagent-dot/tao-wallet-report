import { ENTRIES, entryId, entryUrl } from '../../../lib/changelog-entries.js';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SITE_URL = 'https://tao-wallet-report.vercel.app';
const FEED_URL = `${SITE_URL}/changelog/feed.xml`;
const SITE_TITLE = 'Tao Wallet Report — Changelog';
const SITE_SUBTITLE =
  'What\'s new in Tao Wallet Report — every shipped change, most recent first.';

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(d) {
  return new Date(d + 'T00:00:00Z').toISOString();
}

export async function GET() {
  const updated = ENTRIES.length > 0 ? isoDate(ENTRIES[0].date) : new Date().toISOString();

  const entriesXml = ENTRIES.map((e, i) => {
    const id = entryId(e, i);
    const url = entryUrl(e, i, SITE_URL);
    const published = isoDate(e.date);
    return `  <entry>
    <id>${xmlEscape(id)}</id>
    <title>${xmlEscape(e.title)}</title>
    <link rel="alternate" type="text/html" href="${xmlEscape(url)}"/>
    <published>${published}</published>
    <updated>${published}</updated>
    <category term="${xmlEscape(e.tag)}"/>
    <summary type="text">${xmlEscape(e.body)}</summary>
  </entry>`;
  }).join('\n');

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${FEED_URL}</id>
  <title>${xmlEscape(SITE_TITLE)}</title>
  <subtitle>${xmlEscape(SITE_SUBTITLE)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${FEED_URL}"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}/changelog"/>
  <updated>${updated}</updated>
  <author>
    <name>Tao Wallet Report</name>
    <uri>${SITE_URL}</uri>
  </author>
${entriesXml}
</feed>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
