// Multi-provider LLM chat client with graceful fallback.
//
// Provider chain (first match wins, falls through on error):
//   1. Pollinations.ai anonymous tier — GPT-OSS 20B Reasoning via OVH, free, no key
//   2. Groq llama-3.3-70b-versatile — fast, free tier (set GROQ_API_KEY)
//   3. Google Gemini 2.5 Flash — generous free tier (set GEMINI_API_KEY)
//   4. Anthropic Claude Haiku — last resort, paid (set ANTHROPIC_API_KEY)
//
// All providers return { text, model, provider, durationMs, error? }.
// Caller specifies system + user message + maxTokens; provider abstracts
// the rest. If every provider fails, returns { error: '...', text: null }.

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const DEFAULT_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url, opts, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callPollinations({ system, user, maxTokens }) {
  const res = await fetchWithTimeout(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai-fast',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('pollinations empty response');
  return { text, model: j?.model || 'gpt-oss-20b' };
}

async function callGroq({ system, user, maxTokens, apiKey }) {
  const res = await fetchWithTimeout(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('groq empty response');
  return { text, model: j?.model || 'llama-3.3-70b' };
}

async function callGemini({ system, user, maxTokens, apiKey }) {
  const model = 'gemini-2.5-flash';
  const url = `${GEMINI_URL}/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('gemini empty response');
  return { text, model };
}

async function callAnthropic({ system, user, maxTokens, apiKey }) {
  const model = 'claude-haiku-4-5-20251001';
  const res = await fetchWithTimeout(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const j = await res.json();
  const text = j?.content?.[0]?.text?.trim();
  if (!text) throw new Error('anthropic empty response');
  return { text, model };
}

// Returns the ordered list of (name, callable) the chain will try, gated by
// whether the relevant env vars are present. Pollinations runs every time
// because it needs no key. Anthropic is intentionally LAST per Jai's rule.
function providerChain() {
  const chain = [{ name: 'pollinations', call: callPollinations }];
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (groqKey) chain.push({ name: 'groq', call: (a) => callGroq({ ...a, apiKey: groqKey }) });
  if (geminiKey) chain.push({ name: 'gemini', call: (a) => callGemini({ ...a, apiKey: geminiKey }) });
  if (anthropicKey) chain.push({ name: 'anthropic', call: (a) => callAnthropic({ ...a, apiKey: anthropicKey }) });
  return chain;
}

export async function chat({ system, user, maxTokens = 800 }) {
  const chain = providerChain();
  const errors = [];
  for (const provider of chain) {
    const t0 = Date.now();
    try {
      const { text, model } = await provider.call({ system, user, maxTokens });
      return {
        text,
        model,
        provider: provider.name,
        durationMs: Date.now() - t0,
        triedProviders: errors.length + 1,
      };
    } catch (e) {
      errors.push(`${provider.name}: ${e.message}`);
    }
  }
  return {
    text: null,
    error: `all providers failed: ${errors.join(' | ')}`,
    triedProviders: chain.length,
  };
}
