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
  ];
}
