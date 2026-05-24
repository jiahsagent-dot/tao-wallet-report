import { ENTRIES, entryId, entryUrl } from '../../../lib/changelog-entries.js';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SITE_URL = 'https://tao-wallet-report.vercel.app';
const FEED_URL = `${SITE_URL}/changelog/feed.json`;

export async function GET() {
  const items = ENTRIES.map((e, i) => {
    const id = entryId(e, i);
    const url = entryUrl(e, i, SITE_URL);
    const published = new Date(e.date + 'T00:00:00Z').toISOString();
    return {
      id,
      url,
      title: e.title,
      content_text: e.body,
      date_published: published,
      tags: [e.tag],
    };
  });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Tao Wallet Report — Changelog',
    description:
      "What's new in Tao Wallet Report — every shipped change, most recent first.",
    home_page_url: `${SITE_URL}/changelog`,
    feed_url: FEED_URL,
    language: 'en',
    authors: [{ name: 'Tao Wallet Report', url: SITE_URL }],
    items,
  };

  return new Response(JSON.stringify(feed, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
