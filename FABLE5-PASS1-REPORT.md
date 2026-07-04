# Pass 1 Report — Correctness & Security (the liability pass)

**System:** Pyle Plan Builder · **Date:** 2026-07-04 · **Reviewer:** Fable 5 (5 parallel deep-dive agents)
**Scope reviewed:** `index.html` (~28k lines), all `api/*.js`, all `supabase/*.sql`, `vercel.json`, `config.js`.

---

## 1. Executive summary

0. **The single worst finding: loading one client's plan can silently overwrite another client's data.** `hydrateForm` never resets the form first — it merges the loaded snapshot *over whatever is on screen*. Load Client A, then load Client B (saved before some fields existed); A's values persist in every field B lacks, are presented as B's data, get baselined as clean (no dirty flag, no unload warning), and the next Save writes A's figures permanently into B's row. Combined with the fact that `snapshotForm` silently drops **163 model fields** and `clonePlanForNextYear` parses `"15,000,000"` as `15` and stores a **$0 estate exemption** for next year, the persistence layer is actively corrupting client records. `index.html:23945, 23885, 27727`.
1. **The app ships contradictory client-facing dollar figures today.** The federal estate exemption is hardcoded at **five different values** (`$15M`, `$13.99M`, `$27.98M`, `$14M`) with no source of truth, so the "amount at risk before sunset" card disagrees with the estate-tax-due figure in the *same report*. `index.html:5591, 16470, 17158, 16987, 27727`.
2. **The headline wealth and savings numbers are inflated by real math errors, not rounding.** With-planning net worth never subtracts money given to charity/trusts and double-counts Dynasty funding (overstates by $15M+ on a $75M-sale example); "Total Tax Savings from All Strategies" double-counts CRAT/CRUT benefits. These make planning look like free money. `index.html:10565, 15850, 9328`.
3. **The Monte Carlo "Probability of Success" — the number clients anchor on — is overstated.** It credits Social Security from year 1 regardless of claim age (a 55-yr-old claiming at 67 gets 12 phantom years of SS), inflating success odds an estimated 10–20 points. `index.html:22623`.
4. **Access control has a single point of failure and a data-model leak.** The table's entire safety rests on one migration file (`add_auth.sql`); any run order that skips it leaves anonymous full-CRUD live → total PII dump. And a logged-in client's query returns the *whole* plan blob — advisor-only notes are hidden by CSS only. `supabase/schema.sql:43`, `index.html:511, 26524`.
5. **Self-service privilege escalation.** `is_team()` still trusts any `@pfs4u.com` email and magic-link signup appears unrestricted → one mailbox = full-tenant admin.
6. **A stored XSS sink executes in advisor sessions.** `reviewer_email` and `status` reach `innerHTML` unescaped in the review list, and CSP's `'unsafe-inline'` lets the injected handler run. `index.html:26603`.
7. **AI proxies have no server-side rate limiting** — an authenticated client can loop `extract-tax-doc` (multi-MB PDF per call) and burn thousands of dollars/hour. And client PII (full names + exact dollars) leaves the browser more broadly than the privacy comment claims.
8. **Zero automated tests** guard any of this. Every number above is one refactor away from silently changing.

**The through-line:** this is a genuinely sophisticated engine (40+ strategies, deep estate/tax modeling) with sound *deterministic* ladder math, undermined by (a) no year-keyed constants, (b) aggregation/double-count bugs in the summary layer, and (c) a security model whose correctness depends on operational discipline that isn't enforced in code.

> **Note on tax-law currency:** two agents disagreed on whether the $15M exemption / TCJA-sunset modeling is current, because it depends on 2025 OBBBA legislation at the edge of the model's knowledge. **Have the firm's tax counsel confirm the 2026 figures before acting on the constants table.** The *structural* finding — five inconsistent hardcoded values and a sunset scenario that contradicts the tool's own default — stands regardless of which number is right.

---

## 2. Ranked findings

Severity × confidence. `CONFIRMED` = code path traced; `PLAUSIBLE` = needs a repro.

### CRITICAL

**F0a · `hydrateForm` merges over prior form state → cross-client data contamination · Data integrity · CONFIRMED**
Evidence: `index.html:23945-23953` (sets only keys present in the snapshot; no `form.reset()` exists anywhere), `26520-26546` (`loadPlan` → `hydrateForm`), `26545` (`rebaselineDirty` baselines the *contaminated* state → no dirty flag, no unload warning), `26423` (Save).
Failure: advisor loads Plan A (Client A), then loads Plan B saved before some fields existed → A's values remain on screen as B's data; one Save writes Client A's figures permanently into Client B's row, thereafter indistinguishable from real data. Same mechanism injects new-field HTML defaults as "client data" on a fresh session.
Fix: capture pristine defaults once at boot; in `hydrateForm`, reset every registered id to default, *then* apply the snapshot. **Effort: S.** (Also fixes F0d below and the `runDiff` contamination at `27377`.)

**F0b · `snapshotForm` silently drops 163 model fields on every save/load/clone · Data integrity · CONFIRMED**
Evidence: `index.html:23885-23929` (hardcoded `ids` array covers only Phase-1 strategies); diff vs. every field `readForm` consumes = **163 unsnapshotted IDs**, including the entire `corp-*`, `deal-*`, `proceeds-*` blocks and every Phase 2/3/4 strategy's parameters (`oilgas-*, captive-*, scin-*, mon-install-*, qsbs-1045-*, …`).
Failure: the enabling checkbox persists but every parameter reverts to DOM default on reload → the strategy recomputes $0 or garbage-from-defaults, with no error (`hydrateForm` guards `if (el)`). A saved plan reloads with different numbers than were saved.
Fix: generate the registry from a `[data-persist]` DOM attribute (or fail loudly in dev when a control isn't registered). **Effort: M.**

**F0c · `clonePlanForNextYear` stores a $0 estate exemption (and a $136 AMT exemption) · Data integrity · CONFIRMED**
Evidence: `index.html:27727-27731`; money inputs are comma-formatted by `formatAllMoneyInputs` (`6227`), so the snapshot holds `"15,000,000"`; `parseFloat("15,000,000")` = `15` (stops at comma; not NaN, so the `|| 15_000_000` fallback never fires) → `round(15×1.025/10_000)×10_000` = **0**.
Failure: next January's cloned plan computes estate tax with a **$0 exemption** (~40% on the entire estate) and a $136 AMT exemption — plausible-looking, massively wrong numbers in a client deliverable. The clone also never advances client ages (`27720` bumps year only → wrong RMD onset, LE horizon, mortality pricing).
Fix: `parseFloat(String(v).replace(/[^0-9.-]/g,''))` before the inflation bump; increment ages. **Effort: S.**

**F1 · Estate exemption hardcoded at 5 inconsistent values · Correctness · CONFIRMED**
Evidence: `index.html:5591` ($15M default), `16470` ($13.99M sunset card), `17158/17208` ($27.98M/$14M scenarios), `16987/27727` ($15M fallbacks).
Failure: the use-it-or-lose-it card computes "amount at risk" off $13.99M while the estate engine defaults off $15M → two contradictory numbers in one client report.
Fix: single `TAX_CONSTANTS[year]` source; all call sites read from it. **Effort: M.**

**F2 · With-planning net worth omits gifted/charitable outflow; Dynasty double-counted · Correctness · CONFIRMED**
Evidence: `index.html:10565–10567, 10587–10588, 11061`.
Failure: $75M sale, $10M CRAT + $5M DAF + $10M Dynasty → "Total Client Net Worth" overstated ~$15M (charity money still shown as client's), "Family NW" overstated $10M more (Dynasty double count), and planning is portrayed as costless gain. Many downstream consumers (`10999, 14391, 18814, 19032`).
Fix: subtract `totalPreSaleOutflow` from `withPlanningTotal`; remove Dynasty double add. **Effort: M.**

**F3 · "Total Tax Savings from All Strategies" double-counts CRAT/CRUT CG elimination · Correctness · CONFIRMED**
Evidence: `index.html:15850, 15995, 16020, 16024, 16770`.
Failure: $10M CRAT at 33.3% → CRAT CG benefit counted at $3.33M *and* again inside `cgTaxSavings` ⇒ headline overstated $2.7–3.3M; also ignores basis and sums annual QBI with one-time items.
Fix: value CRAT/CRUT at `gainAvoided × rate` once; separate annual from one-time. **Effort: S.**

**F4 · Anonymous full-CRUD survives any migration order skipping `add_auth.sql` · Security · CONFIRMED**
Evidence: `supabase/schema.sql:43-46` (anon policies `using(true)`); only `add_auth.sql:36-39` drops them; `security_hardening*.sql` never re-assert the drop.
Failure: `GET /rest/v1/plans?select=*` with the public anon key (shipped in `config.js`) returns every client's full plan; PATCH/DELETE unrestricted.
Fix: move the `anon_*` drops into `security_hardening.sql` so the final pass re-drops unconditionally. **Effort: S.**

**F5 · Client SELECT returns the whole blob incl. advisor-only content · Security · CONFIRMED**
Evidence: `index.html:26524` (`loadPlan` selects full `data`); `add_auth.sql:73` grants entire row; advisor-only content hidden only via CSS `index.html:511-522, 6888`.
Failure: logged-in client opens DevTools → Network (or queries `select=data`) → reads every advisor-internal note, audit-risk flag, and withheld strategy. `display:none` is not access control.
Fix: split advisor-internal fields into a separate row/table or a filtered view. **Effort: M.**

### HIGH

**F6 · `is_team()` domain fallback + open signup → self-service team escalation · Security · CONFIRMED (code) / PLAUSIBLE (exploit)**
Evidence: `security_hardening_2.sql:38-51` (domain OR allowlist; drop-block commented out); `index.html:26048` OTP signup, no repo-side signup restriction.
Failure: anyone who receives mail at any `@pfs4u.com` address (catch-all, ex-employee alias, typosquat MX) → `is_team()` true → full CRUD on all plans, reviews, documents, audit log, QIRs.
Fix: seed `team_members`, drop the domain fallback, disable open signup in Supabase dashboard. **Effort: S** (code) + dashboard config.

**F7 · Monte Carlo credits Social Security from year 1 regardless of claim age · Correctness · CONFIRMED**
Evidence: `index.html:22623-22629` vs. correct gating at `22139, 19059`.
Failure: age 55, claim 67, spend $400k, SS $60k → MC under-withdraws ~$60k/yr for 12 yrs → "Probability of Success" overstated ~10–20 pts.
Fix: `const ss = (primaryAge + y) >= ssClaimAge ? ssAnnual * inflMult : 0;` **Effort: S.**

**F8 · Walton GRAT remainder formula ~50% overstated · Correctness · CONFIRMED**
Evidence: `index.html:22009-22010` vs. correct annuity-factor walk at `20904-20925`.
Failure: $1M / 3yr / h=4.5% / r=10% → true remainder $126.9k, code shows $189.8k; compounded ×5 cycles into `estateSave`. The two GRAT cards give contradictory numbers for identical inputs.
Fix: reuse `renderGratLadder`'s annuity-factor walk. **Effort: S.**

**F9 · Solver recommends strategies "Apply Stack" cannot toggle · Correctness/UX · CONFIRMED**
Evidence: `index.html:17486-17511` — `STRATEGY_USE_ID` maps only ~22 of 40 strategy keys; 18 (captive, oilgas, esop1042, monInstall, qsbs1045, scin, waltonGrat, familyLlc, serp, …) → `getElementById(undefined)` → null.
Failure: solver shows "$X saved with Captive + Oil&Gas", user clicks Apply → generated plan silently omits them; displayed solver total ≠ generated plan. Also breaks Zero-Tax Menu toggles (`19256`).
Fix: complete the map with the real irregular IDs. **Effort: S.**

**F10 · `runMultiYearTax` uses flat marginal rate, 100%-taxable SS, stale/again-wrong deduction, bogus Roth breakeven · Correctness · CONFIRMED**
Evidence: `index.html:19084-19110`.
Failure: (a) `fedTax = taxableIncome × marginal` — a $250k year at 37% overstates fed tax ~$35k/yr, distorting Roth-ladder advice; (b) SS in AGI at 100% (max 85%); (c) `agi − 30_000` std deduction (wrong value, not filing-status aware); (d) `rothBreakevenAge` algebraically collapses to `primaryAge + 2` for all inputs.
Fix: bracket table + 85% SS cap + real breakeven. **Effort: M.**

**F11 · Stored XSS in review render · Security · CONFIRMED**
Evidence: `index.html:26603-26615` — `r.reviewer_email` and `r.status` into `innerHTML` with no escaping; amplified by CSP `'unsafe-inline'` (`vercel.json:20`).
Failure: a `plan_reviews` row with `reviewer_email = a@b.com<img src=x onerror=…>` executes in every advisor/teammate session that opens the plan → token theft (Supabase JWT in localStorage), plan tampering.
Fix: `esc()` all three fields; whitelist the status class. **Effort: S.**

**F12 · No server-side rate limiting on AI proxies · Security/Cost · CONFIRMED**
Evidence: `api/ask-plan.js:13-14` (admits it), `polish-narrative.js`, `meeting-prep.js`, `extract-tax-doc.js`; only client-side button-disable throttle.
Failure: any authenticated user scripts `authedFetch('/api/extract-tax-doc', …)` in a loop; ~3–10¢/call with multi-MB PDF input → tens of $/min, thousands/hour, uncapped.
Fix: per-user token bucket in Supabase (shared `_lib/` helper); e.g. 20/min for ask-plan, 30/day for extract-tax-doc → 429 above. **Effort: M.**

**F13 · Client PII persists after logout on shared machines · Security · CONFIRMED**
Evidence: `index.html:26106-26111` (`signOut` clears only the JWT); IndexedDB folder handles `24064`, unencrypted downloaded JSON `24112` with client name in filename, leftover `localStorage` keys.
Failure: on a shared advisor workstation, the next user reads prior clients' PII from IndexedDB-reachable folders, leftover JSON, and the still-populated form.
Fix: in `signOut`/`SIGNED_OUT`: `indexedDB.deleteDatabase('pyle-fs-handles')`, purge `pyle_*` keys, reset the form. **Effort: M.**

**F14 · SS strategy comparison drops benefits paid before the later spouse claims · Correctness · CONFIRMED**
Evidence: `index.html:10905-10908` (`computeStrategyLifetime` starts both incomes at `max(primaryClaimAge, spouseClaimAge)`); spousal factor errors at `10900`.
Failure: "Higher earner FRA, spouse 62" silently discards the spouse's 62–67 checks (~$84k); the "Best Strategy" star can be wrong. Spousal benefit also earns impossible delayed credits and uses retirement (not spousal) reduction factors.
Fix: accumulate each person's income stream from their own claim age; cap spousal at 50% at FRA. **Effort: M.**

**F15 · Aggregation bucket mixes deferrals + annual + one-time as "immediate savings" · Correctness · CONFIRMED**
Evidence: `index.html:10525-10553`; QOZ state-tax deferral bug `9228-9245`; CRUT deduction double-count `9328-9352, 10527`.
Failure: a $30M monetized installment sale shows ~$10M "immediate tax savings" that is 100% deferral repayable at year 30; CA QOZ shows ~$2.66M state tax as deferred that is actually due; CRUT deduction counted twice.
Fix: split savings / deferrals / annual buckets; exclude state rate from non-conforming QOZ; remove the duplicate CRUT term. **Effort: M.**

### MEDIUM (abbreviated — full detail in agent transcripts)

- **F16** RMD start age hardcoded 73; SECURE 2.0 age-75 cohort (born ≥1960 = every client under ~66) ignored → projections start 2 yrs early. `10789, 22124, 20751`. CONFIRMED. **S.**
- **F17** `plaid_items_safe` view created without `security_invoker=on` + no explicit `REVOKE` → possible cross-tenant institution-metadata leak, and base-table `access_token` exposure if ever selected through a definer view. `add_plaid.sql:33-36`. PLAUSIBLE. **S.**
- **F18** `audit_log` INSERT policy is forge-friendly; the fix only lands if `security_hardening.sql` was actually run → a client can forge advisor-attributed audit entries (SOC2/fiduciary impact). `add_audit_log.sql:49-52`. CONFIRMED. **S.**
- **F19** `checkOrigin` returns true when Origin+Referer absent → any non-browser client (curl) bypasses the allowlist; `requireUser` is the only real gate. `auth.js:34-45`. CONFIRMED. **S.**
- **F20** Retirement Income Stack single-year card sums SS + future-valued age-73 RMD + today's yield + CRT income into one "annual" figure (2026 dollars + 2044 dollars). `20571-20582`. CONFIRMED. **M.**
- **F21** AMT check understates AMT (flat-rate comparator, excludes ISO bargain element + cap gains, 2025 params). `10330-10346`. CONFIRMED. **M.**
- **F22** `computeMultiYearCashFlow` portfolio income compounds at full equity even through deep deficits; balance never drawn down → masks portfolio exhaustion. `15061-15098`. CONFIRMED. **M.**
- **F23** Monte Carlo uses the deterministic geometric rate as arithmetic mean (volatility-drag inconsistency; MC median ~19% below deterministic for the same assumption); σ=0.12 hardcoded regardless of allocation. `22609-22610`. PLAUSIBLE. **M.**
- **F24** Three inconsistent mortality models across GRAT/QPRT/SCIN/Walton cards; `1 − term/(110−age)` proxy materially misstates death risk. `20929, 21543, 21693, 22013`. CONFIRMED. **M.**
- **F25** ILIT legacy pay-years floored at 10 via `Math.max(...map, 10)` → a 5-pay policy modeled as 10-pay, premiums doubled. `8539-8545`. CONFIRMED. **S.**
- **F26** TCJA-sunset scenario models repealed law → phantom ~$3.2M estate-tax "risk". `17203-17209, 16536`. CONFIRMED (pending counsel confirmation of 2026 law). **S.**
- **F27** `notify.js` team check matches on email *domain* not address; per-request auth round-trip to `/auth/v1/user` (DoS/cost amplification). `notify.js:63`, `auth.js:73`. CONFIRMED. **S/M.**
- **F28** Blank tax-rate fields silently yield $0 tax (no sanity band); NIIT lesser-of computed but never applied; education funding assumes superfunding was contributed. `8303, 8841, 18867`. CONFIRMED/PLAUSIBLE. **S.**
- **F29** Cloud save has no optimistic concurrency → two team members editing one plan = silent last-write-wins, no error/merge. `index.html:26435-26440` (add `.eq('updated_at', loadedAt)`). CONFIRMED. **M.**
- **F30** eMoney "Comprehensive" import silently ignores the Insurance & Beneficiaries sections while reporting `✓ success` → insurance-gap analysis renders from defaults presented as client data. `25172-25179, 25604-25613`. CONFIRMED. **S.**
- **F31** Corrupt `balance-sheet-data` JSON is caught, silently replaced with `{}`, re-serialized empty, and destroyed on next Save. `index.html:8201-8216`. CONFIRMED. **S.**
- **F32** Importers append with no dedupe and overwrite top-level figures → double-clicking Import doubles the balance sheet and rewrites `client-pnw` to ~2× net worth, with `✓` both times; importing while another client's plan is open merges two clients. `24580, 8113`. CONFIRMED. **S.**
- **F33** `parseMoneyCell` has no K/M suffix handling → a vendor CSV emitting `$1.2M` imports as `$1`. `24682-24687`. CONFIRMED. **S.**
- **F34** `hydrateChecklist` silently no-ops on a missing table (42P01) → checkmarks appear to work but never persist. `27626-27630`. CONFIRMED. **S.**
- **F35** SLAT "Estate-Tax Saved" overstated by ~`funding × estateRate` — credits the whole ending balance (incl. principal already removed via the reported gift) as tax saved; GRAT/IDGT net principal correctly, SLAT doesn't. `21422-21423`. CONFIRMED. **S.**
- **F36** Monte Carlo omits retirement accounts from `startBalance` and never credits RMD income despite its own header comment claiming it does → success rate biased *low* (opposite direction from the F7 SS bug; they don't cancel). `22604, 22628`. CONFIRMED. **S.**

### What HELD (attacked, could not break)

Row-theft via `client_email` reassignment (WITH CHECK re-evaluates on new row); Schwab OAuth CSRF (HMAC-signed state + HttpOnly nonce cookie + timing-safe compare); Plaid `user_id` derived from JWT not body, `access_token` never returned to client; AI chat output + polish/meeting-prep HTML are DOMPurify-sanitized; importer values escaped in double-quoted attribute context; UUID regex guards PostgREST filter injection; **scenario/solver runs deep-clone before mutating — no baseline contamination** (the scenario hazard is F9, not shared state); no service-role key or Anthropic key committed client-side.

---

## 3. Stale-constants register

No centralized constants and no tax-year selection — values are `const` locals scattered inside `computePlan`, `runMultiYearTax`, and chart builders, several duplicated with drift. **A report stamped "2027" computes on 2025 brackets.** Confirm 2026 figures with counsel; the *structural* fix (one `TAX_CONSTANTS[year]` table) is independent of which numbers are current.

| Constant | file:line | Value | Year correct | Consequence when stale |
|---|---|---|---|---|
| Federal estate exemption (5 sites) | 5591, 16470, 17158, 16987, 27727 | $15M / $13.99M / $27.98M / $14M | inconsistent | Contradictory estate-tax + "at-risk" figures (F1) |
| Federal ordinary brackets (MFJ) | 16300-16307 | 10–37% at 2025 edges | 2025 | Wrong Roth-conversion headroom / "prime year" advice |
| Standard deduction (MFJ) | 19085, 19434 | $30,000 | 2025-ish | Roth engine subtracts wrong deduction every year (F10) |
| §831(b) captive cap (×4) | 8922, 9909, 11746, 12949 | $2,650,000 | 2024 | Captive deduction understated ~$200k+/yr |
| State estate exemptions (CT/NY/WA/HI…) | 7156-7197 | 2024 thresholds | 2024 | Wrong state estate tax; NY cliff test fires at wrong point |
| WA capital-gains excise | 19226 | 7% > $270k | 2024 | Misses 2025 +2.9% surtax > $1M → understates WA CG tax |
| §199A SSTB threshold/ceiling | 9762-9764, 15921 | $394,600 / $494,600 | 2025 | Wrong §199A deduction + phase-out band |
| AMT exemption / phase-out | 10333-10335 | $137k/$88.1k; $1.2527M @25% | 2025 | Understates 2026 AMT for AMTI ≳ $1M |
| §415(c) / DB tiers | 10089, 10371 | $76,500 / 2024 tiers | 2024 | Owner allocation cap understated |
| HSA limits | 10103, 5437 | $4,150 / $8,300 | 2024 | Understates HSA saving; UI says "2024" in a 2026 tool |
| 401(k) deferral (label) | 6750, 12813 | "$23,500 … 2026" | 2025 (mislabeled) | Affirmatively wrong label; understates capacity |
| IRMAA MFJ tiers | 19037, 20200 | 2025 tiers/$ | 2025 | Roth headroom mis-sized; surcharge $ wrong |
| Annual gift exclusion / 529 superfund | 20387, 6718 | $18k *and* $19k | inconsistent | Crummey/superfunding capacity mis-stated |
| QCD limit | 12431 | $108,000 | 2025 | Understates QCD capacity 2026+ |
| NIIT threshold | 8841 | $250k MFJ only | statutory | Wrong for single filers ($200k) |
| MC stdDev / SS COLA / portfolio yield | 22610, 22140, 20575 | 0.12 / 2.5% / 3% | assumptions | Insensitive to allocation/rates; 3 different COLA conventions |

§7520/AFR rates are correctly **user inputs** (not frozen) — good.

---

## 4. Correctness risk register — pin these first

Ranked by (likelihood of wrong number × client impact). Each row = the test that catches its failure mode.

| # | Function / area | file | Risk | Pinning test |
|---|---|---|---|---|
| 0a | `hydrateForm` reset-before-hydrate | 23945 | Cross-client data contamination (worst finding) | Load snapshot A with `collar-notional:"5000000"`, `use-collar:true`; hydrate snapshot B lacking those keys → assert `snapshotForm().values['collar-notional']` == pristine default and `use-collar` == false; `computePlanFromSnapshot(B)` identical regardless of prior hydrate |
| 0b | `snapshotForm`/`hydrateForm` round-trip | 23885 | 163 fields silently dropped | Populate one field per strategy family → `hydrateForm(snapshotForm())` → assert every value survives (163 fail today) |
| 0c | `clonePlanForNextYear` numeric + age integrity | 27727 | Clone stores $0 estate exemption; ages don't advance | `tax-estate-exempt:"15,000,000"` → clone ≈ 15,375,000 (today `"0"`); `client-primary-age:64` → clone == 65 |
| 1 | `computePlan` net-worth invariants | 10565 | Charity/gift money counted as client wealth; Dynasty double-count | $75M sale + $10M CRAT + $5M DAF + $10M Dynasty → assert `withPlanningTotal = sale − tax + other − (cr+daf+dy)` and `familyNW − withPlanning === dy`; `wealthAdvantage < cgTaxSavings` |
| 2 | `renderTax` savings composition | 15850 | CRAT/CRUT CG benefit double-counted; basis ignored | CRAT-only, basis 50% → headline = `crGainAvoided×rate + cappedDeduction×marginal + cr×estateRate` exactly once |
| 3 | `runMonteCarlo` SS gating | 22623 | Success probability inflated 10–20 pts | age 55/claim 67/σ=0 → year-5 balance == deterministic with zero SS offset |
| 4 | `applySolverStack` round-trip | 17497 | Applied stack ≠ scored stack for 18 strategies | every `SOLVER_STRATEGIES` key flips a real checkbox; `computePlan` total == `solverScore` within $1 |
| 5 | Walton GRAT ↔ GRAT ladder consistency | 22009 | 50% transfer overstatement | $1M/3yr/h4.5%/r10% → both cards' remainder == $126.9k |
| 6 | `runMultiYearTax` | 19084 | Flat rate, 100% SS, +2 breakeven | $200k taxable at 37% → fed tax < $48k; `breakeven − age ≠ 2`; SS-taxable ≤ 85% |
| 7 | `computeStrategyLifetime` SS | 10905 | Dropped pre-claim years; impossible spousal credits | staggered-claim strategy total == year-by-year reconstruction within $1 |
| 8 | RMD age by cohort | 10789 | Age 73 for post-1960 clients | client born 1965 → first RMD row age == 75 |
| 9 | `computeMultiYearCashFlow` drawdown | 15061 | Portfolio income immune to deficits | income $1M / expenses $2M / 15yr → yr-15 income < yr-1; cumNet reconciles with balance |
| 10 | ILIT premium schedule | 8539 | 5-pay modeled as 10-pay | single 5-pay $500k → `ilitTotalPremiums == 2,500,000` |

Plus a **stale-constant tripwire**: one table-driven test asserting every constant above against a single `TAX_CONSTANTS[year]` source (today fails on WA/CT/NY, 831(b), HSA, std-deduction, AMT-2026, 401(k) label, sunset scenario).

---

## 5. What I did NOT verify (blind spots)

- **Live 2026 tax law.** Whether $15M/OBBBA figures are actually current is at the edge of model knowledge — two agents disagreed. The structural findings hold; the specific "correct" numbers need counsel sign-off.
- **Runtime behavior.** All findings are from *static* reading. None were reproduced in a browser with real inputs — the failure scenarios are traced, not executed. A few PLAUSIBLE items (F17 Plaid view, F23 volatility drag, F28 education) specifically need a runtime repro.
- **Supabase dashboard state.** Whether "allow new signups" is on, whether `team_members` is seeded, whether RLS is actually enabled on every table, and the true migration run-order in production — all determine whether F4/F6/F18 are live or latent. Verify in the Supabase console.
- **The estate ladders I didn't sample.** IDGT, QPRT, SCIN, NIMCRUT, Family-LLC deterministic walks were spot-checked as sound but not exhaustively pinned.
- **The QIR sub-apps** (`qir/`, `pyle-quarterly-simple/`) were out of scope for Pass 1 — they have their own compute paths and are reviewed in Pass 2.
- **Third-party/CDN integrity** beyond confirming SRI hashes exist; no audit of the pinned library versions for known CVEs.
- **PDF/PPTX numeric fidelity** — whether exported documents match on-screen figures was not traced end-to-end.

---

*Next: Pass 2 (Architecture & Product) takes this report as input to sequence the 90-day roadmap — engine extraction must precede the test pins above.*
