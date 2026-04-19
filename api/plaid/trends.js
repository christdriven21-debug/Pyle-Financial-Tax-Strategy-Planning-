// Vercel serverless: read historical balance snapshots for a user
// to chart net worth / account-level trends. Aggregates by day so
// the UI can render a clean line chart even if the cron job ran
// multiple times in a day.
//
// Returns { series: [{ date, total, depository, investment }, ...] }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return res.status(503).json({ error: 'Supabase not configured', code: 'no_config' });
  }
  const { userId, days = 90 } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const since = new Date();
  since.setDate(since.getDate() - Number(days));
  const sinceIso = since.toISOString();

  try {
    const url = `${supaUrl}/rest/v1/plaid_balance_snapshots`
      + `?user_id=eq.${userId}`
      + `&captured_at=gte.${encodeURIComponent(sinceIso)}`
      + `&select=captured_at,account_type,balance,available,currency,institution`
      + `&order=captured_at.asc`
      + `&limit=10000`;
    const resp = await fetch(url, {
      headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` },
    });
    if (!resp.ok) {
      return res.status(500).json({ error: `Snapshot fetch failed: ${await resp.text()}` });
    }
    const rows = await resp.json();

    // Aggregate by YYYY-MM-DD
    const byDay = new Map();
    for (const r of rows) {
      const day = (r.captured_at || '').slice(0, 10);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, { date: day, depository: 0, investment: 0, credit: 0, loan: 0, other: 0, total: 0 });
      const acc = byDay.get(day);
      const bucket = ['depository','investment','credit','loan'].includes(r.account_type) ? r.account_type : 'other';
      acc[bucket] = (acc[bucket] || 0) + Number(r.balance || 0);
      // Total = assets minus liabilities
      if (['depository','investment'].includes(r.account_type)) acc.total += Number(r.balance || 0);
      if (['credit','loan'].includes(r.account_type))           acc.total -= Number(r.balance || 0);
    }
    const series = Array.from(byDay.values()).sort((a, b) => a.date < b.date ? -1 : 1);

    return res.status(200).json({ series, points: series.length, days });
  } catch (err) {
    return res.status(500).json({ error: `Trend fetch failed: ${err.message}` });
  }
}
