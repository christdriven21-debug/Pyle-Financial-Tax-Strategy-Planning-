// Vercel serverless: polish the Client Portrait narrative using Anthropic Claude.
//
// Requires ANTHROPIC_API_KEY in Vercel environment variables.
// Without the key, returns a 503 with a clear message so the client UI can
// display a helpful error (not silently fail).
//
// Accepts: { client, planType, bizSale, strategies, kpis, currentNarrative }
// Returns: { narrative: string } — polished HTML fragment to drop into
//           .portrait-hero-narrative
//
// Cost: ~1-2 cents per call using claude-sonnet-4-5 with a ~2k token prompt
// and a ~400 token response. Only triggered by advisor button click.

import { requireUser } from './_lib/auth.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authenticated session — advisor feature only.
  const user = await requireUser(req, res);
  if (!user) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured on this Vercel deployment. Add it under Project Settings → Environment Variables, then redeploy.',
    });
  }

  const { client, planType, bizSale, strategies, kpis, currentNarrative } = req.body || {};
  if (!client || !kpis) {
    return res.status(400).json({ error: 'Missing required fields (client, kpis)' });
  }

  const coupleName = client.spouse ? `${client.primary} and ${client.spouse}` : client.primary || 'the client';
  const fmt$M = (n) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n || 0)}`;

  const prompt = `You are an expert senior wealth advisor at Pyle Financial Services writing the narrative introduction for a client-facing financial plan. Your tone is warm, confident, specific, and respectful of the client's sophistication. Avoid jargon, promotional language, and hedging verbs.

PLAN FACTS:
- Clients: ${coupleName} in ${client.location || 'their home state'}
- Plan type: ${planType === 'annual' ? 'Annual wealth optimization (no liquidity event)' : 'Business sale + wealth transition'}
${bizSale > 0 ? `- Business sale: ${fmt$M(bizSale)}` : ''}
- Strategies active: ${(strategies || []).join(', ') || 'none'}
- Total tax saved: ${fmt$M(kpis.totalTaxSaved)}
- Projected family wealth: ${fmt$M(kpis.familyNetWorth)}
- Dynasty Trust projected (if applicable): ${fmt$M(kpis.dynasty20yr)}
- §1202 QSBS saving (if applicable): ${fmt$M(kpis.qsbsSaving)}
- Monte Carlo probability of success: ${Math.round((kpis.mcSuccessRate || 0) * 100)}%

CURRENT NARRATIVE (draft to improve):
${currentNarrative || '(none)'}

TASK: Rewrite the narrative as 2-3 short paragraphs (total 80-120 words). Lead with the headline outcome in a specific, grounded way. Mention 2-3 of the strongest strategies by name in plain English (e.g. "a Dynasty Trust that grows for generations" not "an intentionally-defective grantor trust"). Close with a confidence-inspiring sentence about the plan's probability of success.

OUTPUT: Only the narrative HTML — use <strong> for emphasis on dollar amounts, no other markup. Do not include headings, JSON wrappers, or commentary. Do not use em-dashes.`;

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Anthropic API error: ${errText.slice(0, 400)}` });
    }

    const data = await resp.json();
    const narrative = data?.content?.[0]?.text?.trim();
    if (!narrative) {
      return res.status(500).json({ error: 'Anthropic returned no text content' });
    }

    return res.status(200).json({ narrative });
  } catch (err) {
    return res.status(500).json({ error: `Polish failed: ${err.message}` });
  }
}
