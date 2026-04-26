# Evidence Collection Checklist

Items to gather before SOC 2 audit kickoff. Most can be exported from
vendor dashboards in screenshots or PDFs. The readiness vendor
(Vanta/Drata/SecureFrame) typically automates ~80% of this.

## Before kickoff

### Firm-level documentation
- [ ] Form ADV (Parts 1A, 2A, 2B) — current
- [ ] State RIA registration certificate
- [ ] Firm Code of Ethics
- [ ] Compliance manual / written supervisory procedures
- [ ] Cyber liability insurance policy + declarations page
- [ ] Privacy policy (formal Reg S-P-aligned, posted on firm website)
- [ ] Terms of service for the Plan Builder
- [ ] Master Services Agreement template (if applicable)
- [ ] Data Processing Agreement template

### Personnel
- [ ] Org chart (even single-advisor — show roles)
- [ ] Background-check policy + records
- [ ] Confidentiality / NDA agreements signed by all personnel
- [ ] Acceptable Use Policy signed by all personnel
- [ ] Annual security awareness training records

### Vendor SOC 2 reports (under NDA)
- [ ] Vercel — most recent SOC 2 Type II
- [ ] Supabase — most recent SOC 2 Type II
- [ ] Anthropic — most recent SOC 2 Type II
- [ ] Plaid — most recent SOC 2 Type II
- [ ] Sentry — most recent SOC 2 Type II
- [ ] Resend — most recent SOC 2 Type II
- [ ] Schwab — internal SOX 404 certification (if asked)

### System screenshots / configs
- [ ] Vercel: Settings → Environment Variables (names only, redact values)
- [ ] Vercel: Settings → Domains (showing custom domain or vercel.app)
- [ ] Vercel: Settings → Security → password protection settings
- [ ] Supabase: Authentication → Providers (showing magic-link enabled)
- [ ] Supabase: Authentication → URL Configuration
- [ ] Supabase: Database → Backups (PITR enabled, retention)
- [ ] Supabase: Settings → API (showing key naming + rotation)
- [ ] Supabase: SQL → run `select * from public.team_members` (proves explicit allowlist)
- [ ] GitHub: branch protection settings on `main`
- [ ] Sentry: Settings → Security & Privacy → data scrubbing rules
- [ ] Resend: Domains page showing verified status (when set up)
- [ ] Plaid: Dashboard → Production status

### Code-level evidence
- [ ] `supabase/add_auth.sql` — RLS on plans table
- [ ] `supabase/add_documents.sql` — RLS on documents
- [ ] `supabase/add_audit_log.sql` — append-only audit
- [ ] `supabase/security_hardening.sql` + `_2.sql` — actor identity enforcement
- [ ] `api/_lib/auth.js` — JWT verification logic
- [ ] `vercel.json` — CSP + HSTS + headers
- [ ] `index.html` — SRI hashes on CDN scripts (lines 7-30)
- [ ] `index.html` — DOMPurify sanitization wrappers
- [ ] Git log showing change history with author + timestamps

### Operational evidence
- [ ] Sample audit_log entries showing real plan changes captured
  ```sql
  select occurred_at, actor_email, action, plan_id
  from public.audit_log
  order by occurred_at desc
  limit 50;
  ```
- [ ] Sentry dashboard screenshot showing event capture working
- [ ] `/status.html` screenshot showing all-systems-green
- [ ] Vercel deployment log showing recent successful deploys

### Policies (this package)
- [ ] `00-README.md` — package overview
- [ ] `01-control-matrix.md` — TSC mapping
- [ ] `02-access-control-policy.md`
- [ ] `03-incident-response-plan.md`
- [ ] `04-vendor-management-policy.md`
- [ ] `05-data-retention-policy.md`
- [ ] `06-business-continuity-plan.md`
- [ ] `07-change-management-policy.md`
- [ ] `08-employee-onboarding-offboarding.md` (TBD)
- [ ] `09-system-description.md`
- [ ] `10-evidence-checklist.md` (this file)

### Drill / testing logs
- [ ] Most recent quarterly DR drill log (date + scenario + result)
- [ ] Most recent annual restore-from-PITR drill log
- [ ] Tabletop incident response drill log
- [ ] Periodic access review log (quarterly)

### Insurance & legal
- [ ] Cyber liability declarations page
- [ ] E&O / professional liability declarations
- [ ] Most recent state RIA registration renewal
- [ ] Any subpoenas, regulatory inquiries, breach notifications served
  in the audit period (or affirmation that none occurred)

## During audit

The auditor will request samples — typically:
- 5-10 random audit log entries to verify accuracy
- Screenshots of recent backup restorations
- Walkthrough of access provisioning + deprovisioning
- Walkthrough of incident response (tabletop with auditor)
- Code review of select files (auth, RLS policies, audit triggers)

## Gaps as of [DATE]

Items NOT yet ready that need attention before audit kickoff:

1. **Formal Privacy Policy** — engage RIA-tech attorney; ~2 weeks
2. **Cyber liability policy** — confirm in force; obtain dec page
3. **Annual security awareness training** — for solo practice, document
   self-completion; if team grows, formal training program
4. **Quarterly DR drill log** — start running drills; document them
5. **Vendor SOC 2 reports** — request and file under NDA from all 6 vendors

## After audit

- File the auditor's Type I report in the compliance binder
- Share with prospects under NDA per their request
- Begin Type II monitoring period (typically 6+ months) — auditor
  revisits to verify controls operated as designed

---

*Updated: [DATE]. Re-check checklist annually before each Type II
audit cycle.*
