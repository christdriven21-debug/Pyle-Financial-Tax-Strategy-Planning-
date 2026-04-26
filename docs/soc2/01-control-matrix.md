# Control Matrix — Pyle Financial Services Plan Builder

Mapping of AICPA Trust Service Criteria (2017) to controls implemented
in this platform.

| TSC Ref | Criterion | Control | Evidence Location |
|---|---|---|---|
| **CC1.1** | Demonstrates commitment to integrity & ethical values | RIA Code of Ethics; SEC Form ADV Part 2A & 2B on file | Firm compliance binder |
| **CC1.2** | Board oversight | Single-advisor practice; ownership documented in ADV | ADV Part 1A |
| **CC1.3** | Org structure | Roles documented in `08-employee-onboarding-offboarding.md` | This package |
| **CC1.4** | Competence + background checks | CFP / Series 65 / state RIA license; CE log; pre-hire vetting per `08-employee-onboarding-offboarding.md` | License certificates; personnel binder |
| **CC1.5** | Accountability | Audit log captures every plan change with actor + timestamp | Live: `audit_log` table; UI panel |
| **CC2.1** | Quality information communicated internally | Plan changes auto-logged; advisor reviews via Audit Log panel | Live UI |
| **CC2.2** | Information communicated externally | Magic-link emails, plan deliverable PDFs, scheduled reviews | `branded magic-link.html`; PDF exports |
| **CC2.3** | Communication with regulators | Form ADV annually; books & records under Rule 204-2 | SEC IARD |
| **CC3.1-CC3.4** | Risk assessment | This package + readiness vendor scan | Vanta/Drata/SecureFrame scan |
| **CC4.1-CC4.2** | Monitoring activities | Sentry error monitoring + status page (`/status.html`) | Sentry dashboard |
| **CC5.1-CC5.3** | Control activities | RLS policies, JWT auth, append-only audit, DOMPurify | `supabase/*.sql`; `index.html` |
| **CC6.1** | Logical access controls | Supabase Auth (magic-link) + JWT verification on every API call | `api/_lib/auth.js` |
| **CC6.2** | Authentication, user identification, provisioning | Magic-link via verified email; team-membership table; onboarding checklist gates access | `add_auth.sql`, `security_hardening_2.sql`, `08-employee-onboarding-offboarding.md` |
| **CC6.3** | Authorization to access information assets | Row-level security (RLS) on every Supabase table | `supabase/*.sql` |
| **CC6.4** | Restricting access during sessions | 30-min idle timeout in app + 24-hr Supabase JWT TTL | `index.html` (idle timer); Supabase Auth settings |
| **CC6.5** | Removing access for terminated users | `team_members` table; instant revocation by deleting row; offboarding checklist runs within 1 hour | `security_hardening_2.sql`, `08-employee-onboarding-offboarding.md` |
| **CC6.6** | Protecting against malicious code | CSP, SRI on all CDN scripts, DOMPurify on AI HTML | `vercel.json`, `index.html` |
| **CC6.7** | Restricting movement of information | Origin allowlist on /api/*, no public endpoints | `api/_lib/auth.js` |
| **CC6.8** | Detecting unauthorized access | Audit log captures every plan/document mutation | `audit_log` table |
| **CC7.1** | Detecting system vulnerabilities | Sentry captures runtime errors; quarterly dependency review | Sentry; package versions |
| **CC7.2** | Monitoring of unusual activity | Audit log + Sentry alerts | Live dashboards |
| **CC7.3** | Evaluating security events | Incident-response playbook | `03-incident-response-plan.md` |
| **CC7.4** | Recovering from incidents | Supabase PITR (7 days) + Vercel rollback (instant) | `06-business-continuity-plan.md` |
| **CC7.5** | Developing & testing recovery plans | Quarterly DR drill (documented) | DR drill log |
| **CC8.1** | Authorizing changes | All code changes via git; reviewed pre-deploy | GitHub commit history |
| **CC9.1** | Identifying & managing risks | Annual risk assessment review | This package |
| **CC9.2** | Vendor management | `04-vendor-management-policy.md` covers all 6 SaaS vendors | This package |
| **A1.1** | Maintaining current performance metrics | Vercel + Supabase + Sentry dashboards | Vendor dashboards |
| **A1.2** | Backup and recovery | Supabase PITR daily + on-demand snapshots | Supabase Pro |
| **A1.3** | Recovery testing | Quarterly DR drill | DR drill log |
| **C1.1** | Identifying & maintaining confidential information | Data classification: client PII = Confidential | `05-data-retention-policy.md` |
| **C1.2** | Confidential information disposal | 7-year retention then permanent delete (Rule 204-2) | `05-data-retention-policy.md` |
| **PI1.1** | Inputs are complete & accurate | Client-side input validation; server-side encoding (UUID, esc) | `index.html`, `api/_lib/auth.js` |
| **PI1.2** | Processing integrity | Audit log + DB triggers ensure mutations are logged with actor identity | `audit_log` triggers |
| **PI1.3** | Data is processed correctly | Tax math reviewed against authoritative sources (IRS pubs, statute) | Plan engine code comments |
| **PI1.4** | Output is complete & accurate | KPIs cross-verified across tabs; PDF export captures live values | UI |
| **P1.1-P8.1** | Privacy notice & consent | **GAP: needs formal Privacy Policy (Reg S-P alignment)** | TODO — engage RIA attorney |

## Identified gaps

1. **Privacy Policy + Notice** — currently informal. Needs formal SEC
   Reg S-P-aligned policy posted on the firm website. **Owner: [ADVISOR]
   + RIA-tech attorney. Target: 2 weeks.**
2. **Quarterly DR drill log** — process documented but no log of
   actual drills run. **Owner: [ADVISOR]. Target: First drill within 30 days.**
3. **Vendor SOC 2 reports on file** — need to obtain SOC 2 reports from
   Anthropic, Plaid, Vercel, Supabase. **Owner: [ADVISOR]. Target: 2 weeks.**

Last reviewed: [DATE]
