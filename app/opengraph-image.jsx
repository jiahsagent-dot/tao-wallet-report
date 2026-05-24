import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tao Wallet Report — paste a coldkey, get a personalised Bittensor report';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0b0e14 0%, #131720 100%)',
          color: '#eef0f4',
          padding: '64px 72px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#f9a826',
              color: '#1a1100',
              fontSize: '28px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            τ
          </div>
          <div style={{ fontSize: '24px', color: '#8a93a3', letterSpacing: '0.02em' }}>
            tao-wallet-report.vercel.app
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '76px',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              marginBottom: '20px',
            }}
          >
            Paste a Bittensor coldkey. Get a personalised report.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '28px',
              color: '#8a93a3',
              lineHeight: 1.4,
              maxWidth: '900px',
            }}
          >
            Portfolio · PnL · yield · subnet flags · weekly email. Free, instant, public on-chain data only.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.4)',
              borderRadius: '10px',
              padding: '14px 20px',
              fontSize: '22px',
              color: '#4ade80',
              fontWeight: 600,
            }}
          >
            +0.196 τ (+0.97%)
          </div>
          <div style={{ fontSize: '20px', color: '#8a93a3' }}>
            example PnL · same formula as the weekly tax report
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
