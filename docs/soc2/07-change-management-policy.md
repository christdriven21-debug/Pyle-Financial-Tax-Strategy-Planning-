# Change Management Policy

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]

## Purpose

Ensure all changes to the Plan Builder platform are reviewed, tested,
documented, and reversible. Aligns with SOC 2 CC8.1.

## Scope

Applies to:
- Code changes (`index.html`, `api/*`, `config.js`, `vercel.json`)
- Database schema changes (Supabase SQL migrations)
- Vercel environment variable changes
- Vendor onboarding/offboarding (per `04-vendor-management-policy.md`)

## Change classification

| Class | Examples | Review required |
|---|---|---|
| **Standard** | Bug fix, doc update, copy change, dependency version bump | Self-review by [ADVISOR] |
| **Major** | New feature, new vendor integration, change to data model, change to RLS policy | Self-review + 24-hour soak in production |
| **Emergency** | Security patch, critical bug breaking client experience | Deploy ASAP; document post-hoc |

## Standard change workflow

1. Make the change locally on the advisor's Mac (text editor)
2. Test by running a local web server pointed at `index.html` and
   loading a saved plan
3. `git add . && git commit -m "<descriptive message>"`
4. Run `Push to GitHub.command` from the Desktop
5. Vercel auto-deploys within ~60 seconds
6. Verify on https://pyle-planning.vercel.app/ — sign in, generate
   plan, exercise the changed feature
7. Check Sentry for any new errors in the 30 minutes post-deploy

## Major change workflow

Add to the standard workflow:

3a. Before commit: write a brief design note in the commit message —
    what changed, why, what could break
6a. After deploy: leave production untouched for 24 hours
6b. Monitor Sentry + Vercel logs daily during soak period
6c. If issues arise, roll back via Vercel Dashboard (one click)

## Database schema changes

All schema changes ship as SQL files in `supabase/`:
- `schema.sql` — initial schema (don't modify; create new files for changes)
- `add_*.sql` — additive migrations (new tables, columns, indexes)
- `security_hardening*.sql` — RLS policy updates

Procedure:
1. Write the migration as a new SQL file: `add_<feature>.sql`
2. Make it idempotent: use `create table if not exists`, `drop policy if exists` + `create policy`, `create or replace function`
3. Test in a Supabase scratch project first if it touches existing data
4. Run in the production SQL Editor
5. Commit the SQL file to the repo so it can be replayed if the
   project ever needs to be rebuilt
6. Update relevant docs in `docs/soc2/` if the change affects access
   control, data retention, or availability

## Environment variable changes

1. Document in the team's password manager (Vercel UI is the source
   of truth; password manager mirrors names + last-rotated dates)
2. Change in Vercel Dashboard → Settings → Environment Variables
3. Trigger a redeploy (env vars only take effect on next deploy)
4. Verify the affected feature works
5. If rotating a secret (key compromise), update in Vercel + redeploy
   + audit access logs for the prior key's usage

## Rollback procedure

### Code rollback

1. Vercel Dashboard → Deployments
2. Find the last "Ready" deployment before the bad one
3. Click ⋯ → Promote to Production
4. ~10 seconds; production reverts

### Schema rollback

Schema changes are mostly additive; rollback rare. If needed:
1. Write a counter-migration SQL: drop the new table/column/policy
2. Run in SQL Editor
3. Commit the rollback SQL alongside the original

### Env var rollback

Vercel keeps history of env-var values for 30 days. Restore via UI.

## Code review

Currently a solo practice — [ADVISOR] reviews own code. When team
grows beyond one developer, require:
- Pull request for every non-emergency change
- One reviewer approval before merge to `main`
- Branch protection on `main` (no direct pushes)
- Require status checks (if CI added)

## Audit trail

Every code change is captured in:
- Git commit history (`git log`) — author, timestamp, message, diff
- GitHub Actions / Vercel deployment log — what shipped when
- Audit log table — separately tracks data-mutation events that
  resulted from any deploy

## Testing

Currently manual. As the platform grows, plan to add:
- Unit tests on the plan computation engine (Vitest or similar)
- Snapshot tests on render functions
- E2E tests on critical user flows (Playwright)

This is on the technical-debt backlog, not blocking SOC 2.

## Annual review

Each year, [ADVISOR] reviews this policy + the past year's commit
history. Confirms:
- All changes followed the workflow
- No unreviewed direct-to-production deploys
- No env-var changes without documentation
- Rollback procedure was tested at least once via drill

Document the review date below.

## Review log

| Date | Reviewer | Findings |
|---|---|---|
| | [ADVISOR] | |
