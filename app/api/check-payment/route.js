import { NextResponse } from 'next/server';
import { select, update, upsert } from '../../../lib/supabase.js';
import { findMatchingTransfer } from '../../../lib/payment.js';

export const runtime = 'nodejs';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const sessionId = (body?.sessionId || '').trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const rows = await select('payment_sessions', {
      filters: [`session_id=eq.${sessionId}`],
      limit: 1,
    });
    const session = rows?.[0];
    if (!session) {
      return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
    }

    if (session.status === 'confirmed') {
      return NextResponse.json({
        status: 'confirmed',
        amountTao: Number(session.amount_tao),
        confirmedAt: session.confirmed_at,
      });
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      await update('payment_sessions', [`session_id=eq.${sessionId}`], { status: 'expired' });
      return NextResponse.json({ status: 'expired' });
    }

    const match = await findMatchingTransfer({
      amountTao: Number(session.amount_tao),
      sinceIso: session.created_at,
    });

    if (!match) {
      return NextResponse.json({
        status: 'pending',
        amountTao: Number(session.amount_tao),
        expiresAt: session.expires_at,
      });
    }

    // Confirm: update session + upsert subscriber.
    const confirmedAt = new Date().toISOString();
    const expires30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await update('payment_sessions', [`session_id=eq.${sessionId}`], {
      status: 'confirmed',
      confirmed_at: confirmedAt,
      tx_extrinsic_id: match.extrinsicId,
    });

    await upsert('subscribers', {
      email: session.email,
      coldkey: session.coldkey || '',
      paid_at: confirmedAt,
      expires_at: expires30d,
      session_id: sessionId,
    });

    return NextResponse.json({
      status: 'confirmed',
      amountTao: Number(session.amount_tao),
      confirmedAt,
      tx: match.extrinsicId,
    });
  } catch (e) {
    console.error('check-payment:', e);
    return NextResponse.json(
      { error: 'Check failed', detail: String(e?.message || e).slice(0, 200) },
      { status: 500 }
    );
  }
}
