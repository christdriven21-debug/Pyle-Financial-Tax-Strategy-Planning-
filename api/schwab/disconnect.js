// Vercel serverless: clears the Schwab auth cookie.
// Requires an authenticated Supabase session to prevent arbitrary
// cross-origin callers from clearing a logged-in user's Schwab link.
import { requireUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  res.setHeader('Set-Cookie', ['schwab_auth=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0']);
  res.status(200).json({ disconnected: true });
}
