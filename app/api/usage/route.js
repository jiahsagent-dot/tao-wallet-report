import { NextResponse } from 'next/server';
import { select } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
// Allow Vercel edge cache to serve this for 60s — counter doesn't need
// to be live to the millisecond, and avoids hammering Supabase.
export const revalidate = 60;

export async function GET() {
  try {
    const rows = await select('tao_usage', {
      filters: ['id=eq.1'],
      select: 'total,last_at',
      limit: 1,
    });
    const row = rows?.[0];
    return NextResponse.json(
      { total: Number(row?.total || 0), lastAt: row?.last_at || null },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (e) {
    console.error('usage:', e);
    return NextResponse.json({ total: 0, lastAt: null, error: String(e?.message || e).slice(0, 200) });
  }
}
