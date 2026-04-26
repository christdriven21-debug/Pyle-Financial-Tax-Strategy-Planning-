# Incident Response Plan

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]
**Next review:** Annually + after any incident

## Purpose

Ensure rapid, structured response to security events, data breaches,
or service disruptions affecting client data.

## Definitions

| Severity | Examples | Response time |
|---|---|---|
| **P0 — Critical** | Confirmed data breach exposing client PII; ransomware; total system down | < 1 hour |
| **P1 — High** | Suspicious unauthorized access; regulator notice; loss of multiple clients' files | < 4 hours |
| **P2 — Medium** | Single-client data integrity issue; degraded service for >2 hours | < 24 hours |
| **P3 — Low** | Minor bug; brief degradation; phishing attempt against firm email | < 5 business days |

## Detection sources

1. **Sentry alerts** — error rate spike, new error type
2. **Status page** (`/status.html`) — service goes red
3. **Audit log** — unexpected `team` actor_role on a plan you didn't touch
4. **Client report** — "I'm seeing someone else's data"
5. **Vendor notification** — Anthropic / Plaid / Vercel / Supabase service incident
6. **Regulator inquiry** — SEC, FINRA, state regulator

## Response playbook

### Phase 1 — Triage (first 30 minutes)

1. **Confirm the incident is real.** Reproduce or verify with logs.
2. **Classify severity** using the table above.
3. **Open an incident log** — one running document per incident with
   timestamp, observation, actions taken. Use a Note in iCloud / Google
   Docs / dedicated channel.
4. **Notify stakeholders** based on severity:
   - P0: Notify cyber-liability insurer immediately (most policies
     require notice within 24-48 hours of awareness for coverage)
   - P0/P1: Notify legal counsel
   - P0/P1: Begin client notification draft (do not send yet)

### Phase 2 — Contain (next 1-4 hours)

#### Suspected unauthorized access

1. Sign in to Supabase → Authentication → Sessions → revoke all sessions
2. Run SQL: `delete from public.team_members where user_id = '<suspected>';`
3. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Project Settings → Env Vars)
4. Rotate `ANTHROPIC_API_KEY`, `PLAID_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`
5. Force-redeploy the Vercel project so new keys take effect
6. Audit `audit_log` for the past 30 days for the suspected actor:
   ```sql
   select * from public.audit_log
   where actor_id = '<suspected-user-id>'
   order by occurred_at desc;
   ```
7. Cross-reference against legitimate work that day

#### Service degradation

1. Check Vercel deployments — roll back to last known-good (1-click)
2. Check Supabase status page (`status.supabase.com`)
3. If Supabase down: app remains read-only; clients see auth errors
4. If Vercel down: Plan Builder unreachable; clients see browser error
5. Update `/status.html` banner manually if needed

#### Data integrity issue

1. Use Supabase Point-in-Time Recovery to roll back the affected
   table to a moment before the corruption
2. Restore via Supabase Dashboard → Database → Backups → Restore PITR
3. Verify integrity of restored data; spot-check vs. recent backups

### Phase 3 — Eradicate & Recover (4-72 hours)

1. Identify root cause — was it a code bug, credential leak, social
   engineering, or vendor incident?
2. Patch the root cause — code fix, key rotation, vendor escalation
3. Validate fix in a non-prod context if possible
4. Deploy fix
5. Monitor closely for 24-48 hours
6. Restore service to nominal operation

### Phase 4 — Notify (within regulatory windows)

#### SEC Reg S-P breach notification

If confirmed unauthorized access to nonpublic personal information of
≥1 client, the SEC's amended Reg S-P (effective Dec 3, 2024) requires
notification to affected individuals "as soon as practicable, but not
later than 30 days after becoming aware that unauthorized access or
use of customer information has occurred or is reasonably likely to
have occurred."

Notification must include:
- Description of the incident
- Type of NPI involved
- Approximate date of incident
- Whether notification was delayed by law enforcement
- How affected individuals can contact the firm
- Steps the firm has taken to protect against further unauthorized access

#### State breach notification

Most states require notification within 30-60 days. Check the
client's state-of-residence law. Coalition / Embroker (your cyber
insurer) typically provides this advice as part of incident response.

#### Cyber insurance claim

File within 24-48 hours of confirmed P0/P1 to preserve coverage.

### Phase 5 — Post-incident review (within 2 weeks)

1. Write a short post-mortem: what happened, why, what we changed
2. Update this document with anything learned
3. Update the control matrix (`01-control-matrix.md`) if a control
   needs to be added or strengthened
4. File the post-mortem in the compliance binder

## Key contacts (fill in)

| Role | Name | Phone | Email |
|---|---|---|---|
| Advisor / CCO | [ADVISOR] | | |
| RIA-tech attorney | | | |
| Cyber insurance broker | | | |
| Cyber insurance claims line | | | |
| SEC tip line (if regulator-relevant) | | (202) 551-4790 | sec.gov/tips |
| FINRA Whistleblower (if BD-related) | | (240) 386-4357 | |
| Local FBI cyber field office | | | |

## Vendor escalation contacts

| Vendor | Support | Status page | SOC 2 contact |
|---|---|---|---|
| Vercel | support@vercel.com | vercel.com/status | trust.vercel.com |
| Supabase | support@supabase.com | status.supabase.com | trust.supabase.com |
| Anthropic | support@anthropic.com | status.anthropic.com | trust.anthropic.com |
| Plaid | support@plaid.com | status.plaid.com | plaid.com/legal/#privacy |
| Sentry | support@sentry.io | status.sentry.io | sentry.io/security |
| Resend | support@resend.com | status.resend.com | resend.com/legal |

## Testing this plan

Run a tabletop exercise quarterly. Pick one scenario from the playbook
above; walk through the response without actually invoking changes.
Document the time-to-resolve and any gaps surfaced.

Last drill: [DATE]
Next drill: [DATE + 90 days]
