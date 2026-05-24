import './globals.css';

export const metadata = {
  title: 'Tao Wallet Report — paste a coldkey, get a personalised Bittensor report',
  description:
    'Free, instant report for any Bittensor coldkey: portfolio, PnL, yield, flags, recommendations. Public data only.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
