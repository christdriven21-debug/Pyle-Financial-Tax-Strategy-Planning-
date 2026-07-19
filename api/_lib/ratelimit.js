// ═══════════════════════════════════════════════════════════
// Per-user token-bucket rate limiter for the AI proxy endpoints.
//
// Calls the Supabase RPC `consume_rate_limit` (see supabase/add_rate_limits.sql)
// with the SERVICE-ROLE key, passing the user id the endpoint has already
// verified via requireUser(). Caps per-user call volume so a scripted loop
// can't burn Anthropic credits.
//
// FAILS OPEN. If the service-role key is missing, the migration hasn't been
// run, or the RPC errors, this allows the request (and logs a warning). The
// limiter is a cost guard, not an auth gate — a misconfiguration must never
// lock legitimate users out of the product. It only starts enforcing once
// SUPABASE_SERVICE_ROLE_KEY is set on Vercel AND add_rate_limits.sql has run.
//
// Usage in an endpoint, after `const user = await requireUser(req, res)`:
//   import { enforceRateLimit } from './_lib/ratelimit.js';
//   if (await enforceRateLimit(res, user.id, 'ask-plan', 20, 60)) return;
// ═══════════════════════════════════════════════════════════

// Returns { allowed, degraded }. degraded=true means the limiter could not run
// and the request was allowed by default.
export async function checkRateLimit(userId, bucket, limit, windowSeconds) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !userId) {
    if (!key) console.warn('[ratelimit] SUPABASE_SERVICE_ROLE_KEY not set — limiter disabled (fail-open)');
    return { allowed: true, degraded: true };
  }
  try {
    const resp = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_bucket: bucket,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    });
    if (!resp.ok) {
      console.warn(`[ratelimit] RPC returned ${resp.status} — allowing (fail-open). Did you run add_rate_limits.sql?`);
      return { allowed: true, degraded: true };
    }
    const allowed = await resp.json(); // the RPC returns a boolean
    return { allowed: allowed !== false, degraded: false };
  } catch (e) {
    console.warn('[ratelimit] limiter error — allowing (fail-open):', e.message);
    return { allowed: true, degraded: true };
  }
}

// Enforce a limit and, if exceeded, send a 429 and return true so the caller
// can `return` immediately. Returns false when the request may proceed.
export async function enforceRateLimit(res, userId, bucket, limit, windowSeconds) {
  const { allowed } = await checkRateLimit(userId, bucket, limit, windowSeconds);
  if (!allowed) {
    res.status(429).json({
      error: 'Rate limit reached for this feature. Please wait a moment and try again.',
      code: 'rate_limited',
    });
    return true;
  }
  return false;
}
