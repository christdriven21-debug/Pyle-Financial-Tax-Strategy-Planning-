// Vercel serverless: cron-driven daily balance snapshot job.
// Runs daily at 06:00 UTC (configured in vercel.json -> crons).
//
// For each plaid_items row across ALL users, fetches current
// balances from Plaid and writes them to plaid_balance_snapshots.
// Updates last_balance_sync timestamp on the item. Uses the
// service-role Supabase key so it can read access_tokens (which
// the client never sees) and bypass RLS for the snapshot insert.
//
// Security: Vercel Cron requests include an Authorization header
// `Bearer ${CRON_SECRET}` if you set the CRON_SECRET env var. We
// also accept calls from Vercel's internal cron user-agent.

const PLAID_ENVS = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com',
};

export default async function handler(req, res) {
  // Verify request is from Vercel Cron (or matches CRON_SECRET if set)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const userAgent  = req.headers['user-agent'] || '';
  const isVercelCron = userAgent.includes('vercel-cron');
  const hasSecret    = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized — cron requests only' });
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  const env      = process.env.PLAID_ENV || 'sandbox';
  const supaUrl  = process.env.SUPABASE_URL;
  const supaKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !secret || !supaUrl || !supaKey) {
    return res.status(503).json({ error: 'Plaid or Supabase not configured', code: 'no_config' });
  }
  const baseUrl = PLAID_ENVS[env] || PLAID_ENVS.sandbox;

  try {
    // Pull every active plaid_item across all users
    const itemsResp = await fetch(`${supaUrl}/rest/v1/plaid_items?status=eq.active&select=*`, {
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` },
    });
    if (!itemsResp.ok) {
      const txt = await itemsResp.text();
      return res.status(500).json({ error: `Failed to list plaid_items: ${txt}` });
    }
    const items = await itemsResp.json();
    if (!items || items.length === 0) {
      return res.status(200).json({ ok: true, items: 0, snapshots: 0, message: 'No active items to sync' });
    }

    let snapshotsWritten = 0;
    let itemsFailed = 0;
    const failures = [];

    for (const item of items) {
      try {
        const balResp = await fetch(`${baseUrl}/accounts/balance/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
        });
        const balData = await balResp.json();
        if (!balResp.ok || !balData.accounts) {
          itemsFailed++;
          failures.push({ item_id: item.item_id, error: balData.error_message || 'unknown' });
          continue;
        }

        // Build snapshot rows
        const rows = balData.accounts.map(acc => ({
          user_id: item.user_id,
          account_id: acc.account_id,
          item_id: item.item_id,
          institution: item.institution_name || 'Unknown',
          account_type: acc.type || null,
          account_subtype: acc.subtype || null,
          balance: acc.balances?.current ?? null,
          available: acc.balances?.available ?? null,
          currency: acc.balances?.iso_currency_code || 'USD',
        }));

        const snapResp = await fetch(`${supaUrl}/rest/v1/plaid_balance_snapshots`, {
          method: 'POST',
          headers: {
            'apikey': supaKey,
            'Authorization': `Bearer ${supaKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(rows),
        });
        if (snapResp.ok) {
          snapshotsWritten += rows.length;
        } else {
          const txt = await snapResp.text();
          itemsFailed++;
          failures.push({ item_id: item.item_id, error: `snapshot insert: ${txt.slice(0, 200)}` });
        }

        // Update last_balance_sync on the item
        await fetch(`${supaUrl}/rest/v1/plaid_items?item_id=eq.${item.item_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supaKey,
            'Authorization': `Bearer ${supaKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ last_balance_sync: new Date().toISOString() }),
        });
      } catch (e) {
        itemsFailed++;
        failures.push({ item_id: item.item_id, error: e.message });
      }
    }

    return res.status(200).json({
      ok: true,
      items: items.length,
      snapshots: snapshotsWritten,
      failed: itemsFailed,
      failures: failures.slice(0, 20),
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
}
