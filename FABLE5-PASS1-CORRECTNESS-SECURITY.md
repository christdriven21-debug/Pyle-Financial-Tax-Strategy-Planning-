# Fable 5 — Pass 1 of 2: Correctness & Security (the liability pass)

> Run this FIRST. Paste everything below the line into Fable 5 with the repo accessible.
> When it finishes, save the report — Pass 2 takes it as input.

---

## Role & mission

You are a principal fintech engineer performing a **correctness and security deep-dive** of the **Pyle Plan Builder** — a financial-planning application used by a registered advisory firm (Pyle Financial Services). Real client money decisions and PII flow through this system. Your only job in this pass is to find the things that produce **wrong numbers, leaked data, or unauthorized access**. Ignore code style, architecture aesthetics, and product ideas — those are a separate review.

## What the system is (orient, then verify — don't trust this summary)

- **No-build, vanilla JS.** `index.html` is a ~28,000-line monolith; the main logic is one ~11,000-line `<script>` block with ~150 functions: `computePlan` (planning engine), a multi-year tax engine (`runMultiYearTax`, `_computeTaxDrag`), Monte Carlo (`_boxMuller`, `runMonteCarlo`), a Social Security optimizer, ~11 estate "ladder" builders (GRAT/IDGT/CRT/SLAT/QPRT/SCIN/NIMCRUT/Walton/Family-LLC), an auto-solver, scenario planner, data importers (PreciseFP/Addepar/eMoney CSV+DOCX), AI chat, PDF/PPTX export, auth/MFA, IndexedDB offline sync, and an audit log.
- **Backend:** Vercel serverless functions in `api/` — Plaid (link/exchange/balances/sync/trends), Schwab OAuth, three Anthropic proxies (`ask-plan`, `extract-tax-doc`, `polish-narrative`), plus `meeting-prep` and `notify`. `api/_lib/auth.js` is the shared guard: it verifies the Supabase JWT via a network call to `/auth/v1/user` and enforces an Origin allowlist.
- **Data:** Supabase Postgres, single `plans` table; `data jsonb` stores the entire plan as one **unversioned blob**, hydrated via hardcoded field-ID arrays in `snapshotForm`/`hydrateForm`. RLS evolved across `supabase/*.sql` (initial anon-full-access schema, then `add_auth.sql`, then two `security_hardening*.sql` passes). Team access keys on email domain/allowlist; client access keys on `client_email` string matching.
- **Known context:** there are **zero automated tests**. The AI proxy endpoints have **no server-side rate limiting** (comments admit this). CDN scripts do carry SRI hashes. The README's security section is stale relative to shipped code.

## Method — be empirical, not impressionistic

- **Read before you judge.** Cite `file:line` for every finding. For every asserted bug, give the concrete input/state that triggers it and the wrong output or failure produced.
- **Trace the money path end-to-end** at least once: form input → `readForm` → `computePlan` / tax engine → `render*` → PDF/PPTX export and the AI context builders (`buildPlanContext`, `buildPlanContextForAI`). Flag anywhere a number can silently be wrong: unit mismatch, rounding drift, missing null-guard, off-by-one on projection horizons, stale cached value, order-dependent mutation of shared state between scenario runs.
- **Label confidence:** `CONFIRMED` (traced it, can describe the repro) vs `PLAUSIBLE` (looks wrong, needs a repro). Do not inflate.
- **Attack, don't audit.** For every RLS policy and API guard, actively construct the request that defeats it before concluding it holds.

## Focus areas

**A. Financial-model correctness (highest priority)**
1. Audit `computePlan`, `runMultiYearTax`/`_computeTaxDrag`, `runMonteCarlo`/`_boxMuller`, the Social Security optimizer (`singleLifeExpectancy`/`jointLastSurvivorExpectancy`), and at least 3 estate ladders for numerical correctness.
2. Hunt hardcoded tax constants — brackets, exemption amounts, contribution limits, §7520/AFR rates — that silently go stale by tax year. List every one you find with its location and the year it was current.
3. Shared-state mutation: `computePlanWithOverrides`, the scenario planner, and the auto-solver re-run the engine — verify runs can't contaminate each other or the baseline.
4. The blob lifecycle: what breaks when the form shape changes? Can an old saved plan hydrate incorrectly *without erroring*? Check `snapshotForm`/`hydrateForm`/`clonePlanForNextYear` and the importers for silent field drops.
5. Identify the **10 highest-risk functions to pin with tests first**, ranked by (likelihood of wrong number × client impact), each with the specific test that would catch its failure mode.

**B. Access control & data exposure**
1. RLS: probe for privilege escalation, row theft via `client_email` reassignment, case/alias/plus-addressing/email-change bugs, and the transition state between `add_auth.sql` and the two hardening files (which policies actually win if all were run in sequence?). Does a client SELECT return team-only content embedded in the shared blob (advisor notes, internal flags)?
2. `api/_lib/auth.js`: the no-Origin bypass path, preview-deploy origins, and per-request round-trip to Supabase (rate-limit/DoS exposure). Check every endpoint actually calls it — enumerate any that don't.
3. Plaid + Schwab flows: token storage, `state` parameter handling in the OAuth callback, and what the cron endpoint (`sync-balances`) accepts.
4. AI proxies: quantify the credit-burn exposure from missing rate limits; trace exactly what PII enters the plan context sent to Anthropic; assess prompt-injection via imported client documents (`extract-tax-doc` especially — it parses hostile files).
5. Client-side: the CSP's `'unsafe-inline'` script allowance, DOMPurify usage coverage (is every render of user/imported content sanitized?), secrets in `config.js`, and IndexedDB offline copies of plan data on shared machines.

## Output contract — return exactly this structure

1. **Executive summary** — 5–8 bullets; only findings that change what the team does this month.
2. **Ranked findings** (up to 15) — each as: `#` · **Title** · Severity (Critical/High/Med/Low) · Confidence (Confirmed/Plausible) · **Evidence:** `file:line` · **Failure scenario:** concrete input → wrong output/breach · **Fix:** minimal specific change + effort (S/M/L).
3. **Stale-constants table** — every hardcoded tax/limit value: location, value, tax year it was correct, what goes wrong when stale.
4. **Correctness risk register** — the 10 functions to pin with tests, ranked, each with the test that catches its failure mode.
5. **What I did NOT verify** — explicit blind spots.

Prioritize ruthlessly. Ten confirmed findings with exact locations beat fifty maybes.
