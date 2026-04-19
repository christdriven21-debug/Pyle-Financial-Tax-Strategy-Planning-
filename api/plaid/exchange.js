// Vercel serverless: exchanges a Plaid public_token (returned from
// the Link UI after the user authenticates with their bank) for a
// long-lived access_token. Stores the access_token in Supabase
// (public.plaid_items table) keyed to the user.
//
// Requires: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role so we can
// write on behalf of authenticated users — RLS enforces read-only
// from the client-side anon key).

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
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !secret) {
    return res.status(503).json({ error: 'Plaid not configured', code: 'no_plaid_config' });
  }
  if (!supaUrl || !supaKey) {
    return res.status(503).json({ error: 'Supabase service role not configured on this Vercel deployment', code: 'no_supabase_config' });
  }

  const baseUrl = PLAID_ENVS[env] || PLAID_ENVS.sandbox;
  const { publicToken, userId, institutionName } = req.body || {};
  if (!publicToken || !userId) {
    return res.status(400).json({ error: 'Missing publicToken or userId' });
  }

  try {
    // Exchange public_token for access_token
    const exchangeResp = await fetch(`${baseUrl}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, public_token: publicToken }),
    });
    const exchangeData = await exchangeResp.json();
    if (!exchangeResp.ok) {
      return res.status(exchangeResp.status).json({ error: `Plaid exchange failed: ${exchangeData.error_message || 'unknown'}` });
    }
    const { access_token, item_id } = exchangeData;

    // Store access_token in Supabase plaid_items table (service role bypasses RLS)
    const storeResp = await fetch(`${supaUrl}/rest/v1/plaid_items`, {
      method: 'POST',
      headers: {
        'apikey': supaKey,
        'Authorization': `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        item_id,
        access_token,
        institution_name: institutionName || null,
        created_at: new Date().toISOString(),
      }),
    });
    if (!storeResp.ok) {
      const errTxt = await storeResp.text();
      return res.status(500).json({ error: `Supabase store failed: ${errTxt.slice(0, 300)}` });
    }

    return res.status(200).json({ ok: true, item_id });
  } catch (err) {
    return res.status(500).json({ error: `Exchange flow failed: ${err.message}` });
  }
}
