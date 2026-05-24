// Next.js auto-emits /sitemap.xml from this file.
export default function sitemap() {
  const base = 'https://tao-wallet-report.vercel.app';
  const now = new Date();
  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${base}/press`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/changelog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: `${base}/changelog/feed.xml`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.4,
    },
    {
      url: `${base}/changelog/feed.json`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.4,
    },
  ];
}
