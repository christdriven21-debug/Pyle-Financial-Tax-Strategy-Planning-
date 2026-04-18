// Vercel serverless: starts Schwab OAuth — redirects user to Schwab consent screen.
// Required Vercel env vars:
//   SCHWAB_CLIENT_ID        — app key from developer.schwab.com
//   SCHWAB_CLIENT_SECRET    — app secret (NEVER in browser)
//   SCHWAB_REDIRECT_URI     — must match the registered redirect exactly
//                             e.g. https://pyle-planning.vercel.app/api/schwab/callback

export default function handler(req, res) {
  const clientId    = process.env.SCHWAB_CLIENT_ID;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'SCHWAB_CLIENT_ID / SCHWAB_REDIRECT_URI not configured in Vercel env' });
  }

  // Carry the post-auth landing URL through state so the callback can bounce back
  const returnTo = (req.query.return_to || '/').toString();
  const state = Buffer.from(JSON.stringify({ returnTo, nonce: Math.random().toString(36).slice(2) })).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         'readonly',
    state,
  });
  res.redirect(302, 'https://api.schwabapi.com/v1/oauth/authorize?' + params.toString());
}
