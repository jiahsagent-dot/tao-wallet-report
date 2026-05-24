import './globals.css';
import { webApplicationSchema } from '../lib/structured-data.js';

const TITLE = 'Tao Wallet Report — paste a coldkey, get a personalised Bittensor report';
const DESCRIPTION =
  'Free instant report for any Bittensor coldkey: portfolio, PnL, yield, flags, and rule-based recommendations. Public data only — no signup.';
const SITE_URL = 'https://tao-wallet-report.vercel.app';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'Tao Wallet Report',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport = {
  themeColor: '#0b0e14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema()) }}
        />
        {children}
      </body>
    </html>
  );
}
