# Access Control Policy

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]
**Next review:** Annually

## Purpose

Define how user identities are established, what they're permitted to do,
and how access is removed when no longer needed.

## Scope

Applies to all access — by team, clients, third parties, or systems —
to client data within the Pyle Financial Services Plan Builder platform.

## User classes

| Class | Definition | Access |
|---|---|---|
| **Team** | Listed in `public.team_members` AND verified email at `@pfs4u.com` | Read/write all plans, documents, audit log. Manage clients. |
| **Client** | Verified email matching a `plans.client_email` row | Read/write own plan. Read documents marked client-visible. Cannot read audit log or other clients' data. |
| **Anonymous** | Not signed in | No access. All RLS policies fail closed. |
| **Service** | Vercel cron (`CRON_SECRET`) | `/api/plaid/sync-balances` only. Cannot read/write plans. |

## Authentication

- **Mechanism:** Supabase Auth — passwordless magic-link via verified email
- **Session TTL:** 24-hour absolute time-box + 30-minute inactivity timeout
- **Token storage:** Supabase session in localStorage; auto-refreshed; cleared on signout
- **Multi-factor:** Email-link itself is the factor; recommend pairing with
  Apple/Google passkey at OS level for advisor email account

## Authorization (RLS — defense in depth)

Every Supabase table has Row-Level Security enabled. Policies are
explicit `using (...) with check (...)` clauses. Policy summary:

| Table | Read | Write |
|---|---|---|
| `plans` | Team: all. Client: own only (matched by email). | Team: all. Client: update own only (cannot reassign). |
| `plan_reviews` | Team: all. Client: own plan's reviews only. | Team only. |
| `plan_documents` | Team: all. Client: own plan's docs marked `is_client_visible`. | Team: all. Client: own plan's docs only (cannot mark advisor-only). |
| `audit_log` | Team only. | Authenticated users insert; trigger forces actor_id from JWT (cannot forge). No update/delete. |
| `plaid_items` | Service-role only. Client side never sees access tokens. | Service-role only (Vercel function). |
| `plaid_balance_snapshots` | User: own only. | Service-role cron job. |
| `team_members` | Team only. | Service-role only (manual SQL Editor). |

**Storage bucket** `plan-documents`:
- Upload: authenticated user, path must start with a plan_id they're authorized for.
- Read: same RLS as `plan_documents` table.
- Delete: team only.

## API endpoint authorization

Every `/api/*` Vercel function requires `Authorization: Bearer <jwt>`
header. JWT is verified server-side via Supabase `/auth/v1/user` before
any privileged action. `userId` is derived from the verified token,
never trusted from request body.

Origin allowlist enforced on all endpoints: `pyle-planning.vercel.app`
+ `localhost:3000/5500/127.0.0.1:5500` (dev). Other origins rejected
with 403.

## Access provisioning

### Adding a team member

1. Verify person is a legitimate firm employee (signed offer, completed
   FINRA fingerprinting, registered with state if required).
2. Have them sign in once via magic link → record their `auth.users.id`.
3. Run in Supabase SQL Editor:
   ```sql
   insert into public.team_members (user_id, email, added_by)
   values ('<their-uuid>', '<their-email@pfs4u.com>', auth.uid());
   ```
4. Confirm via SQL: `select public.is_team()` returns `true` when run
   as that user.

### Adding a client

1. Team member creates plan with `client_email` set in the plan record.
2. Client receives magic link via the branded email template; signs in.
3. RLS allows them to see only their assigned plan.
4. Client can upload documents marked `is_client_visible = true`. Cannot
   mark advisor-only or delete.

## Access deprovisioning

### Removing a team member (employment ends)

1. **Within 1 hour** of departure: run in Supabase SQL Editor:
   ```sql
   delete from public.team_members where user_id = '<their-uuid>';
   ```
2. The user can no longer access any plan (RLS fails since `is_team()`
   returns false). Their existing JWT continues to work for other auth
   purposes but no plan data is visible.
3. **Within 24 hours**: revoke their email account (so they can't
   request a new magic link).
4. Document in audit log that access was revoked: append a manual
   row to `audit_log` with action `team.deprovisioned`.

### Removing a client (engagement ends)

1. Client's data (plan + documents) is retained per the data-retention
   policy (7 years, Rule 204-2).
2. Their access remains as long as they can sign in to the email
   address listed in `plans.client_email`.
3. To force-revoke: change `plans.client_email` to a placeholder or
   set `client_email = null`. Their JWT will still validate, but RLS
   will not match any plan, so they see nothing.

## Periodic access review

Every 90 days, run:

```sql
-- Active team members
select user_id, email, added_at from public.team_members order by added_at;

-- Active client emails on plans
select distinct client_email, count(*) as plans
from public.plans
where client_email is not null
group by client_email
order by plans desc;
```

Document the review in your compliance binder. Flag any unexpected
entries. Verify all team-member emails still match active employees.

## Failed-access logging

Every API rejection (401/403) is logged in Vercel function logs.
Sentry captures any unhandled errors. Both retain ≥30 days of history
suitable for incident-response forensics.

---

*This policy applies to all systems holding Confidential data.
For data classification, see `05-data-retention-policy.md`.*
