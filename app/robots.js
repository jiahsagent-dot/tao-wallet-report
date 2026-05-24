// Next.js auto-emits /robots.txt from this file.
export default function robots() {
  const base = 'https://tao-wallet-report.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Don't index API endpoints (they're not pages, just JSON returns).
        disallow: ['/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
