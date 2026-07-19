# Pass 2 Report — Architecture & Product (the leverage pass)

**System:** Pyle Plan Builder · **Date:** 2026-07-04 · **Reviewer:** Fable 5 (2 parallel agents + verification)
**Input:** the Pass 1 correctness/security findings. **Constraint honored:** no rewrite; every proposal is incremental, shippable at each step, and preserves the no-build vanilla-JS ethos.

---

## 1. Executive summary

1. **One extraction unblocks the entire correctness roadmap.** `computePlan`, the tax engine, the 11 ladders, and the solver live in a plain top-level `<script>` with no exports, so *none* of the Pass 1 test pins can be written. Lifting the pure engine into `engine/compute.js` loaded via `<script type="module">` (zero bundler — the repo already multi-loads via `config.js`) is the **gating first step**. `index.html:8823, 8232`.
2. **Three of the worst data-integrity bugs share one root cause.** `readForm` (reads DOM), `snapshotForm` (reads a hand-typed 200-ID array), and `hydrateForm` (merges over stale state) are three disagreeing views of "the fields." One auto-generated `[data-persist]` registry collapses F0a (cross-client contamination), F0b (163 dropped fields), and the importer-drop bugs into a single fix. `index.html:8297, 23885, 23945`.
3. **`schemaVersion` is written but never read** — you have the migration hook and it's inert. Wiring a `migratePlan()` dispatch on load is the prerequisite for *ever* reshaping the blob safely (which every other fix will do). `index.html:23941`.
4. **The differentiator is not more strategy depth — the depth exists. It's making that depth legible over time.** Three engines that should form a retention loop already exist but are disconnected and advisor-only: `renderCompare` (17005), `runDiff` (27393), and `clonePlanForNextYear` (27696). Wiring `runDiff`'s structured deltas into the already-built `polish-narrative` endpoint produces a client-facing "what changed since last year" story — the single highest-leverage product move.
5. **The annual-review loop is the retention spine and it's half-built with a record-poisoning bug.** `clonePlanForNextYear` stores a $0 estate exemption (F0c, verified) and never advances client ages. A two-line fix turns a corrupting button into the recurring-revenue front door.
6. **"Client mode" is display-safe, not read-safe, and the AI mode is client-controllable.** Advisor-only content is hidden by CSS while the full blob ships to the client (Pass 1 F5), and a client can POST `mode:'advisor'` to `ask-plan` (no server-side team check) to get statute-citing, audit-risk responses. `index.html:511, 28220`, `api/ask-plan.js:53`.
7. **QIR is a full manual re-entry tax, duplicated across two lineages.** Neither QIR queries the `plans` table; the advisor re-enters client identity and re-imports holdings every quarter. `qir/` is canonical (cloud + Addepar import); `pyle-quarterly-simple/` is a gitignored template-copy workflow already co-maintained by hand (same commit `655c131`). Retire one; later fold QIR in as a `?mode=qir` view.
8. **The serverless layer is in good shape** (all 12 endpoints already share `_lib/auth.js`); the reporting layer is solid but faithfully amplifies the Pass 1 aggregate bugs — fixing exports is pointless until the math is fixed. **Blob-with-version is the right data model at this scale** — don't normalize 350 form fields or reach for CRDTs.

---

## 2. Architecture findings

**A1 · Engine not importable → Pass 1 pins can't exist · CRITICAL.** Every correctness finding stays un-testable and can silently regress forever. `index.html:8823, 19021, 22586, 17284` — all inside the plain `<script>` at `8232`, no exports. But `computePlan(d)` already takes a plain data object — the pure/impure split is half-done. **Fix:** lift pure functions to `engine/compute.js`, load as module, re-expose on `window.*` for the legacy code (nothing visibly changes). **M**, then add `engine/compute.test.js` under `node --test` (**S**).

**A2 · No DOM↔model↔storage contract → 163 fields silently dropped · CRITICAL.** Every new field is dropped until someone hand-edits the array at `23885`; saved plans reload with different numbers than were saved. **Fix:** add `data-persist` to every persisted input; rewrite `snapshotForm` to `querySelectorAll('[data-persist]')` (the array vanishes, becomes self-maintaining); reset registered elements to pristine defaults in `hydrateForm` before applying the snapshot (fixes F0a in the same edit). **M.**

**A3 · `schemaVersion` written but never read → blobs can't evolve safely · HIGH.** False confidence: a version stamp with no migrator. **Fix:** `engine/migrations.js` exporting `migratePlan(snap)`, called at the top of `loadPlan` (`26520`) and the JSON importer before `hydrateForm`. First migration normalizes the comma-formatted money strings (fixes F0c at the data layer). **S.**

**A4 · Tax constants scattered across ≥17 sites (5 for estate exemption) · HIGH.** Contradictory figures in one report today; a 2027 report computes on 2025 brackets. **Fix:** `engine/tax-constants.js` exporting `TAX_CONSTANTS[year]`, populated verbatim from current literals first (no-behavior-change ship), then point call sites at it cluster by cluster (estate first — kills F1). Add the stale-constant tripwire test + a `CONSTANTS-UPDATE.md` annual checklist. **M.**

**A5 · Security depends on SQL run order, not a source-of-truth schema · HIGH.** F4: wrong/partial run order leaves anonymous full-CRUD live against real PII. **Fix (today):** move the four `drop policy … anon_*` statements into `security_hardening.sql` so the last file to run re-locks unconditionally. **Then:** generate one consolidated, idempotent `schema.sql` that ends locked-down; keep `add_*.sql` as a dated `migrations/` archive. **S → M.**

**A6 · QIR duplicated → every fix is double-work · MEDIUM.** `qir/index.html` is canonical (uses `__PYLE_CONFIG__` + `qir_reviews`); `pyle-quarterly-simple/` is a local template-copy workflow. **Fix:** declare `qir/` canonical, port any unique print/PDF styling from the template, archive the other with a `DEPRECATED.md`. Fold into the main app as `?mode=qir` only *later*, after A1/A4 provide shared modules. **S** now, **M** later.

**A7 · Serverless: error-shape drift + per-request auth round-trip + no rate limit · MEDIUM.** F12 (uncapped credit burn), F27 (round-trip to `/auth/v1/user` couples every call to Supabase uptime), inconsistent `{error}` vs `{error,code}`. **Fix:** shared `_lib/respond.js` (uniform errors, S); `_lib/ratelimit.js` token bucket (M); local JWT-signature verification (S); tighten `checkOrigin` to not pass on absent Origin (F19, one line).

**A8 · No CI, README materially lies · MEDIUM.** Pins can be bypassed by any push; README still says "No auth yet." **Fix:** `.github/workflows/test.yml` running `node --test engine/*.test.js` (no build, no deps); rewrite the README auth section. **S.**

---

## 3. Ordered extraction sequence (each independently shippable, no bundler)

1. **Lift pure engine → `engine/compute.js`** (M) — module + re-expose on `window`. *Gating step.* Unblocks all correctness pins.
2. **First test file + GitHub Action** (S) — `node --test`, encode F1/F2/F3/F7/F8. First tests in the system's history.
3. **`engine/tax-constants.js`, verbatim lift** (M) — no number changes.
4. **Point estate-exemption call sites at `TAX_CONSTANTS`** (M), then brackets, then state tables — cluster by cluster. Kills F1.
5. **`data-persist` registry + rewrite snapshot/hydrate** (M) — fixes F0b + F0a + importer drops.
6. **`engine/migrations.js` + wire `migratePlan`** (S) — fixes F0c at the data layer; enables safe blob evolution.
7. **Consolidate SQL → idempotent `schema.sql`; move anon-drops into hardening** (S→M) — fixes F4.
8. **Retire `pyle-quarterly-simple/`** (S) — ends double-maintenance.
9. **`_lib/respond.js` + `_lib/ratelimit.js` + local JWT verify** (S/M/S) — fixes F12/F19/F27.
10. **(Later) QIR-as-mode fold-in** (M) — only after 1–4.

Do 1→2 before touching any correctness bug. 3→4 before 5. 6 depends on 5. 7/8/9 are independent and interleave.

**Data-layer verdict:** blob-with-version is honestly fine at this scale — the already-split tables (reviews, documents, audit_log, checklist, plaid) validate the boundary; the remaining blob is read/written atomically per session, the textbook case *for* JSON. Two conditions: read `schemaVersion` (A3) and close the last-write-wins gap with `.eq('updated_at', loadedAt)` (F29). Don't reach for CRDTs.

---

## 4. Product opportunities (ranked by value ÷ effort)

**P1 · Wire `runDiff` deltas into `polish-narrative` → client-facing "What Changed This Year" · Advisor+Client · M.** `runDiff` (`27393-27453`) already computes exactly the deltas a narrative needs; `polish-narrative.js` already returns client-safe HTML. Today the diff is an advisor-only metric table (`btn-diff` team-only, `5797`). **This is the differentiator bet** — it turns the annual review from a chore into a retention-driving client deliverable, reusing two things that already exist.

**P2 · Fix `clonePlanForNextYear` parse + age-advance, make it the annual-review CTA · Advisor · S.** Verified $0-exemption bug (`27727`) + ages never advance (`27720`). Two-line fix turns a record-corrupting button into the recurring-revenue spine. Cheapest high-value fix in the review. (Pass 1 F0c.)

**P3 · Complete `STRATEGY_USE_ID` so the solver's Apply Stack matches its score · Advisor · S.** 25 of 41 strategies mapped (`17486`); the other 16 silently skip. The flagship auto-solver shows savings it can't deliver — a direct trust hit. (Pass 1 F9.)

**P4 · Server-enforce AI advisor/client mode + strip advisor-internal fields from the client blob · Client · M.** `mode` is a client-controllable request field (`ask` `28220`, `ask-plan.js:53`), and the client SELECTs the full blob (F5). Derive `isAdvisor` from the JWT; split advisor-only fields into a filtered view. Fiduciary-relevant for a registered firm.

**P5 · Persist Plaid/Schwab pulls + disaggregate into balance-sheet rows · Advisor · M.** Live balances land as 4 aggregated form fields, not per-account rows, and aren't persisted (lost on reload) (`25788-25822`). The `addRow` plumbing (`8188`) already exists. Turns "live balances" from a party trick into the data spine — and the prerequisite for feeding real holdings to QIR.

**P6 · Fold QIR into the main app as a "Quarterly Review" mode · Advisor · L.** Neither lineage reads `plans`; full manual re-entry every quarter. One canonical QIR reading client identity + (post-P5) live holdings eliminates the biggest recurring time-leak. Sequence after P5.

**P7 · Bundled cheap trust fixes · Advisor · S each.** Checklist 42P01 silent no-op (`27626`), review stored-XSS on `reviewer_email`/`status` (`26609`), save concurrency guard (`26440`).

---

## 5. Do-not-build list

1. **No native mobile app / responsive rebuild.** A second codebase to sync against a 28k-line, zero-test file would multiply the exact drift problem (5 exemption values, QIR duplication) the team can't afford. The bottleneck is data-fidelity, not reach.
2. **No real-time collaborative editing (CRDT/live cursors).** The fix for concurrent edits is a one-line optimistic-concurrency check → "reload, someone else edited this," which is 100% of the value at 1% of the effort. Live merge is gold-plating a rare event.
3. **No in-app custodian/trading or holdings-level accounting.** Read-only balance pull is the right scope. Performance attribution / reconciliation / any transactional capability drags a planning tool into regulated RIA-custodial territory Addepar/Schwab already own. Consume that data (P5/P6); don't become its system of record.

---

## 6. Merged 90-day roadmap (Pass 1 + Pass 2, ordered by risk-reduction-and-value ÷ effort)

### Phase A — Stop the bleeding (week 1–2; ship independently, no dependencies)
1. **F4** — move `anon_*` policy drops into `security_hardening.sql`; verify anon role gets 0 rows. *(Prevents total PII dump.)* **S**
2. **F6** — seed `team_members`, drop the `is_team()` domain fallback, disable open signup in Supabase. *(Kills self-service admin.)* **S**
3. **F11 / P7** — `esc()` the review render fields. *(Kills stored XSS.)* **S**
4. **F12** — add `_lib/ratelimit.js` token bucket to the AI proxies. *(Caps credit burn.)* **M**
5. **P2 / F0c** — fix the `clonePlanForNextYear` comma-parse + age advance. *(Stops shipping $0-exemption clones.)* **S**
6. **F5 / P4** — stop returning advisor-internal blob content to clients (interim: strip on the server; full fix in Phase C). **S→M**

### Phase B — Make correctness testable, then fix it (week 2–6)
7. **A1 step 1** — extract `engine/compute.js`. *(Gating.)* **M**
8. **A1 step 2 + A8** — first `node --test` file + GitHub Action. **S**
9. **A2** — `data-persist` registry + reset-before-hydrate. *(Fixes F0a cross-client contamination + F0b 163 dropped fields.)* **M**
10. **A3** — `migratePlan()` wired into load. **S**
11. **A4** — `tax-constants.js`, estate cluster first. *(Fixes F1 contradiction.)* **M**
12. **Correctness pins land with their fixes** — F2, F3, F7, F8, F9/P3, F10, F14, F15, then the Medium tier. Each ships with the test that catches it. **S–M each**
13. **F29** — optimistic-concurrency guard on save. **M**

### Phase C — Structural + product leverage (week 6–12)
14. **A5 step 2** — consolidated idempotent `schema.sql`. **M**
15. **A6 / A7** — retire `pyle-quarterly-simple/`; `_lib/respond.js`, local JWT verify, tighten `checkOrigin`. **S–M**
16. **P1** — wire `runDiff` → `polish-narrative` "What Changed This Year." *(The differentiator bet.)* **M**
17. **P5** — persist + disaggregate Plaid/Schwab into balance-sheet rows. **M**
18. **F13 / F31 / F30 / F34** — import/persistence trust fixes (corrupt-JSON preservation, eMoney insurance sections, checklist table). **S each**
19. **P6** — (stretch) QIR-as-mode fold-in. **L**

**Dependencies:** A1 (#7) gates all correctness pins (#12). A2 (#9) precedes A4 (#11). A3 (#10) depends on A2. P1 (#16) and P5 (#17) are independent of the correctness track and can run in parallel once Phase A clears.

---

## 7. What I did NOT verify

- **Runtime behavior** — all findings are static reads; the module re-export-to-`window` load order (global error catcher at `:53`, Chart.js/Supabase UMD globals) must be verified when extraction step 1 ships.
- **Pure/impure boundary completeness** — `computePlan(d)` is data-driven, but not all ~150 functions were traced for hidden `document.*` reads; extraction may surface a few stragglers.
- **QIR feature parity** — canonicity established by data-connection; a line-by-line `qir/index.html` vs `qir-template.html` diff is still needed before deleting the template.
- **`polish-narrative`/`meeting-prep` server prompts in full** — the "reuse polish-narrative for the diff" recommendation assumes the endpoint is generalizable (likely, unproven).
- **Supabase prod/dashboard state** — actual deployed policies, migration order already run, signup toggle, RLS-enabled status all live in the console.
- **Tax-law currency** — out of scope; the structural fix (year-keyed table) is independent of which numbers counsel confirms.
