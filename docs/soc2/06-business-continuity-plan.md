# Business Continuity & Disaster Recovery Plan

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]
**Last drill:** [DATE]
**Next drill:** [DATE + 90 days]

## Purpose

Define how Pyle Financial Services restores operations if a critical
system fails or data is corrupted. Aligns with SOC 2 A1.2 / A1.3 and
SEC business-continuity guidance for RIAs.

## Recovery objectives

| Metric | Target |
|---|---|
| **Recovery Time Objective (RTO)** | 4 hours for read-only access; 24 hours for full read/write |
| **Recovery Point Objective (RPO)** | 1 hour (PITR granularity on Supabase Pro) |
| **Maximum tolerable downtime** | 24 hours before client communication required |

## Failure scenarios

### Scenario 1: Vercel deploy breaks production

**Detection:** `/status.html` shows red; user reports of errors; Sentry
spike.

**Recovery:**
1. Vercel Dashboard → Deployments → find last "Ready" deployment
   before the bad one
2. Click ⋯ → Promote to Production
3. Verify on `/status.html`
4. RTO: <5 minutes

### Scenario 2: Supabase database corruption

**Detection:** Plans loading with wrong data; null values where data
should exist; foreign-key violations.

**Recovery:**
1. Supabase Dashboard → Database → Backups → Point-in-Time Recovery
2. Choose timestamp before the corruption (max 7 days back)
3. Restore — Supabase creates a new project from the snapshot; you
   point Vercel at the new project ID via env vars
4. Verify data integrity by spot-checking known plans
5. RTO: 1-4 hours
6. RPO: ≤1 hour (PITR granularity)

### Scenario 3: Supabase project deleted

**Detection:** Total app outage; Supabase dashboard shows project
not found.

**Recovery:**
1. Contact Supabase support immediately
2. Pro-plan customers can request restore from offsite backups within
   7 days (per Supabase SLA)
3. If unrecoverable: rebuild from local SQL migrations (`supabase/*.sql`)
   + manually restore plans from advisor's local exports (Download JSON
   button — encourage advisor to do this monthly per active client)
4. RTO: 24 hours best-case; 1-3 days worst-case
5. RPO: depends on most recent advisor export

### Scenario 4: Vercel account compromised

**Detection:** Unauthorized deploys; rotated env vars; status page
shows our project deploying from someone else's repo.

**Recovery:**
1. Lock Vercel account immediately (change password + 2FA)
2. Force re-auth all team members
3. Audit deployments — roll back to last known-good
4. Rotate every env var (Supabase keys, Anthropic, Plaid, Resend,
   Sentry, GitHub)
5. Trigger fresh deploy
6. RTO: 4-8 hours

### Scenario 5: GitHub repo deleted/compromised

**Detection:** Cannot pull source; unauthorized commits; repo not
found.

**Recovery:**
1. Local working copy on advisor's Mac is the canonical backup
2. Push the local copy to a new GitHub repo
3. Update Vercel project's git source to the new repo
4. Trigger fresh deploy
5. RTO: 1-4 hours
6. RPO: depends on advisor's local copy freshness — keep `git pull`
   weekly

### Scenario 6: Anthropic / Plaid / Resend / Sentry outage

**Detection:** That vendor's status page shows incident; Sentry shows
endpoint failures.

**Recovery:**
1. Plan Builder remains functional for all non-AI / non-aggregation
   features
2. Status banner on `/status.html` automatically reflects degraded state
3. AI Plan Assistant returns 503 → users see helpful error
4. Wait for vendor recovery (typically <2 hours for tier-1 vendors)
5. Document in incident log
6. RTO: vendor-dependent

## Backup strategy

### Production data

- **Supabase PITR**: 7-day window, 1-hour granularity
- **Supabase daily snapshots**: 30-day retention
- **No third backup tier currently** — gap to address (see
  `10-evidence-checklist.md`)

### Code

- **GitHub** is the canonical source
- **Advisor's local Mac** is the working copy + last-resort backup
- **Vercel deployments** retain build artifacts indefinitely (can
  be promoted as restore mechanism)

### Configuration

- **Vercel env vars** are stored in Vercel UI only — no version control
  copy (intentional — they're secrets)
- **Document locations of all env-var values** in a password manager
  entry: API keys, dashboard URLs, vendor account emails
- **Annually**: export Vercel env-var inventory (names only, no values)
  to a markdown file in this repo for reference

## Testing schedule

### Quarterly (every 90 days)

Run a tabletop drill covering one of the scenarios above. Walk through
the response without actually invoking changes. Time how long each
step would take. Update this plan if any step took longer than the RTO.

### Annually

Run a full restore-from-PITR drill in a non-production Supabase project:
1. Create a temporary Supabase project (free tier OK)
2. Restore last week's PITR snapshot to that project
3. Verify the restore succeeded — count rows, check a known plan
4. Delete the temporary project
5. Document in this file

## Communication during incidents

### Internal

- All incident comms via [PRIMARY-CHANNEL] (advisor's preferred)
- Incident log per `03-incident-response-plan.md`

### Clients

If degradation lasts >2 hours:
- Email NOTIFY_TEAM with status (when Resend is configured)
- Update `/status.html` banner manually if needed

If a client tries to sign in during an outage, the magic-link email
will still send (Supabase Auth has separate availability from
plans/documents); they'll see auth success but plan loading will fail
gracefully.

### Regulators

If incident causes >24 hours unavailability, document for next Form
ADV update (Item 12: Brokerage Practices may not apply, but Item 14:
Client Referrals & Other Compensation could mention if any business
practice was affected).

## Plan maintenance

- Review and update this plan annually
- After every actual incident (P0/P1), update relevant scenarios
- After every quarterly drill, log the date below

## Drill log

| Date | Scenario | Result | Issues found | RTO actual |
|---|---|---|---|---|
| | | | | |

## Recovery contact directory

| Vendor | Support | Account email |
|---|---|---|
| Vercel | support@vercel.com | [ADVISOR-EMAIL] |
| Supabase | support@supabase.com | [ADVISOR-EMAIL] |
| Anthropic | support@anthropic.com | [ADVISOR-EMAIL] |
| Plaid | support@plaid.com | [ADVISOR-EMAIL] |
| Sentry | support@sentry.io | [ADVISOR-EMAIL] |
| Resend | support@resend.com | [ADVISOR-EMAIL] |
| GoDaddy | (480) 505-8877 | [ADVISOR-EMAIL] |
| GitHub | support@github.com | [ADVISOR-EMAIL] |

---

*This BCP/DR plan satisfies AICPA SOC 2 criteria A1.2 (Backup &
Recovery), A1.3 (Recovery Testing), and SEC RIA business-continuity
expectations.*
