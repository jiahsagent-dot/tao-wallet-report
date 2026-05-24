import { NextResponse } from 'next/server';
import { getPollinationsCooldownState } from '../../../lib/llm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const INSIGHTS_CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const cooldown = getPollinationsCooldownState();
  const groqConfigured = !!process.env.GROQ_API_KEY;
  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
  const aiDisabled = process.env.NEXT_PUBLIC_DISABLE_AI === 'true';

  const fallbackAvailable = groqConfigured || geminiConfigured || anthropicConfigured;
  const status =
    aiDisabled || (cooldown.coolingDown && !fallbackAvailable) ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      providers: {
        pollinations: {
          configured: true,
          primary: true,
          cooldown,
        },
        groq: { configured: groqConfigured },
        gemini: { configured: geminiConfigured },
        anthropic: { configured: anthropicConfigured },
      },
      caches: {
        report: {
          entries: globalThis.__reportCache?.size || 0,
          ttlMs: REPORT_CACHE_TTL_MS,
        },
        insights: {
          entries: globalThis.__insightsCache?.size || 0,
          ttlMs: INSIGHTS_CACHE_TTL_MS,
        },
      },
      aiDisabled,
      region: process.env.VERCEL_REGION || 'unknown',
      deployId: process.env.VERCEL_DEPLOYMENT_ID || 'unknown',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
