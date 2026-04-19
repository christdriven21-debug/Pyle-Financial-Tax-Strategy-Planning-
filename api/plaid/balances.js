// Vercel serverless: fetches current balances across all linked
// Plaid items for a user. Returns aggregated balances grouped by
// account type (depository, investment, credit, loan) for use in
// the Personal Balance Sheet auto-population.
//
// Called on-demand from the Builder when the user clicks
// "Refresh Balances". Typical use: advisor runs daily/weekly
// sync; client account data auto-populates into the plan inputs.

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

  if (!clientId || !secret || !supaUrl || !supaKey) {
    return res.status(503).json({ error: 'Plaid or Supabase not configured', code: 'no_config' });
  }

  const baseUrl = PLAID_ENVS[env] || PLAID_ENVS.sandbox;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    // Fetch all plaid_items for this user
    const itemsResp = await fetch(`${supaUrl}/rest/v1/plaid_items?user_id=eq.${userId}&select=*`, {
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` },
    });
    const items = await itemsResp.json();
    if (!items || items.length === 0) {
      return res.status(200).json({ accounts: [], aggregated: { total: 0 }, items: 0 });
    }

    // For each item, fetch account balances from Plaid
    const allAccounts = [];
    for (const item of items) {
      try {
        const balResp = await fetch(`${baseUrl}/accounts/balance/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
        });
        const balData = await balResp.json();
        if (balResp.ok && balData.accounts) {
          balData.accounts.forEach(acc => {
            allAccounts.push({
              institution: item.institution_name || 'Unknown',
              item_id: item.item_id,
              account_id: acc.account_id,
              name: acc.name,
              official_name: acc.official_name,
              type: acc.type,
              subtype: acc.subtype,
              balance: acc.balances.current,
              available: acc.balances.available,
              currency: acc.balances.iso_currency_code,
            });
          });
        }
      } catch (e) {
        // Log but continue with other items
        console.error('Failed to fetch item', item.item_id, e.message);
      }
    }

    // Aggregate by type
    const aggregated = { depository: 0, investment: 0, credit: 0, loan: 0, other: 0, total: 0 };
    allAccounts.forEach(a => {
      const bucket = ['depository', 'investment', 'credit', 'loan'].includes(a.type) ? a.type : 'other';
      aggregated[bucket] = (aggregated[bucket] || 0) + (a.balance || 0);
      // Total excludes credit/loan (those are negative-value liabilities)
      if (['depository', 'investment'].includes(a.type)) {
        aggregated.total += (a.balance || 0);
      }
    });

    return res.status(200).json({
      accounts: allAccounts,
      aggregated,
      items: items.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: `Balance fetch failed: ${err.message}` });
  }
}
