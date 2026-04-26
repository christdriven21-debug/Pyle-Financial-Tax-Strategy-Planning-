# SOC 2 Type I Prep Package — Pyle Financial Services Plan Builder

## What this is

A starter kit of policies, controls, and evidence collection guides
needed to begin a SOC 2 Type I audit. SOC 2 examines whether your
controls over **security, availability, processing integrity,
confidentiality, and privacy** are designed appropriately and (for
Type II) operating effectively over a period of time.

For an RIA-tech platform handling HNW client financial data, SOC 2
unlocks enterprise sales (large RIAs, family offices, broker-dealer
referral networks routinely require it) and signals operational
maturity to regulators.

## Status

| Trust Service Criterion | Status |
|---|---|
| **Security** (CC1-CC9) | Mostly designed — see 02-access-control + 03-incident-response |
| **Availability** (A1) | Designed via Vercel + Supabase PITR — see 06-business-continuity |
| **Confidentiality** (C1) | Designed via Supabase RLS + JWT auth + DOMPurify — see 02-access-control |
| **Processing Integrity** (PI1) | Designed via append-only audit log + DB triggers — see 09-system-description |
| **Privacy** (P1-P8) | Needs a formal Privacy Policy (Reg S-P alignment) — flagged |

## Recommended path to Type I (8-12 weeks)

1. **Week 1**: Engage a SOC 2 readiness vendor (Vanta, Drata, or
   SecureFrame). All three offer fixed-price packages; expect $15-30k
   for the first year + ~$8-15k for ongoing monitoring.
2. **Week 2-4**: They scan your stack (Vercel, Supabase, Sentry,
   Resend) and map findings to TSC categories. They flag gaps in
   the templates here.
3. **Week 5-8**: Close gaps. Most common: formal Privacy Policy
   (engage an RIA-tech attorney), explicit data classification,
   employee onboarding/offboarding workflows even for solo practice.
4. **Week 9-12**: SOC 2 auditor (separate from the readiness vendor)
   conducts the Type I exam. Outputs a SOC 2 Type I report you can
   share with prospects.

5. **Year 2**: Type II — same auditor revisits to confirm controls
   operated as designed over the prior 6+ months.

## Recommended vendors

**SOC 2 readiness platforms** (pick one):
- [Vanta](https://www.vanta.com) — most popular for early-stage SaaS
- [Drata](https://drata.com) — close second, strong RIA-friendly
- [SecureFrame](https://secureframe.com) — competitive on price

**RIA-tech attorneys** (for Privacy Policy + data agreement templates):
- [Hamburger Law Firm](https://hamburgerlaw.com)
- Jacko Law Group
- Core Compliance and Legal Services

**Cyber insurance brokers** (separately required):
- Embroker
- Coalition
- Berkley FinTech

## Files in this package

| # | File | Purpose |
|---|---|---|
| 01 | `01-control-matrix.md` | Trust Service Criteria mapped to your controls |
| 02 | `02-access-control-policy.md` | Who can access what; RLS, JWT, MFA |
| 03 | `03-incident-response-plan.md` | What to do when things go wrong |
| 04 | `04-vendor-management-policy.md` | Anthropic, Plaid, Vercel, Supabase, Resend, Sentry |
| 05 | `05-data-retention-policy.md` | How long client data is kept; deletion process |
| 06 | `06-business-continuity-plan.md` | DR via Supabase PITR + Vercel rollback |
| 07 | `07-change-management-policy.md` | How code changes ship safely |
| 08 | `08-employee-onboarding-offboarding.md` | When team grows beyond solo |
| 09 | `09-system-description.md` | The technical narrative auditors expect |
| 10 | `10-evidence-checklist.md` | Items to gather before audit kickoff |

Every document is a **template**. Customize the `[FIRM]`, `[ADVISOR]`,
and `[DATE]` placeholders, attach actual screenshots/configs as evidence,
and have your readiness vendor mark items complete as they verify them.

---

*Package generated April 2026. SOC 2 framework: AICPA Trust Services
Criteria, 2017 (latest). Update annually as controls evolve.*
