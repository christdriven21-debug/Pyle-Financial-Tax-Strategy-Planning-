// Vercel serverless: fetches the signed-in user's Schwab accounts + balances.
// Auto-refreshes the access token if expired.
//
// Security:
//   - Requires a valid Supabase JWT (Bearer token). Without it, 401.
//   - Verifies the schwab_auth cookie's HMAC signature (rejects tampered
//     or forged cookies).
//   - Verifies the user_id embedded in the cookie matches the caller's
//     Supabase user id. Prevents a malicious or browser-shared cookie
//     from leaking another advisor's Schwab data.

import crypto from 'node:crypto';
import { requireUser } from '../_lib/auth.js';

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verifyCookie(cookie, secret) {
  if (typeof cookie !== 'string') return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;
  try { return JSON.parse(b64urlDecode(body).toString()); } catch { return null; }
}

function signCookie(body, secret) {
  const bodyB64 = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(bodyB64).digest();
  return bodyB64 + '.' + b64url(sig);
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

async function refreshIfNeeded(auth, secret) {
  if (!auth) return null;
  if (auth.expires_at && Date.now() < auth.expires_at - 60_000) return auth;
  const basic = Buffer.from(
    `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`
  ).toString('base64');
  const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + basic,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: auth.refresh_token,
    }).toString(),
  });
  if (!resp.ok) return null;
  const t = await resp.json();
  return {
    user_id:       auth.user_id,
    access_token:  t.access_token,
    refresh_token: t.refresh_token || auth.refresh_token,
    expires_at:    Date.now() + (t.expires_in || 1800) * 1000,
  };
}

export default async function handler(req, res) {
  // 1. Require a valid Supabase session on the caller.
  const supaUser = await requireUser(req, res);
  if (!supaUser) return;

  const secret = process.env.SCHWAB_CLIENT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Schwab not configured' });

  // 2. Verify signed Schwab cookie.
  const cookies = parseCookies(req.headers.cookie);
  const rawAuth = cookies.schwab_auth;
  const authFromCookie = verifyCookie(rawAuth, secret);
  if (!authFromCookie || !authFromCookie.access_token) {
    return res.status(401).json({ error: 'Not connected to Schwab. Click Connect Schwab first.' });
  }

  // 3. Verify cookie is scoped to the caller's Supabase user.
  if (authFromCookie.user_id !== supaUser.id) {
    return res.status(403).json({ error: 'Schwab cookie belongs to a different signed-in user. Reconnect Schwab.' });
  }

  // 4. Refresh token if near expiry.
  const auth = await refreshIfNeeded(authFromCookie, secret);
  if (!auth || !auth.access_token) {
    return res.status(401).json({ error: 'Schwab refresh failed — reconnect needed.' });
  }

  // 5. If we refreshed, rewrite the signed cookie.
  if (auth.access_token !== authFromCookie.access_token) {
    const newCookie = signCookie(auth, secret);
    res.setHeader('Set-Cookie', [
      `schwab_auth=${newCookie}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
    ]);
  }

  // 6. Fetch accounts + positions.
  const r = await fetch('https://api.schwabapi.com/trader/v1/accounts?fields=positions', {
    headers: {
      'Authorization': 'Bearer ' + auth.access_token,
      'Accept': 'application/json',
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    return res.status(r.status).json({ error: 'Schwab API error', detail: txt });
  }
  const data = await r.json();

  const summary = (Array.isArray(data) ? data : []).map(row => {
    const sa = row.securitiesAccount || {};
    return {
      accountNumber: sa.accountNumber,
      type:          sa.type,
      liquidationValue: sa.currentBalances?.liquidationValue || 0,
      cashBalance:      sa.currentBalances?.cashBalance      || 0,
      longMarketValue:  sa.currentBalances?.longMarketValue  || 0,
      positionCount:    (sa.positions || []).length,
    };
  });

  const total = summary.reduce((s, a) => s + (a.liquidationValue || 0), 0);
  res.status(200).json({ accounts: summary, totalLiquidationValue: total, fetchedAt: new Date().toISOString() });
}
