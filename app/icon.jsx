import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9a826',
          color: '#1a1100',
          fontSize: 46,
          fontWeight: 800,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        τ
      </div>
    ),
    { ...size }
  );
}
