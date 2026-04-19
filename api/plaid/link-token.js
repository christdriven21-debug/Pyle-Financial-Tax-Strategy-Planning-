// Vercel serverless: creates a Plaid Link token so the client-side
// Plaid Link UI can launch. The link token represents the intent
// to link an account — it carries the client_name, products, and
// the Supabase user_id that will own the resulting access_token.
//
// Requires PLAID_CLIENT_ID + PLAID_SECRET + PLAID_ENV env vars.
// See /plaid-setup.html for step-by-step activation.

const PLAID_ENVS = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!clientId || !secret) {
    return res.status(503).json({
      error: 'Plaid not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV on this Vercel deployment. See /plaid-setup.html',
      code: 'no_plaid_config',
    });
  }

  const baseUrl = PLAID_ENVS[env] || PLAID_ENVS.sandbox;
  const { userId, clientName } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing "userId"' });

  try {
    const resp = await fetch(`${baseUrl}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        client_name: clientName || 'Pyle Financial Services',
        user: { client_user_id: String(userId) },
        products: ['auth', 'investments', 'liabilities'],
        country_codes: ['US'],
        language: 'en',
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Plaid error: ${data.error_message || JSON.stringify(data).slice(0, 400)}` });
    }
    return res.status(200).json({ link_token: data.link_token, expiration: data.expiration });
  } catch (err) {
    return res.status(500).json({ error: `Link token creation failed: ${err.message}` });
  }
}
