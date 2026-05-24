import { ImageResponse } from 'next/og';
import { getOrBuildReport } from '../../../lib/report.js';

export const runtime = 'nodejs';
export const maxDuration = 30;
// Edge cache OG images for 5 min so social-platform crawlers + bot link
// previews don't re-trigger a full report build on every fetch.
export const revalidate = 300;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tao Wallet Report — personalised Bittensor wallet report';

const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

function shortKey(k) {
  return `${k.slice(0, 8)}…${k.slice(-8)}`;
}

export default async function Image({ params }) {
  const { coldkey } = params;
  const validKey = SS58_RE.test(coldkey);

  let pnlBig = 'Live report';
  let pnlPct = '';
  let portfolioLine = '';
  let delta7dChip = null; // { text, up }
  let topMoverChip = null; // { text, up }
  let positive = true;
  let neutral = true;
  let available = false;

  if (validKey) {
    try {
      const report = await getOrBuildReport(coldkey);
      const gt = report?.pnlGroundTruth;
      const p = report?.portfolio;
      const pn = report?.pnl;
      if (gt?.available) {
        positive = gt.profitTao >= 0;
        neutral = false;
        const sign = positive ? '+' : '';
        const pctSign = gt.returnPct >= 0 ? '+' : '';
        pnlBig = `${sign}${gt.profitTao.toFixed(3)} τ`;
        pnlPct = `${pctSign}${(gt.returnPct * 100).toFixed(2)}%`;
        available = true;
      }
      if (p?.totalTao != null) {
        portfolioLine = `Portfolio: ${p.totalTao.toFixed(2)} τ · $${p.totalUsd.toFixed(0)} USD · ${p.positionCount} positions`;
      }
      // iter 41 parity: Δ 7d delta chip
      const c7t = pn?.change7dTao;
      if (c7t != null && isFinite(c7t) && Math.abs(c7t) >= 0.001) {
        const up = c7t > 0;
        delta7dChip = {
          text: `Δ 7d ${up ? '↑ +' : '↓ '}${c7t.toFixed(2)} τ`,
          up,
        };
      }
      // iter 41 parity: top mover 7d
      const top10 = p?.top10 || [];
      const movers = top10
        .filter((x) => x.pct7d != null && isFinite(x.pct7d))
        .slice()
        .sort((a, b) => Math.abs(b.pct7d) - Math.abs(a.pct7d));
      if (movers.length && Math.abs(movers[0].pct7d) >= 0.5) {
        const m = movers[0];
        const up = m.pct7d > 0;
        topMoverChip = {
          text: `Top mover SN${m.netuid} ${up ? '↑ +' : '↓ '}${m.pct7d.toFixed(1)}%`,
          up,
        };
      }
    } catch {
      // fall back to generic — never throw inside OG handler
    }
  }

  const accentColor = neutral ? '#f9a826' : positive ? '#4ade80' : '#f87171';
  const accentBg = neutral
    ? 'rgba(249,168,38,0.12)'
    : positive
    ? 'rgba(74,222,128,0.12)'
    : 'rgba(248,113,113,0.12)';
  const accentBorder = neutral
    ? 'rgba(249,168,38,0.4)'
    : positive
    ? 'rgba(74,222,128,0.4)'
    : 'rgba(248,113,113,0.4)';

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
            <div style={{ display: 'flex', fontSize: '24px', color: '#8a93a3', letterSpacing: '0.02em' }}>
              tao-wallet-report.vercel.app
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'rgba(249,168,38,0.12)',
              border: '1px solid rgba(249,168,38,0.4)',
              fontSize: '18px',
              color: '#f9a826',
              fontWeight: 600,
            }}
          >
            📬 Weekly email ~$3 TAO
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '22px',
              color: '#8a93a3',
              marginBottom: '16px',
              letterSpacing: '0.02em',
            }}
          >
            {validKey ? `Coldkey ${shortKey(coldkey)}` : 'Invalid coldkey'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '24px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '110px',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: accentColor,
              }}
            >
              {pnlBig}
            </div>
            {pnlPct && (
              <div
                style={{
                  display: 'flex',
                  fontSize: '48px',
                  fontWeight: 600,
                  color: accentColor,
                }}
              >
                ({pnlPct})
              </div>
            )}
          </div>
          {available ? (
            <div
              style={{
                display: 'flex',
                fontSize: '24px',
                color: '#8a93a3',
                lineHeight: 1.4,
                maxWidth: '1000px',
              }}
            >
              On-chain PnL · same formula as the Bittensor weekly tax report
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: '24px',
                color: '#8a93a3',
                lineHeight: 1.4,
                maxWidth: '1000px',
              }}
            >
              {validKey
                ? 'Live PnL, portfolio, yield, and subnet flags'
                : 'Paste a Bittensor coldkey to get a personalised report'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {portfolioLine ? (
            <div
              style={{
                display: 'flex',
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                borderRadius: '10px',
                padding: '14px 20px',
                fontSize: '22px',
                color: '#eef0f4',
                fontWeight: 500,
              }}
            >
              {portfolioLine}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                borderRadius: '10px',
                padding: '14px 20px',
                fontSize: '22px',
                color: accentColor,
                fontWeight: 600,
              }}
            >
              tao-wallet-report.vercel.app
            </div>
          )}
          {delta7dChip && (
            <div
              style={{
                display: 'flex',
                background: delta7dChip.up ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
                border: `1px solid ${delta7dChip.up ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}`,
                borderRadius: '10px',
                padding: '14px 18px',
                fontSize: '20px',
                color: delta7dChip.up ? '#4ade80' : '#f87171',
                fontWeight: 600,
              }}
            >
              {delta7dChip.text}
            </div>
          )}
          {topMoverChip && (
            <div
              style={{
                display: 'flex',
                background: topMoverChip.up ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
                border: `1px solid ${topMoverChip.up ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}`,
                borderRadius: '10px',
                padding: '14px 18px',
                fontSize: '20px',
                color: topMoverChip.up ? '#4ade80' : '#f87171',
                fontWeight: 600,
              }}
            >
              {topMoverChip.text}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
