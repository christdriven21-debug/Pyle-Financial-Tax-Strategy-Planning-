// Vercel serverless: OAuth callback — exchanges auth code for access+refresh token.
// Stores tokens in an httpOnly cookie (so JS can't read them) scoped to the site.

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const clientId     = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri  = process.env.SCHWAB_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: 'Schwab env vars not configured' });
  }

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
  // tokens = { access_token, refresh_token, expires_in, token_type, scope, id_token? }

  // Store tokens in an httpOnly cookie (opaque to JS; server reads on API calls).
  // For production, store server-side keyed by user id; this cookie approach is
  // fine for single-advisor usage but doesn't scale to multiple team members.
  const cookieValue = Buffer.from(JSON.stringify({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    Date.now() + (tokens.expires_in || 1800) * 1000,
  })).toString('base64url');

  res.setHeader('Set-Cookie', [
    `schwab_auth=${cookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
  ]);

  // Bounce back to the app with a marker so UI knows auth succeeded
  let returnTo = '/';
  try { returnTo = JSON.parse(Buffer.from(state, 'base64url').toString()).returnTo || '/'; } catch(e){}
  res.redirect(302, returnTo + (returnTo.includes('?') ? '&' : '?') + 'schwab=connected');
}
