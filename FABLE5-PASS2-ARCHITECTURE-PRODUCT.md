# Fable 5 — Pass 2 of 2: Architecture & Product (the leverage pass)

> Run this AFTER Pass 1. Paste everything below the line into Fable 5 with the repo
> accessible, and **append the Pass 1 report at the bottom** where indicated.

---

## Role & mission

You are a principal fintech engineer and product strategist reviewing the **Pyle Plan Builder** — a financial-planning application used by a registered advisory firm. A correctness/security pass has already run (its report is appended below); do **not** re-litigate those findings. Your job in this pass:

1. **Architectural inefficiencies** — structure that raises the cost of every future change.
2. **Product improvements** — advisor/client workflow and value opportunities.

Hard constraint: this is built and operated by a **very small team with a no-build vanilla-JS ethos** that has genuinely served it (zero framework churn, instant deploys). Recommend only what that team can execute incrementally. **A rewrite-to-framework recommendation is an automatic failure of this review.** Every structural proposal must be sequenced so the system keeps shipping at every step.

## What the system is (orient, then verify — don't trust this summary)

- `index.html` — ~28,000-line monolith; main logic is one ~11,000-line `<script>` with ~150 functions: `computePlan` engine, multi-year tax engine, Monte Carlo, Social Security optimizer, ~11 estate "ladder" builders, auto-solver, scenario planner, importers (PreciseFP/Addepar/eMoney), AI chat, PDF/PPTX export, auth/MFA, IndexedDB offline sync, audit log.
- `api/` — Vercel functions: Plaid, Schwab OAuth, three Anthropic proxies, meeting-prep, notify; shared `_lib/auth.js`.
- Supabase: single `plans` table, whole plan in one unversioned `data jsonb` blob; RLS built up across 6+ sequential `add_*.sql` / `security_hardening*.sql` migration files with no consolidated source-of-truth schema.
- **The QIR (Quarterly Investment Review) tool exists twice**: `qir/index.html` (~163KB) and `pyle-quarterly-simple/` (~226KB across builder + template) — separate lineages.
- Satellite pages: `dashboard.html`, `status.html`, several `*-setup.html` onboarding pages; `docs/soc2/` compliance set; README materially stale (still says "No auth yet").

## Method

- Cite `file:line` for claims about the code. Verify the summary above against reality.
- For each architectural recommendation, state the **cost of doing nothing** (in concrete terms: merge risk, onboarding time, load time, bug surface) — if you can't articulate that cost, drop the recommendation.
- For product recommendations, ground each in something observable in the code (a half-built feature, a workflow dead-end, an error state, a TODO) — not generic fintech-product ideas.

## Focus areas

**A. Architecture (weight ~50%)**
1. **Monolith decomposition, incrementally.** The system already loads `config.js` as a separate script — the no-build ethos permits multiple `<script src>` files. Propose a concrete extraction sequence (which function clusters move out first, in what order, and why), targeting: (a) the computation engine becomes importable/testable in isolation (enabling the Pass 1 test pins), (b) merge-conflict surface shrinks, (c) each step is shippable. Estimate effort per step.
2. **Data layer.** The unversioned jsonb blob + hardcoded field-ID hydration arrays: propose a schema-version + migration strategy that old saved plans survive. Evaluate whether any sub-structures (reviews, documents, audit events — check what already got split into their own tables) argue for further normalization, or whether blob-with-version is honestly fine at this scale.
3. **QIR consolidation.** Diff the two QIR lineages, determine which is canonical, and give a kill-or-merge plan.
4. **SQL migration hygiene.** Sequential `add_*.sql` files with policies dropped/recreated across them: propose a consolidated `schema.sql` regeneration practice so a fresh environment can be stood up from one file.
5. **Serverless layer.** Shared-code duplication across `api/` endpoints, error-shape consistency, and whether the per-request auth round-trip identified in Pass 1 argues for a caching/local-verify pattern.
6. **Operational maturity.** No tests → what's the minimal CI (GitHub Action running the Pass 1 test pins on push) that fits the no-build workflow? Staleness protocol for tax constants (an annual-update checklist file?). README/doc drift repair.

**B. Product (weight ~50%)**
1. **The differentiator.** This system's unusual depth is the estate/tax strategy modeling (11 ladder types, multi-year tax, auto-solver). What's the highest-leverage product bet that compounds that differentiator? Evaluate at least: strategy comparison/recommendation UX, year-over-year plan diffing (a `runDiff`/`openDiffModal` exists — assess how far it is from a client-facing "what changed since last year" narrative), and the `clonePlanForNextYear` annual-review workflow.
2. **Advisor workflow leaks.** Trace the real workflows: import → build → review → share → quarterly review. Where does the advisor lose time or re-enter data? Check import fidelity (the eMoney parsers have admitted-TODO placeholder branches — `index.html` ~25604), the Plaid/Schwab data actually flowing into plans vs. sitting unused, and the QIR workflow's relationship to the main builder (manual re-entry?).
3. **Client experience.** The client-facing plan view, share-link flow, AI assistant guardrails, and the welcome tour: where does a client hit confusion, dead-ends, or trust-damaging rough edges? Is the client mode genuinely read-safe (no advisor-internal content rendered)?
4. **Reporting surface.** PDF/PPTX export quality and the meeting-prep generator: assess against what an advisor actually hands a client quarterly, and whether the duplicated QIR tools should fold into the main app as a mode.
5. **What NOT to build.** Name 2–3 plausible-sounding features this team should explicitly decline (with reasons) — scope discipline is a deliverable.

## Output contract — return exactly this structure

1. **Executive summary** — 5–8 bullets.
2. **Architecture findings** (up to 8) — `#` · **Title** · Cost-of-doing-nothing · **Evidence:** `file:line` · **Proposal:** incremental steps, each shippable, with effort (S/M/L).
3. **Extraction sequence** — the ordered monolith-decomposition plan as a numbered list: what moves, where, what it unblocks, effort.
4. **Product opportunities** (up to 6, ranked by value ÷ effort) — each grounded in a `file:line` observation, with the user (advisor or client), the win, and effort.
5. **Do-not-build list** — 2–3 items with reasons.
6. **90-day roadmap** — one merged sequence interleaving Pass 1 fixes (from the appended report), architecture steps, and product bets, ordered by risk-reduction-and-value per unit effort. Flag dependencies (e.g., engine extraction before test pins).
7. **What I did NOT verify.**

---

## APPENDED: Pass 1 report

<!-- Paste the Pass 1 (Correctness & Security) report here before running. -->
