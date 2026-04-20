// Vercel serverless: auto-generate a meeting-prep briefing for the advisor.
//
// Input: full plan context + recent reviews + date of last meeting.
// Output: structured 1-page briefing with:
//   1. Plan status snapshot (what changed since last meeting)
//   2. Top 3 talking points for this meeting
//   3. Action items pending from last meeting
//   4. Potential hard conversations (red-flagged items)
//   5. Suggested scripts for difficult topics
//
// Designed for advisor use — not client-facing. Always advisor tone,
// technical, with statute citations and specific dollar figures.

import { requireUser } from './_lib/auth.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 2048;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authenticated session — meeting prep is advisor-only content.
  const user = await requireUser(req, res);
  if (!user) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Meeting Prep requires ANTHROPIC_API_KEY on this Vercel deployment.',
      code: 'no_api_key',
    });
  }

  const { planContext, lastMeetingDate, reviewHistory, meetingType } = req.body || {};
  if (!planContext) {
    return res.status(400).json({ error: 'Missing "planContext"' });
  }

  const type = meetingType || 'Annual Review';
  const lastDate = lastMeetingDate || 'no prior meeting recorded';
  const reviewText = Array.isArray(reviewHistory) && reviewHistory.length
    ? reviewHistory.slice(-5).map(r => `[${r.created_at || ''}] ${r.reviewer_email || 'advisor'}: ${r.comment || ''} (status: ${r.status || 'comment'})`).join('\n')
    : 'No recent reviews on file.';

  const systemPrompt = `You are a senior wealth advisor at Pyle Financial Services preparing for a client meeting. Generate a concise, actionable briefing the advisor can skim in 2 minutes before walking into the meeting. Your tone is professional, specific, and respectful of the advisor's time.

HARD RULES:
1. Ground every claim in the provided plan data. Use specific dollar figures from the plan — don't invent.
2. Be CONCISE. Each section should be 2-4 bullets max, not paragraphs.
3. Flag real risks, not generic ones. Only include items actually relevant to THIS plan's configuration.
4. Include statute citations where they matter (§1202, §664(d), Rev. Rul. 2004-64, etc.) — advisor audience.
5. Output CLEAN HTML. Use only: <h3>, <h4>, <p>, <ul>, <li>, <strong>, <em>. No other tags. No markdown.

OUTPUT STRUCTURE (use these exact h3 headings in order):

<h3>📋 Meeting Snapshot</h3>
2-3 sentences on the current plan state — net worth, biggest savings, overall health. Specific numbers only.

<h3>🔄 What's Changed Since Last Meeting</h3>
If last meeting date is known, list changes. If not, list the plan's biggest moves (e.g., "CRAT funded $10M pre-sale", "Dynasty at $25M"). 3-4 bullets max.

<h3>🎯 Top 3 Talking Points</h3>
The most important things to discuss at THIS meeting, ordered by urgency. Each bullet: topic + 1-line "why it matters now".

<h3>⚠️ Red Flags / Hard Conversations</h3>
Real risks identified in the plan: CRAT qualification, QSBS missing attestations, AGI cap carryforward that will expire, step-transaction risk on pre-sale gifts, Monte Carlo < 80%, concentration risk, IRMAA exposure, etc. ONLY include items actually present in the plan. If none are present, say "No red flags identified."

<h3>📝 Action Items Due</h3>
Implementation Checklist items likely to need discussion. Include specific deadlines where relevant (Form 709 filing, QOZ 180-day window, annual Crummey notices, QPRT rent docs).

<h3>💬 Suggested Scripts for Tough Topics</h3>
For any red flags above, provide 1-sentence "here's how to say it" scripts the advisor can adapt. Skip this section if no red flags.

END with no signature, no closing paragraph.

MEETING TYPE: ${type}
LAST MEETING: ${lastDate}

RECENT REVIEWS / NOTES FROM PRIOR MEETINGS:
${reviewText}

PLAN CONTEXT:
${planContext}`;

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
        messages: [{ role: 'user', content: `Generate the meeting prep briefing for the ${type}.` }],
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
    const briefing = data?.content?.[0]?.text?.trim();
    if (!briefing) {
      return res.status(500).json({ error: 'Anthropic returned no content', code: 'empty_response' });
    }

    return res.status(200).json({
      briefing,
      meetingType: type,
      generatedAt: new Date().toISOString(),
      usage: data.usage || null,
    });
  } catch (err) {
    return res.status(500).json({ error: `Meeting prep failed: ${err.message}`, code: 'fetch_failed' });
  }
}
