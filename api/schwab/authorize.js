// Vercel serverless: starts Schwab OAuth — redirects user to Schwab consent screen.
// Required Vercel env vars:
//   SCHWAB_CLIENT_ID        — app key from developer.schwab.com
//   SCHWAB_CLIENT_SECRET    — app secret (NEVER in browser; also used as HMAC key for state)
//   SCHWAB_REDIRECT_URI     — must match the registered redirect exactly
//                             e.g. https://pyle-planning.vercel.app/api/schwab/callback
//
// Security:
//   - The `state` parameter is an HMAC-signed blob of (user_id, nonce, timestamp).
//   - A matching `schwab_oauth_nonce` HttpOnly cookie is set — the callback
//     must find the same nonce in both the state param and the cookie. This
//     closes the CSRF window where an attacker could trigger an OAuth flow
//     and plant their own Schwab tokens in a victim's browser.
//   - `returnTo` is validated to be a same-origin path (must start with `/`
//     and cannot contain `//` or protocol). Closes the open-redirect vector.

import crypto from 'node:crypto';

// Only allow return_to values that are same-origin paths. Rejects absolute
// URLs, protocol-relative URLs (//evil.com), and javascript:/data: schemes.
function safeReturnPath(rawReturnTo) {
  if (typeof rawReturnTo !== 'string' || rawReturnTo.length === 0) return '/';
  if (!rawReturnTo.startsWith('/')) return '/';
  if (rawReturnTo.startsWith('//')) return '/';    // protocol-relative
  if (rawReturnTo.includes('\\')) return '/';      // backslash trickery
  // Disallow any scheme-looking chars before the first slash
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(rawReturnTo)) return '/';
  return rawReturnTo;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signState(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return body + '.' + b64url(sig);
}

export default function handler(req, res) {
  const clientId    = process.env.SCHWAB_CLIENT_ID;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI;
  const stateSecret = process.env.SCHWAB_CLIENT_SECRET;  // reused as HMAC key
  if (!clientId || !redirectUri || !stateSecret) {
    return res.status(500).json({ error: 'SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET / SCHWAB_REDIRECT_URI not configured in Vercel env' });
  }

  const returnTo = safeReturnPath(req.query.return_to);
  const userId   = typeof req.query.user_id === 'string' ? req.query.user_id : '';
  // Bind the OAuth flow to the Supabase user who initiated it. When the
  // callback finishes, we verify the same user_id is still signed in before
  // accepting the tokens. Validate UUID shape before use.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: 'Missing or invalid user_id query param' });
  }

  // Nonce defeats CSRF: the attacker can forge a state param they cooked up
  // offline, but they can't set the matching cookie in the victim's browser.
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();

  const state = signState({ user_id: userId, return_to: returnTo, nonce, ts: issuedAt }, stateSecret);

  res.setHeader('Set-Cookie', [
    `schwab_oauth_nonce=${nonce}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
  ]);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         'readonly',
    state,
  });
  res.redirect(302, 'https://api.schwabapi.com/v1/oauth/authorize?' + params.toString());
}
