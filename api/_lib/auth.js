// ═══════════════════════════════════════════════════════════
// Shared auth helper for Vercel serverless endpoints.
//
// Verifies a Supabase JWT from the Authorization: Bearer header
// and returns the authenticated user. Also enforces an Origin
// allowlist so our APIs can't be called from arbitrary websites
// (defense-in-depth on top of bearer auth).
//
// Usage in an endpoint:
//   import { requireUser } from './_lib/auth.js';
//   const user = await requireUser(req, res);
//   if (!user) return; // requireUser already sent a 401/403 response
//   // ... use user.id, user.email
// ═══════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://pyle-planning.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

// UUID v4 regex for validating user-supplied identifiers before
// building PostgREST filter strings. Rejects injection attempts
// like "<uuid>&user_id=is.null" or "'; drop ...".
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Enforce Origin allowlist. Returns true if OK, else sends 403 and
// returns false. Called first thing in every handler.
export function checkOrigin(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  // Allow requests with no Origin only for same-origin internal calls
  // (Vercel cron, server-to-server). The cron endpoint has its own
  // CRON_SECRET check for that.
  if (!origin) return true;
  const ok = ALLOWED_ORIGINS.some(a => origin === a || origin.startsWith(a + '/'));
  if (!ok) {
    res.status(403).json({ error: 'Origin not allowed', code: 'bad_origin' });
    return false;
  }
  return true;
}

// Verify the Supabase JWT and return the user object.
// Returns null (and sends 401) if anything is missing or invalid.
export async function requireUser(req, res) {
  if (!checkOrigin(req, res)) return null;

  const supaUrl = process.env.SUPABASE_URL;
  // Prefer anon key but fall back to service-role key for JWT validation.
  // /auth/v1/user just verifies the Bearer token — either key works as the
  // apikey header for that endpoint.
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !apiKey) {
    res.status(503).json({ error: 'Supabase not configured', code: 'no_supabase_config' });
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer token', code: 'no_auth' });
    return null;
  }

  try {
    // Ask Supabase to validate the JWT. /auth/v1/user returns user
    // data if the token is valid; 401 if expired/bad.
    const resp = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) {
      res.status(401).json({ error: 'Invalid or expired session', code: 'bad_auth' });
      return null;
    }
    const user = await resp.json();
    if (!user || !user.id) {
      res.status(401).json({ error: 'Session did not resolve to a user', code: 'no_user' });
      return null;
    }
    return user;
  } catch (e) {
    res.status(401).json({ error: 'Auth verification failed: ' + e.message, code: 'auth_error' });
    return null;
  }
}
