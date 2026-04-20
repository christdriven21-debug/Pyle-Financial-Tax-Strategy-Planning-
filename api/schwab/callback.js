// Vercel serverless: OAuth callback — exchanges auth code for access+refresh token.
// Stores tokens in an HttpOnly cookie scoped to the Supabase user who
// initiated the flow. The cookie payload is HMAC-signed and includes
// the user_id so /api/schwab/accounts can verify the caller matches.
//
// Security properties:
//   - Verifies the `state` HMAC signature (rejects forged states).
//   - Verifies the nonce in `state` matches the nonce in the cookie
//     set by /authorize (blocks CSRF and cross-session state replays).
//   - Rejects states older than 10 minutes (blocks replay of stale auths).
//   - Validates return_to as a same-origin path (blocks open redirects).

import crypto from 'node:crypto';

const MAX_AGE_MS = 10 * 60 * 1000;

function b64urlDecode(s) {
  // base64url → base64
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  // pad to multiple of 4
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verifyState(state, secret) {
  if (typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;
  try {
    return JSON.parse(b64urlDecode(body).toString());
  } catch { return null; }
}

function safeReturnPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return '/';
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(p)) return '/';
  return p;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx < 0) return;
    const k = c.slice(0, idx).trim();
    const v = c.slice(idx + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).json({ error: 'Missing authorization code or state' });
  }

  const clientId     = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri  = process.env.SCHWAB_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: 'Schwab env vars not configured' });
  }

  // 1. Verify state HMAC signature.
  const payload = verifyState(state, clientSecret);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid state (bad signature)' });
  }

  // 2. Verify state freshness.
  if (!payload.ts || Date.now() - payload.ts > MAX_AGE_MS) {
    return res.status(400).json({ error: 'OAuth state expired — try connecting again' });
  }

  // 3. Verify nonce matches cookie set by /authorize (CSRF defense).
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.schwab_oauth_nonce || cookies.schwab_oauth_nonce !== payload.nonce) {
    return res.status(400).json({ error: 'OAuth nonce mismatch — flow appears tampered' });
  }

  // 4. Exchange code for tokens.
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + basicAuth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    return res.status(502).json({ error: 'Schwab token exchange failed', detail: text });
  }
  const tokens = await tokenResp.json();

  // 5. Build a signed cookie that ties the Schwab tokens to the Supabase
  //    user who initiated the flow. /api/schwab/accounts will verify the
  //    user_id in the cookie matches the caller's signed-in Supabase JWT.
  const cookieBody = {
    user_id:       payload.user_id,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    Date.now() + (tokens.expires_in || 1800) * 1000,
  };
  const bodyB64 = b64url(JSON.stringify(cookieBody));
  const sig = crypto.createHmac('sha256', clientSecret).update(bodyB64).digest();
  const cookieValue = bodyB64 + '.' + b64url(sig);

  res.setHeader('Set-Cookie', [
    `schwab_auth=${cookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
    // Clear the nonce cookie now that we've consumed it.
    `schwab_oauth_nonce=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`,
  ]);

  // 6. Redirect back to the (validated) return path.
  const returnTo = safeReturnPath(payload.return_to);
  res.redirect(302, returnTo + (returnTo.includes('?') ? '&' : '?') + 'schwab=connected');
}
