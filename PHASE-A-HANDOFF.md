# Phase A + Quick Wins — Handoff Checklist

Branch: **`phase-a-critical-fixes`** (6 commits on top of `main`). Nothing is
deployed. This doc is everything needed to review, activate, test, and ship.

Full findings context: `FABLE5-PASS1-REPORT.md`, `FABLE5-PASS2-REPORT.md`.

---

## 1. What's on the branch

| Commit | What | Findings |
|--------|------|----------|
| docs | Fable 5 review reports + prompts | — |
| fix | clone parse+age, review XSS, RLS re-lock, AI rate limiting, advisor-mode gate | F0c, P2, F11, F4, F12, P4 |
| fix | solver map, MC Social Security, Walton GRAT, RMD age | F9, F7, F8, F16 |
| fix | cross-client contamination + 163 dropped fields | F0a, F0b |
| test | engine module + unit tests + CI | Phase B foundation |

**Verification done here:** all pure logic validated via JavaScriptCore (21 test
assertions green + targeted checks); full `index.html` re-parses clean after
every edit. No `node` and no Supabase credentials were available locally, so the
items in §3 still need a real run.

---

## 2. Activation steps (fixes are INERT until these are done)

1. **Run SQL in the Supabase SQL editor** (order-independent):
   - `supabase/add_rate_limits.sql` — creates the rate-limit table + RPC.
   - `supabase/security_hardening.sql` — now also re-drops the `anon_*` policies.
     It ends with a verification query; it should return **zero** rows.
2. **Set a Vercel environment variable:** `SUPABASE_SERVICE_ROLE_KEY`
   (Project Settings → Environment Variables). The rate limiter **fails open**
   (allows all traffic) until this exists — nothing breaks meanwhile, but you
   aren't protected until it's set. Optional: `TEAM_EMAIL_DOMAIN` (defaults to
   `pfs4u.com`) for the advisor-mode gate.
3. **Deploy** (push to the production branch → Vercel) once §3 testing passes.

---

## 3. Browser testing required BEFORE deploy

Most fixes are self-contained, but two touch shared machinery and must be
exercised in a real browser with a signed-in session:

- **Cross-client contamination fix (F0a/F0b) — highest priority to test.**
  The persistence layer was rewritten (`snapshotForm`/`hydrateForm` now use a
  DOM-discovered field registry + reset-before-hydrate). Verify:
  1. Load client A, then load client B → **none** of A's values remain in B.
  2. Save a plan, reload it → every strategy's parameters round-trip (the
     previously-dropped Phase 2/3/4 fields: oil & gas, captive, SCIN, etc.).
  3. Dynamic rows still work: family members, goals, and the balance sheet
     survive save→load (they rebuild from their backing textareas).
  4. Clone-for-next-year still produces a sane plan.
- **clonePlanForNextYear (F0c/P2):** clone a plan and confirm the estate
  exemption is ~$15.37M (not $0) and client ages advanced by one year.
- **Solver "Apply This Stack" (F9):** run the auto-solver, apply a stack that
  includes a Phase 2/3/4 strategy (e.g. Captive), confirm the generated plan
  actually enables it.
- **Review list (F11):** post a review, confirm it renders normally (escaping
  is transparent for ordinary emails/comments).

Run the unit tests any time with: `npm test` (needs Node ≥ 20).

---

## 4. Still open (need your input / decisions)

- **F6 — finish the team-membership lockdown.** Purely operational, needs your
  data: (a) in Supabase, seed `public.team_members` with each advisor's real
  `auth.users` UUID (query template is in `security_hardening_2.sql`);
  (b) disable open sign-up in the Supabase Auth dashboard; (c) run the
  commented final block at the bottom of `security_hardening_2.sql` to drop the
  `@pfs4u.com` domain fallback. Do (a) and (b) before (c) or you lock out the team.
- **F5 — client can read the whole advisor blob.** The proper fix (redaction
  view or splitting advisor-only fields out of the `data` jsonb) is a Phase C
  change and needs a decision on approach + a test DB. The advisor-mode AI gate
  (P4) is done; the blob-read gap remains.
- **Tax-law currency.** Whether the `$15M`/OBBBA constants are current 2026 law
  needs your tax counsel's sign-off. The structural fix (a single year-keyed
  `TAX_CONSTANTS` table, Pass 2 A4) is independent of which numbers are correct.

---

## 5. Suggested next steps (from the Pass 2 roadmap)

1. Complete F6 + decide the F5 approach.
2. Wire `index.html` to import from `engine/compute.js` and delete its inline
   copies (dedupe; needs browser load-order check).
3. Continue the extraction (A1) so more of the engine gets pinned by tests,
   then the remaining Pass-1 correctness fixes land test-first.
4. The year-keyed `TAX_CONSTANTS` table (A4) — kills the 5-inconsistent-exemption
   bug and the annual-staleness class of findings.
