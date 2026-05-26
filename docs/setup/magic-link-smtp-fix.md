# Fix: Magic-Link Rate Limit (Supabase → Resend SMTP)

**The problem you're hitting:** Supabase's built-in email service is rate-limited to ~4 magic-link sends per hour, per project. When the team tries to sign in and one of you triggers a few extra attempts, subsequent sign-in emails get silently dropped — the front-end shows "check your email" but Supabase never actually sends.

**The fix:** point Supabase at Resend as a custom SMTP relay. Resend's free tier allows 3,000 emails/month (100/day) — well beyond anything you'll hit — and gives you delivery telemetry. Total time: ~20 minutes, no code changes.

This is the **minimum-path runbook** to fix just the rate limit. If you want branded transactional emails (plan-saved notifications, etc.) or the custom subdomain `plan.pylefinancialservices.com`, see the longer doc at [`docs/setup/resend-and-subdomain.md`](./resend-and-subdomain.md) — but those are not required to fix the magic-link problem.

---

## Prerequisites

- Owner/admin access to the Supabase project (`ecrgcajxolritivqixkg`)
- Owner/admin access to the `pfs4u.com` DNS records (GoDaddy)
- A free Resend account (sign up at [resend.com](https://resend.com) — takes 60 seconds)

---

## Step 1 — Verify your sending domain at Resend (~5 min + DNS wait)

You're going to send magic links from an address like `auth@pfs4u.com`. Resend needs to prove it owns the domain via DNS records.

1. Sign in at [resend.com/domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter **`pfs4u.com`** (the apex domain, not a subdomain)
4. Choose a region close to your users — **us-east-1** is fine
5. Resend shows 3 DNS records to add. They'll look like this (your exact values will differ):

   | Type | Host / Name | Value |
   |---|---|---|
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSq...` (long DKIM key) |

   **Don't close this tab** — you'll come back to click "Verify".

## Step 2 — Add the DNS records at GoDaddy (~5 min)

1. Sign in at [godaddy.com](https://godaddy.com) → **My Products → Domains**
2. Find **pfs4u.com** → click **DNS**
3. For each row Resend showed, click **Add New Record**:
   - **Type** — match Resend (MX, TXT, etc.)
   - **Host / Name** — paste exactly what Resend shows. GoDaddy uses `@` for the apex; for `send` and `resend._domainkey`, just type those values
   - **Value** — paste the value Resend provides, exactly
   - **TTL** — leave at 1 hour
   - **Priority** (only for the MX) — set to 10
4. Save each record

**Gotchas:**
- The DKIM TXT value is long (~400 characters). GoDaddy may visually wrap it after 255 chars — that's a display thing, paste the full value
- Don't add a wildcard SPF record — Resend will refuse to verify
- If you already have an SPF record for `pfs4u.com`, **merge** the includes rather than adding a second one (two SPF records = broken SPF)

## Step 3 — Verify in Resend (~1–15 min)

1. Back in the Resend Domains tab → click **Verify** next to `pfs4u.com`
2. All three records should turn green ✓ within a minute
3. If any stay red after 15 minutes:
   - Click the red row — Resend tells you exactly what's wrong (usually a typo)
   - DNS occasionally takes longer — wait up to 4 hours before debugging
   - Run `dig TXT resend._domainkey.pfs4u.com` from your terminal to see what's actually resolving

## Step 4 — Create a Resend API key (~30 sec)

1. Resend → **API Keys** (left sidebar) → **Create API Key**
2. Name: `supabase-magic-link`
3. Permission: **Sending access**
4. Domain restriction: **`pfs4u.com` only**
5. **Copy the key immediately** — it starts with `re_` and Resend only shows it once. Paste it into a password manager.

## Step 5 — Configure Supabase to use Resend SMTP (~3 min)

1. Open [supabase.com/dashboard/project/ecrgcajxolritivqixkg](https://supabase.com/dashboard/project/ecrgcajxolritivqixkg)
2. Left sidebar → **Project Settings** (gear icon) → **Authentication** → scroll to **SMTP Settings**
3. Toggle **Enable Custom SMTP** ON
4. Fill in:

   | Field | Value |
   |---|---|
   | **Sender email** | `auth@pfs4u.com` |
   | **Sender name** | `Pyle Financial Services` |
   | **Host** | `smtp.resend.com` |
   | **Port number** | `587` |
   | **Username** | `resend` |
   | **Password** | the `re_...` API key from Step 4 |
   | **Minimum interval between emails** | `60` (seconds — prevents accidental floods) |

5. Click **Save**

## Step 6 — (Optional but recommended) Brand the magic-link email template

1. Still in Supabase → **Authentication** → **Email Templates** → **Magic Link**
2. **Subject:** `Your Pyle Financial sign-in link`
3. **Message body:** the default works fine, or customize the HTML. The placeholder `{{ .ConfirmationURL }}` must remain — that's where the actual link gets injected.
4. Save

## Step 7 — Smoke test (~2 min)

1. Open an incognito/private browser window
2. Go to `https://pyle-planning.vercel.app/qir/`
3. Enter a team email (e.g. `scott@pfs4u.com`)
4. Click **Send magic link**
5. Check inbox — link should arrive in 5–30 seconds, from `auth@pfs4u.com`
6. Click the link — you should land back on the QIR builder, signed in

**Verify in Resend:**
- [resend.com/emails](https://resend.com/emails) → you should see the magic-link email with status "Delivered"

## Step 8 — Have one teammate hit it twice (~30 sec)

The whole point of this fix is the rate limit. Confirm it's gone:

1. Sign out
2. Send yourself a magic link
3. Sign out again, immediately send another
4. Repeat 3–4 more times in a 5-minute window

All emails should arrive. Previously this would have triggered the "email rate limit exceeded" error.

---

## Verification Checklist

After completing the steps:

- [ ] `pfs4u.com` shows green ✓ on Resend Domains page
- [ ] Resend API key created with name `supabase-magic-link`, restricted to `pfs4u.com`
- [ ] Supabase **SMTP Settings** show custom SMTP enabled, host `smtp.resend.com`, sender `auth@pfs4u.com`
- [ ] Magic-link email arrives within 30 seconds in an incognito test
- [ ] The link signs you in successfully (no auth redirect errors)
- [ ] Sending 5 magic links in a 5-minute window — all arrive
- [ ] Resend dashboard **Emails** tab shows the deliveries

---

## Troubleshooting

**"Sender address not allowed" error in Supabase logs**
The sender address (`auth@pfs4u.com`) doesn't match a verified domain in Resend. Check Step 1/3 — `pfs4u.com` must show green ✓ before Resend will accept mail from any `@pfs4u.com` address.

**Emails arrive but land in spam**
- Add a **DMARC** TXT record at GoDaddy: host `_dmarc`, value `v=DMARC1; p=none; rua=mailto:dmarc@pfs4u.com`. This is in the longer doc — improves deliverability significantly.
- Have each team member click "Not spam" once on the first magic-link email — Gmail learns fast.

**"SMTP authentication failed" in Supabase**
- Username must be the literal string **`resend`** (not your email)
- Password must be the full API key starting with `re_`
- Re-copy from Resend if in doubt; the key is shown once but can be revoked + recreated freely

**Magic link goes to the wrong URL after click**
Supabase's "Site URL" in **Authentication → URL Configuration** controls the redirect. Should be `https://pyle-planning.vercel.app` (current) or `https://plan.pylefinancialservices.com` if you also did the custom subdomain setup.

**One teammate gets the email, another doesn't**
Almost always a corporate spam filter. Check the recipient's email admin — `auth@pfs4u.com` should be on the allowlist for your firm's domain (Microsoft 365 / Google Workspace admin panel).

**You hit the Resend free tier**
3,000 emails/month is a lot. If you're somehow approaching it, the Pro tier is $20/month for 50,000. Realistically you'd need ~100 team sign-ins per day to come close.

---

## Rollback

If anything breaks badly:

1. Supabase → **Authentication → SMTP Settings** → toggle **Enable Custom SMTP** OFF
2. You're back to Supabase's default SMTP (and the rate limit), but the system works

No code changes were made, so no Git rollback needed. Resend domain verification can stay in place — it doesn't cost anything and is needed for the longer setup later.

---

## What's next (optional, separate work)

After this is working, the next infrastructure tasks worth doing — in order — are in [`docs/setup/resend-and-subdomain.md`](./resend-and-subdomain.md):

1. **Custom subdomain** `plan.pylefinancialservices.com` (~30 min, mostly DNS wait)
2. **Branded transactional emails** for plan-saved notifications (~15 min after Resend is set up)

Neither is required for the magic-link fix above — they're polish.

---

*Last updated: May 2026. Re-verify annually + any time Supabase or Resend changes auth/SMTP UI.*
