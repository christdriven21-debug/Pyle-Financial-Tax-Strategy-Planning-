# Resend Email + Custom Subdomain Setup

Two infrastructure tasks that complete the production-grade deployment:

1. **Resend email** — branded magic-link sign-in emails + transactional notifications (plan saved, review posted, document uploaded, meeting-prep ready)
2. **Custom subdomain** — `plan.pylefinancialservices.com` instead of `pyle-planning.vercel.app`

Both are configuration tasks (no code changes needed) and take ~30 minutes total. Do them in this order: subdomain first (CNAME propagation can take a few hours), then Resend (verify the new subdomain on Resend after CNAME resolves).

---

## Part 1 — Custom Subdomain

**Goal:** users hit `https://plan.pylefinancialservices.com/` instead of the Vercel-default URL.

### Step 1.1 — Add domain in Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → select the `pyle-planning` project
2. **Settings → Domains**
3. Click **Add Domain** → enter `plan.pylefinancialservices.com`
4. Vercel shows the required DNS record. It will be one of:
   - **CNAME** record pointing `plan` → `cname.vercel-dns.com`
   - or an **A** record pointing to a Vercel IP (`76.76.21.21`)

CNAME is preferred (auto-updates if Vercel changes infrastructure).

### Step 1.2 — Add the DNS record at GoDaddy

1. Sign in to [godaddy.com](https://godaddy.com)
2. **My Products → Domains → pylefinancialservices.com → DNS**
3. Click **Add** under DNS Records
4. Enter:
   - Type: **CNAME**
   - Host: **plan**
   - Points to: **cname.vercel-dns.com**
   - TTL: **1 hour** (default)
5. Save

GoDaddy will show "DNS update in progress." Propagation takes 5 minutes – 4 hours typically; up to 48 hours worst case.

### Step 1.3 — Verify in Vercel

1. Back in Vercel **Settings → Domains**
2. Refresh — the domain should show **Valid Configuration ✓** within a few minutes
3. SSL certificate auto-issues via Let's Encrypt (~30 seconds)

### Step 1.4 — Update Supabase auth URL

Magic-link emails embed a redirect URL — the redirect must match an allowed URL or auth fails.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → select your project
2. **Authentication → URL Configuration**
3. **Site URL** = `https://plan.pylefinancialservices.com`
4. **Redirect URLs** — add (one per line):
   ```
   https://plan.pylefinancialservices.com/**
   https://pyle-planning.vercel.app/**
   http://localhost:5173/**
   ```
   Keep the Vercel default URL as a fallback.
5. Save

### Step 1.5 — Update Vercel `APP_URL` env var

1. Vercel **Settings → Environment Variables**
2. Find `APP_URL` (or add if missing)
3. Set value to `https://plan.pylefinancialservices.com`
4. Apply to Production · Preview · Development (all environments)
5. **Redeploy** the project (env vars only take effect on next deploy):
   - Vercel → Deployments → most recent → ⋯ → Redeploy

### Step 1.6 — Smoke test

1. Open `https://plan.pylefinancialservices.com/` in a private window
2. Sign in with magic link
3. Email should arrive at your inbox; click the link
4. Verify the redirect lands on `https://plan.pylefinancialservices.com/`, not the Vercel URL

If the redirect goes to `pyle-planning.vercel.app`, the Site URL in Supabase is stale — recheck Step 1.4 and force a fresh sign-in.

---

## Part 2 — Resend (Branded Email)

**Goal:** outgoing transactional emails come from `notify@pylefinancialservices.com` (or whatever address you choose) with proper SPF / DKIM / DMARC alignment so they land in inboxes, not spam.

### Step 2.1 — Create Resend account + add domain

1. Sign up at [resend.com](https://resend.com) (free tier covers 3,000 emails/month — plenty for HNW practice)
2. **Domains → Add Domain** → enter `pylefinancialservices.com` (the **apex** domain, not the `plan` subdomain)
3. Resend shows 3-4 DNS records to add:
   - **MX** record (or TXT) pointing to Resend's mail server
   - **SPF** TXT record (e.g., `v=spf1 include:_spf.resend.com -all`)
   - **DKIM** TXT records (long base64 key — usually 2048-bit)
   - **DMARC** TXT record (recommended: `v=DMARC1; p=none; rua=mailto:dmarc@pylefinancialservices.com`)

### Step 2.2 — Add DNS records at GoDaddy

For each record Resend provides:

1. GoDaddy **DNS → Add**
2. Match the **Type · Host · Value** exactly as Resend shows
3. TTL: 1 hour
4. Save

Common pitfalls:
- The **Host field**: GoDaddy uses `@` for the apex; some Resend SPF records say `@` and others use the bare domain. Match exactly.
- **DKIM keys** are long — copy the full TXT value including the `p=` portion. GoDaddy may wrap at 255 chars; that's normal.
- **Don't use a wildcard SPF** (`v=spf1 +all`) — Resend will refuse to verify.

### Step 2.3 — Verify in Resend

1. Resend **Domains** page → your domain
2. Click **Verify** → wait 1-15 minutes
3. All records should show green ✓
4. If any fail, the page tells you exactly what's wrong (typically a typo in the GoDaddy record)

### Step 2.4 — Get the API key

1. Resend **API Keys → Create API Key**
2. Name: `pyle-planning-vercel`
3. Permission: **Sending access** (read-only domain access; send permissions for the verified domain)
4. Copy the key immediately — Resend only shows it once

### Step 2.5 — Set Vercel env vars

Vercel **Settings → Environment Variables**:

| Variable | Value | Notes |
|---|---|---|
| `RESEND_API_KEY` | `re_xxx...` (from Step 2.4) | Production · Preview · Development |
| `NOTIFY_FROM` | `Pyle Planning <notify@pylefinancialservices.com>` | The full RFC 5322 "From" header |
| `NOTIFY_TEAM` | `Admin@pfs4u.com,scott@pfs4u.com` | Comma-separated team CCs |
| `APP_URL` | `https://plan.pylefinancialservices.com` | Already set in Part 1; verify |

Apply to **all environments** (Production, Preview, Development).

### Step 2.6 — Redeploy

1. Vercel → Deployments → most recent → ⋯ → **Redeploy**
2. Wait ~60 seconds

### Step 2.7 — Smoke test

The platform fires `notify('plan_saved', planId)` when a plan is saved. To test:

1. Open `https://plan.pylefinancialservices.com/`
2. Sign in
3. Save any plan
4. Check `Admin@pfs4u.com` and `scott@pfs4u.com` inboxes — should see "Plan saved" notification
5. Check Resend dashboard → **Logs** → see the delivery + open events

If emails don't arrive:
- **Resend Logs** shows the actual delivery status. Common: client email landed in Gmail spam (whitelist `notify@pylefinancialservices.com` once).
- **Vercel Function Logs** (Vercel → Project → Logs) — search for `notify`. If you see `RESEND_API_KEY missing`, the env var isn't set in the right environment.
- **Supabase RLS**: `/api/notify` reads the plan's `client_email` via service-role; if the plan record doesn't have a `client_email`, only NOTIFY_TEAM will be CC'd.

### Step 2.8 — Update Supabase magic-link template (optional but recommended)

Supabase by default sends magic links from `noreply@mail.app.supabase.io` — generic and may land in spam. To brand them:

1. Supabase **Authentication → Email Templates → Magic Link**
2. **From email** field — set to your verified Resend address (`notify@pylefinancialservices.com`)
3. **Subject** — e.g., "Your Pyle Planning sign-in link"
4. **Body** — use the existing branded template at `samples/branded magic-link.html` if you have one (the project ships with a sample). Replace `{{ .ConfirmationURL }}` placeholder.
5. Save

You'll need to also configure Supabase's SMTP settings under **Project Settings → Auth → SMTP Settings** to use Resend as the SMTP relay:

- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: your `RESEND_API_KEY`

---

## Verification Checklist

After both parts complete:

- [ ] `https://plan.pylefinancialservices.com/` resolves with valid SSL
- [ ] Magic-link sign-in works on the new subdomain
- [ ] Vercel env vars: `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_TEAM`, `APP_URL` all set in Production
- [ ] Resend domain shows green ✓ in dashboard
- [ ] Test plan save fires email to NOTIFY_TEAM addresses
- [ ] Resend Logs shows successful delivery
- [ ] Supabase magic-link emails come from your branded `notify@` address (if Step 2.8 done)
- [ ] Old Vercel URL `pyle-planning.vercel.app` still works (kept in Supabase Redirect URLs as fallback)

## Rollback

If something breaks:

- **Subdomain doesn't resolve** → DNS still propagating. Wait up to 4 hours. If still broken at 24 hours, check the GoDaddy CNAME for typos.
- **Magic-link redirects to Vercel URL instead of subdomain** → Supabase Site URL not updated. Step 1.4.
- **Resend emails not arriving** → Check Resend Logs first. Then Vercel Function Logs. Then verify env vars in correct environment.
- **Need to roll back to Vercel URL** → no rollback needed; both URLs work in parallel. Just stop using the subdomain and update marketing materials back to the Vercel URL.

## Cost Notes

- **Custom subdomain** — free (DNS at GoDaddy you already pay for; Vercel SSL is free)
- **Resend** — free tier: 3,000 emails/month, 100/day. For an HNW practice with ~10 active clients each saving a plan once a quarter, you'll use maybe 50-100 emails/month. Free tier is fine indefinitely. Pro tier ($20/month, 50,000 emails) only matters at scale.

---

*Updated: April 2026. Re-check annually + after any Vercel / Supabase / Resend infrastructure change.*
