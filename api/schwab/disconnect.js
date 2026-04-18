// Vercel serverless: clears the Schwab auth cookie.
export default function handler(req, res) {
  res.setHeader('Set-Cookie', ['schwab_auth=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0']);
  res.status(200).json({ disconnected: true });
}
