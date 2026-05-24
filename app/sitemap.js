// Next.js auto-emits /sitemap.xml from this file.
// Single entry — the home page is the entire product.
export default function sitemap() {
  return [
    {
      url: 'https://tao-wallet-report.vercel.app',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];
}
