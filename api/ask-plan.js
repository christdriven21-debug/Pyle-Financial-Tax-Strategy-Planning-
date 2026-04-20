// Vercel serverless: natural-language Q&A grounded in the client's plan data.
//
// The CLIENT sends a question + a serialized plan summary. This endpoint
// calls Anthropic Claude with a tightly-scoped system prompt that requires
// the model to ground answers in the provided plan data (no hallucinated
// numbers). Two modes: 'client' (plain-English, no jargon) and 'advisor'
// (includes statute citations, audit-risk warnings, and math detail).
//
// Requires ANTHROPIC_API_KEY env var on Vercel. Returns 503 with a clear
// message if not configured so the UI can render a helpful fallback.
//
// Cost estimate: ~3-5¢ per query using claude-sonnet-4-5 with a 3-5k token
// context window and 800 token response. Rate-limited by advisor clicks —
// no additional rate limiting server-side for now.
//
// Privacy note: the plan context sent to Anthropic includes dollar figures,
// ages, and strategy choices. It does NOT include SSN, tax-ID, account
// numbers, or PII beyond what the advisor entered in the Builder. Anthropic's
// API terms (2025) commit to no training on API inputs by default.

import { requireUser } from './_lib/auth.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authenticated Supabase session to prevent API-credit burn
  // and unauthorized access to plan data through the AI proxy.
  const user = await requireUser(req, res);
  if (!user) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'AI Plan Assistant requires ANTHROPIC_API_KEY on this Vercel deployment. Add it under Project Settings → Environment Variables and redeploy.',
      code: 'no_api_key',
    });
  }

  const { question, planContext, mode, history } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing "question" field' });
  }
  if (!planContext || typeof planContext !== 'string') {
    return res.status(400).json({ error: 'Missing "planContext" field (run the plan first)' });
  }

  const isAdvisor = mode === 'advisor';
  const systemPrompt = `You are the AI Plan Assistant inside the Pyle Financial Services wealth-planning platform. You answer questions about a specific client's financial plan using the structured plan data provided below.

HARD RULES:
1. GROUND EVERY ANSWER IN THE PROVIDED PLAN DATA. Never invent numbers. If the plan data doesn't contain the answer, say "I don't see that in your plan data" and suggest where the advisor could add it.
2. Use specific dollar figures from the plan when relevant — quote them exactly.
3. Never give "tax advice", "legal advice", or "investment advice" in the literal sense. Frame answers as "your plan shows..." or "based on the inputs, this plan projects..."
4. Never recommend actions the advisor hasn't already included in the plan.
5. If the question is clearly off-topic (weather, cooking, etc.), redirect: "I can only answer questions about ${isAdvisor ? 'this plan' : 'your plan'}."

TONE & STYLE:
${isAdvisor
  ? '- Advisor mode: you\'re speaking to a CFP/CFA-credentialed advisor. Use statute citations (§1202, §664(d), Rev. Rul. 2004-64, etc.) where relevant. Surface audit-risk considerations. Include math detail and footnotes. Concise and technical.'
  : '- Client mode: you\'re speaking to the client. Use warm, confident, plain English. No jargon — translate §1202 to "QSBS stock exclusion" and Dynasty Trust to "a multi-generational family trust". No statute citations. Focus on practical outcomes and what it means for the family.'}
- Responses should be 2-5 short paragraphs unless the question genuinely needs a longer answer.
- Use <strong> tags for emphasis on dollar amounts. No other HTML.
- No em-dashes. Use periods or commas.

PLAN CONTEXT:
${planContext}

Respond directly to the question. Do not restate the question. Do not preface with "Great question" or similar filler.`;

  // Build messages array (include last 4 turns of conversation history if provided)
  const messages = [];
  if (Array.isArray(history)) {
    history.slice(-8).forEach(turn => {
      if (turn.role === 'user' || turn.role === 'assistant') {
        messages.push({ role: turn.role, content: turn.content });
      }
    });
  }
  messages.push({ role: 'user', content: question });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({
        error: `Anthropic API error: ${errText.slice(0, 400)}`,
        code: 'api_error',
      });
    }

    const data = await resp.json();
    const answer = data?.content?.[0]?.text?.trim();
    if (!answer) {
      return res.status(500).json({ error: 'Anthropic returned no text content', code: 'empty_response' });
    }

    return res.status(200).json({
      answer,
      usage: data.usage || null,
      mode: isAdvisor ? 'advisor' : 'client',
    });
  } catch (err) {
    return res.status(500).json({ error: `Assistant failed: ${err.message}`, code: 'fetch_failed' });
  }
}
