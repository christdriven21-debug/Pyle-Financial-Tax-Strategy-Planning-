# Phase A — Activation Checklist

Work through top to bottom. Steps 1–7 get the committed fixes safely live;
8–11 close the last critical security gap; 12–13 are decisions that unblock the
next round. If step 3 or step 6 doesn't behave as described, **stop** and report
the result before continuing.

Branch: `phase-a-critical-fixes` · Full context: `PHASE-A-HANDOFF.md`

---

## A. Review & activate the backend (before deploying)

- [ ] **1. Review the branch.** Check out `phase-a-critical-fixes` and skim the
  diff: `git log main..phase-a-critical-fixes` and `git diff main`. Nothing is
  live yet.

- [ ] **2. Run the first SQL file.** Supabase → **SQL Editor** → paste all of
  `supabase/add_rate_limits.sql` → **Run**. (Creates the rate-limit table +
  function; no output expected.)

- [ ] **3. Run the second SQL file + verify.** SQL Editor → paste all of
  `supabase/security_hardening.sql` → **Run**. Then run:
  ```sql
  select policyname from pg_policies
  where schemaname='public' and tablename='plans' and policyname like 'anon_%';
  ```
  **Must return ZERO rows.** If it returns any, the plans table is still
  exposed — stop and report.

- [ ] **4. Set the Vercel env var.** Vercel → project → **Settings →
  Environment Variables** → add `SUPABASE_SERVICE_ROLE_KEY` (from Supabase →
  Settings → API → `service_role` key). Optional: `TEAM_EMAIL_DOMAIN=pfs4u.com`.
  Do **not** redeploy yet.

## B. Test in a browser (before deploying)

- [ ] **5. Run automated tests** (needs Node ≥ 20): `npm test` → all passing.

- [ ] **6. Manually test the risky fixes.** Deploy the branch to a Vercel
  **preview** (or run locally), sign in, and verify:
  - [ ] **6a. Contamination (most important):** load client A, then client B →
    none of A's numbers appear in B.
  - [ ] **6b. Field round-trip:** save a plan using a Phase 2/3/4 strategy
    (e.g. Captive or SCIN), reload → that strategy's parameters survived.
  - [ ] **6c. Dynamic rows:** family members, goals, and balance sheet survive
    a save → reload.
  - [ ] **6d. Clone:** clone for next year → estate exemption ≈ $15.37M (not
    $0), ages advanced by 1.
  - [ ] **6e. Solver:** run auto-solver, "Apply This Stack" with a
    Captive/Oil & Gas strategy → generated plan actually includes it.

## C. Deploy

- [ ] **7. Merge & deploy.** If 6a–6e pass, merge `phase-a-critical-fixes` into
  the production branch → Vercel deploys. Rate limiter + RLS re-lock now live.

## D. Finish the security lockdown (F6 — do soon)

- [ ] **8. Find team UUIDs.** Supabase SQL Editor:
  ```sql
  select id, email from auth.users where email ilike '%@pfs4u.com' order by created_at;
  ```

- [ ] **9. Seed the team allowlist.** Using those UUIDs, run the
  `insert into public.team_members ...` template in
  `supabase/security_hardening_2.sql`.

- [ ] **10. Disable open signup.** Supabase → **Authentication → Settings** →
  turn **off** "Allow new users to sign up."

- [ ] **11. Drop the domain fallback.** ONLY after 9 and 10: run the
  commented-out final block at the bottom of
  `supabase/security_hardening_2.sql`. Then confirm the team can still sign in.

## E. Decisions that unblock the next round

- [ ] **12. Tax-law sign-off.** Have tax counsel confirm the 2026 estate
  exemption / OBBBA figures so the single year-keyed `TAX_CONSTANTS` table is
  built correctly.

- [ ] **13. Choose the F5 approach** (client can currently read the whole
  advisor blob): (a) split advisor-only fields into a separate table, or
  (b) a redacted client read view. Pick one and it gets implemented.
