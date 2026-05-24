import { NextResponse } from 'next/server';
import { insert } from '../../../lib/supabase.js';
import { generateUniqueAmount, expiryFromNow, TIP_ADDRESS_STR } from '../../../lib/payment.js';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SS58_RE = /^5[a-km-zA-HJ-NP-Z1-9]{47}$/;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = (body?.email || '').trim().toLowerCase();
  const coldkey = (body?.coldkey || '').trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (coldkey && !SS58_RE.test(coldkey)) {
    return NextResponse.json({ error: 'Invalid SS58 coldkey' }, { status: 400 });
  }

  const amountTao = generateUniqueAmount();
  const expiresAt = expiryFromNow(10);

  try {
    const row = await insert('payment_sessions', {
      email,
      coldkey: coldkey || null,
      amount_tao: amountTao,
      expires_at: expiresAt,
    });
    return NextResponse.json({
      sessionId: row.session_id,
      amountTao,
      address: TIP_ADDRESS_STR,
      expiresAt,
    });
  } catch (e) {
    console.error('start-payment:', e);
    return NextResponse.json(
      { error: 'Failed to start payment', detail: String(e?.message || e).slice(0, 200) },
      { status: 500 }
    );
  }
}
