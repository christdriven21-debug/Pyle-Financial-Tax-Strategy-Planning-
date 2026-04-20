// Vercel serverless: send transactional email notifications via Resend.
//
// Triggered by the client on specific events (plan saved, review posted,
// document uploaded) — NOT a general-purpose email relay. The endpoint
// looks up the plan, determines the legitimate recipient (team email or
// plan.client_email), and sends a pre-templated message. Clients can't
// supply arbitrary "to" addresses.
//
// Required env vars on Vercel:
//   RESEND_API_KEY  — from https://resend.com/api-keys (after domain verification)
//   NOTIFY_FROM     — e.g. "Pyle Planning <notify@pylefinancialservices.com>"
//   NOTIFY_TEAM     — comma-separated team email(s) to CC on client events,
//                     e.g. "Admin@pfs4u.com,scott@pfs4u.com"
//   APP_URL         — canonical URL of the live app (for deep links in emails)
//                     e.g. "https://www.pylefinancialservices.com"

import { requireUser, isValidUuid } from './_lib/auth.js';

const ALLOWED_TYPES = ['plan_saved', 'review_posted', 'doc_uploaded', 'meeting_prep_ready'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const apiKey   = process.env.RESEND_API_KEY;
  const from     = process.env.NOTIFY_FROM;
  const supaUrl  = process.env.SUPABASE_URL;
  const supaKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const teamRaw  = process.env.NOTIFY_TEAM || '';
  const appUrl   = process.env.APP_URL || 'https://www.pylefinancialservices.com';
  if (!apiKey || !from || !supaUrl || !supaKey) {
    return res.status(503).json({ error: 'Notifications not configured', code: 'no_config' });
  }

  const { planId, type, note } = req.body || {};
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Unknown notification type' });
  }
  if (!isValidUuid(planId)) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  try {
    // Fetch plan to determine recipient. Service role bypasses RLS here
    // because the server needs to look up client_email for any plan the
    // caller could legitimately touch; we enforce caller-authorization
    // via the audience logic below (caller must be team or matching client).
    const planResp = await fetch(
      `${supaUrl}/rest/v1/plans?id=eq.${encodeURIComponent(planId)}&select=id,name,client_email,owner_id`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
    );
    if (!planResp.ok) {
      return res.status(502).json({ error: 'Plan lookup failed' });
    }
    const [plan] = await planResp.json();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const teamEmails = teamRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const callerIsTeam = teamEmails.some(te =>
      te.endsWith('@' + (user.email || '').toLowerCase().split('@')[1])
    ) || (user.email || '').toLowerCase().endsWith('@pfs4u.com');
    const callerIsClient = (plan.client_email || '').toLowerCase() === (user.email || '').toLowerCase();

    if (!callerIsTeam && !callerIsClient) {
      return res.status(403).json({ error: 'Not authorized to send notifications for this plan' });
    }

    // Build { to, subject, html } per type.
    const planUrl = `${appUrl}/?id=${encodeURIComponent(plan.id)}&view=plan`;
    const { to, subject, html } = buildEmail({
      type, note, plan, planUrl, callerIsTeam, callerIsClient,
      teamEmails, callerEmail: user.email,
    });

    if (!to || to.length === 0) {
      return res.status(200).json({ ok: true, skipped: 'no recipients for this event + role combo' });
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Resend send failed', detail: data });
    }
    return res.status(200).json({ ok: true, id: data.id, to });
  } catch (err) {
    return res.status(500).json({ error: 'Notify failed: ' + err.message });
  }
}

// Pre-templated emails. All server-constructed — client can't inject content
// except via the optional "note" field, which is rendered as plain text.
function buildEmail({ type, note, plan, planUrl, callerIsTeam, callerIsClient, teamEmails, callerEmail }) {
  const safeNote = String(note || '').slice(0, 2000)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
    .replace(/\n/g, '<br>');
  const planName = (plan.name || 'your plan').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const base = styleShell;

  // Recipient logic:
  //   plan_saved: team → client. client → team.
  //   review_posted: team → client (tell client a review was posted)
  //   doc_uploaded: other party
  //   meeting_prep_ready: team only
  const clientEmail = (plan.client_email || '').toLowerCase();

  if (type === 'plan_saved') {
    if (callerIsTeam && clientEmail) {
      return {
        to: [clientEmail],
        subject: `Your financial plan has been updated — ${planName}`,
        html: base(`
          <p>Your advisor has just updated your financial plan, <strong>${planName}</strong>.</p>
          ${safeNote ? `<p style="background:#FAF6ED;padding:14px 18px;border-left:3px solid #C9A961;">${safeNote}</p>` : ''}
          <p><a href="${planUrl}" class="btn">Open Your Plan →</a></p>
        `),
      };
    }
    if (callerIsClient && teamEmails.length) {
      return {
        to: teamEmails,
        subject: `Client updated their plan — ${planName}`,
        html: base(`
          <p>The client <strong>${callerEmail}</strong> updated their plan: <strong>${planName}</strong>.</p>
          ${safeNote ? `<p style="background:#FAF6ED;padding:14px 18px;border-left:3px solid #C9A961;">${safeNote}</p>` : ''}
          <p><a href="${planUrl}" class="btn">Review the Changes →</a></p>
        `),
      };
    }
  }

  if (type === 'review_posted') {
    if (callerIsTeam && clientEmail) {
      return {
        to: [clientEmail],
        subject: `New note on your plan — ${planName}`,
        html: base(`
          <p>Your advisor left a new note on <strong>${planName}</strong>.</p>
          ${safeNote ? `<p style="background:#FAF6ED;padding:14px 18px;border-left:3px solid #C9A961;">${safeNote}</p>` : ''}
          <p><a href="${planUrl}" class="btn">View in Your Plan →</a></p>
        `),
      };
    }
  }

  if (type === 'doc_uploaded') {
    const to = callerIsTeam ? (clientEmail ? [clientEmail] : []) : teamEmails;
    if (to.length) {
      return {
        to,
        subject: `New document on plan — ${planName}`,
        html: base(`
          <p>A new document has been added to the plan <strong>${planName}</strong> by <strong>${callerEmail}</strong>.</p>
          ${safeNote ? `<p style="background:#FAF6ED;padding:14px 18px;border-left:3px solid #C9A961;"><em>${safeNote}</em></p>` : ''}
          <p><a href="${planUrl}" class="btn">View Document →</a></p>
        `),
      };
    }
  }

  if (type === 'meeting_prep_ready') {
    if (callerIsTeam && teamEmails.length) {
      return {
        to: teamEmails,
        subject: `Meeting prep ready — ${planName}`,
        html: base(`
          <p>The AI Meeting Prep briefing has been generated for <strong>${planName}</strong>.</p>
          ${safeNote ? `<p>${safeNote}</p>` : ''}
          <p><a href="${planUrl}" class="btn">Open Meeting Prep →</a></p>
        `),
      };
    }
  }

  return { to: [], subject: '', html: '' };
}

function styleShell(innerHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#F5F1E8; font-family:-apple-system, Helvetica, Arial, sans-serif; color:#1a1a1a; line-height:1.55; }
  .wrap { max-width:560px; margin:0 auto; padding:28px 20px; }
  .card { background:#FFF; border:1px solid rgba(201,169,97,.25); border-radius:8px; padding:30px 34px; }
  h1 { font-family:Georgia, serif; color:#8B1A1A; font-size:22px; margin:0 0 16px; letter-spacing:.3px; }
  .brand { font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#8B7640; font-weight:700; margin-bottom:6px; }
  a.btn { display:inline-block; background:#C9A961; color:#F5F1E8; padding:12px 20px; border-radius:4px; text-decoration:none; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; font-size:11px; margin-top:8px; }
  .foot { font-size:11px; color:#8a8770; margin-top:22px; text-align:center; }
  .foot a { color:#8B7640; }
</style></head>
<body><div class="wrap"><div class="card">
  <div class="brand">Pyle Financial Services</div>
  <h1>Planning Update</h1>
  ${innerHtml}
</div>
<div class="foot">
  Pyle Financial Services, Inc · <a href="https://www.pylefinancialservices.com">pylefinancialservices.com</a><br>
  You received this because you are on a plan managed by Pyle Financial Services.
</div></div></body></html>`;
}
