// Vercel serverless: fetches the signed-in user's Schwab accounts + balances.
// Auto-refreshes the access token if expired.

async function refreshIfNeeded(cookieAuth) {
  if (!cookieAuth) return null;
  let auth;
  try { auth = JSON.parse(Buffer.from(cookieAuth, 'base64url').toString()); } catch { return null; }
  if (auth.expires_at && Date.now() < auth.expires_at - 60_000) return auth;

  // Refresh
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
    access_token:  t.access_token,
    refresh_token: t.refresh_token || auth.refresh_token,
    expires_at:    Date.now() + (t.expires_in || 1800) * 1000,
  };
}

export default async function handler(req, res) {
  const cookie = (req.headers.cookie || '')
    .split(';').map(s => s.trim())
    .find(c => c.startsWith('schwab_auth='));
  const rawAuth = cookie ? cookie.split('=')[1] : null;

  const auth = await refreshIfNeeded(rawAuth);
  if (!auth || !auth.access_token) {
    return res.status(401).json({ error: 'Not connected to Schwab. Click Connect Schwab first.' });
  }

  // If we refreshed, update the cookie
  if (auth.access_token !== JSON.parse(Buffer.from(rawAuth || '', 'base64url').toString() || '{}').access_token) {
    const newCookie = Buffer.from(JSON.stringify(auth)).toString('base64url');
    res.setHeader('Set-Cookie', [
      `schwab_auth=${newCookie}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
    ]);
  }

  // Fetch accounts + positions
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

  // Summarize to keep the browser payload small and privacy-scoped.
  // data shape: [{ securitiesAccount: { accountNumber, type, currentBalances: { liquidationValue, ... }, positions: [...] } }, ...]
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
