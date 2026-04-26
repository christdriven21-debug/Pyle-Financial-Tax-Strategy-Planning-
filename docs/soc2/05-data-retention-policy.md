# Data Retention & Disposal Policy

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]
**Regulatory basis:** SEC Rule 204-2 (Books and Records of Investment
Advisers), SEC Reg S-P (Privacy of Consumer Financial Information),
state-level breach notification statutes.

## Data classification

| Class | Examples | Retention |
|---|---|---|
| **Confidential** | Client name, plan data, financial statements, tax docs, trust documents, audit log | 7 years from end of engagement (Rule 204-2) |
| **Restricted** | Plaid access tokens, Schwab refresh tokens, API keys | Active engagement only; rotate on team-member departure |
| **Internal** | Audit log entries, advisor notes, AI Q&A conversation history | 7 years |
| **Public** | Marketing site content, public sample plans, this documentation | Indefinite |

## Storage locations

| Data | Where | Encrypted at rest | Backed up |
|---|---|---|---|
| Plans (`plans` table) | Supabase PostgreSQL | Yes (AES-256, AWS KMS) | PITR 7 days + daily snapshots |
| Documents (`plan_documents` + `plan-documents` bucket) | Supabase Storage | Yes | PITR + daily snapshots |
| Audit log (`audit_log`) | Supabase PostgreSQL | Yes | PITR + daily snapshots |
| Plaid tokens (`plaid_items`) | Supabase PostgreSQL — service-role only | Yes | PITR (excludes service-role tables from automated client backups) |
| Sentry events | Sentry SaaS | Yes | Sentry's retention (90 days default) |
| Email logs | Resend SaaS | Yes | Resend's retention (30 days default for delivery logs) |
| Source code | GitHub | Yes (LFS) | GitHub's redundancy |

## Retention periods

### Active engagement
All data retained while the client engagement is active.

### Engagement termination

- **Day 0**: Client offboarded. Mark plan as `archived` (set boolean
  flag — not yet implemented; manual flag in plan name for now).
- **Day 0**: Revoke client's access by setting `plans.client_email = null`.
- **Day 0**: Document the offboarding in the audit log.

### Mandatory retention period (years 1-7)

- Plans, documents, audit log → retained, read-only.
- Continue paying Supabase Pro to maintain backups.

### Disposal (year 7 + 1 day)

After 7 years from engagement end:

1. Run in Supabase SQL Editor:
   ```sql
   -- Identify candidate plans (replace cutoff date)
   select id, name, client_email, updated_at
   from public.plans
   where updated_at < (now() - interval '7 years')
     and client_email is null  -- already offboarded
   order by updated_at;
   ```
2. Manual review by [ADVISOR] confirms each can be deleted (not
   subject to active SEC inquiry, litigation hold, etc.).
3. Permanent delete:
   ```sql
   -- This cascades through plan_documents (FK on delete cascade)
   delete from public.plans where id = '<plan-uuid>';
   -- Also delete files from storage bucket
   delete from storage.objects
   where bucket_id = 'plan-documents'
     and name like '<plan-uuid>/%';
   ```
4. Document the disposal in a separate file/log (the audit log row
   itself is also deleted with the plan via the trigger).
5. Wait 7 days for PITR window to expire; data is then unrecoverable.

## Special holds

### Litigation hold

If notified of pending or threatened litigation involving a client's
data, **freeze the disposal process immediately** for that client.
Document the hold notice and effective date. Do not delete any data
related to the matter, even past the 7-year window, until the hold
is lifted in writing by counsel.

### Regulator hold

If contacted by SEC, FINRA, state regulator, or law enforcement,
preserve all records related to the inquiry indefinitely until
explicitly released.

## Client data access requests (Reg S-P)

Clients have the right to request:
- A copy of their plan and documents
- Correction of inaccurate data
- A list of third parties to whom their data has been disclosed

### Response procedure

1. Verify identity of requester (sign-in to magic link + voice/video
   if remote)
2. Within 30 days: provide an export of:
   - Their plan JSON (Download JSON button on Plan Builder)
   - Their uploaded documents (zip from `plan-documents/<plan-id>/`)
   - Any audit log entries with `actor_email` matching them
   - List of vendors from `04-vendor-management-policy.md`
3. Document the request + response in the compliance binder

## Backup retention

Supabase backups (PITR + daily snapshots) follow Supabase's retention.
On the Pro plan: 7-day PITR + 30-day daily snapshots. Beyond that,
Supabase deletes their backup copies. We rely on this for the disposal
guarantee in the 7-year window — once we delete from production, the
PITR window expires and the data is gone from our infrastructure.

For data that needs deletion before the 7-year window (e.g.,
GDPR-style request from a non-US client), contact Supabase support
to request immediate purge of backups.

---

*This policy is reviewed annually. Material changes require
documentation in the compliance binder + updated date above.*
