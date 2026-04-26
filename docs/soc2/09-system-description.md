# System Description

**Document version:** 1.0
**Last reviewed:** [DATE]

This is the technical narrative SOC 2 auditors expect at audit kickoff.
It describes the platform, its boundaries, and the controls that operate
within it.

---

## Service description

The Pyle Financial Services Plan Builder ("the Platform") is a web-based
financial-planning application provided to the firm's HNW clients and
used internally by firm advisors to model wealth-transition strategies
including business sales, retirement planning, multi-generational
estate planning, and concentrated-stock hedging.

The Platform is delivered as a single-page web application hosted on
Vercel, backed by a Supabase Postgres database with Row-Level Security,
with optional integrations to Anthropic Claude (AI), Plaid (account
aggregation), Sentry (error monitoring), and Resend (transactional
email).

## In-scope systems

| System | Provider | Role |
|---|---|---|
| Web app | Self-hosted on Vercel | Single-page React-free vanilla JS app |
| Serverless functions | Vercel | `/api/*` endpoints (auth, AI proxy, Plaid, Schwab, notifications, tax-doc OCR) |
| Database | Supabase Postgres (Pro plan) | All client plans, documents, audit log |
| Auth | Supabase Auth (Magic Link) | Passwordless email-link sign-in |
| Storage | Supabase Storage | Client-uploaded documents (private bucket) |
| Error monitoring | Sentry | JS exception capture + performance |
| Email | Resend | Branded transactional notifications |
| AI | Anthropic Claude API | Plan Q&A, meeting prep, narrative polish, tax doc OCR |
| Bank aggregation | Plaid | OAuth flow + balance refresh |
| Brokerage aggregation | Schwab | OAuth flow + position refresh |
| Source control | GitHub | Code repository + change history |

## Out of scope

- Client-side browsers (controlled by client)
- Client home networks (controlled by client)
- Vendor sub-processors (transparent to us; vendors maintain their own SOC 2)
- Email infrastructure (Resend handles delivery)
- Marketing website (separate WordPress on pylefinancialservices.com)

## System boundaries

**Trust boundary 1**: Client browser ↔ Vercel edge
- All traffic over HTTPS (TLS 1.2+)
- HSTS enforced (2-year max-age + preload)
- CSP restricts script + connect sources

**Trust boundary 2**: Vercel ↔ Supabase
- Service-role key in Vercel env vars (never client-side)
- Anon key in `config.js` (public; RLS enforced server-side)

**Trust boundary 3**: Vercel serverless ↔ third-party APIs
- API keys in Vercel env vars
- Outbound HTTPS only

## Components

### Frontend (`index.html`)

Single ~16,000-line HTML file. Vanilla JS, no build step. Loads:
- Chart.js (CDN, SRI-pinned) for canvas charts
- Supabase JS SDK (CDN, SRI-pinned) for auth + queries
- html2pdf, html2canvas, jsPDF (CDN, SRI-pinned) for PDF export
- DOMPurify (CDN, SRI-pinned) to sanitize AI-returned HTML
- pptxgenjs (CDN, SRI-pinned) for PowerPoint export
- Sentry browser SDK (CDN, SRI-pinned, conditional load) for error monitoring

State held entirely in DOM + `window.__PLAN_DATA__`. No global state
manager.

### Backend (Vercel serverless)

Per-route Node.js functions in `/api/`:
- `_lib/auth.js` — shared JWT verification + origin allowlist
- `ask-plan.js` — Anthropic proxy for client/advisor Q&A
- `meeting-prep.js` — Anthropic proxy for advisor briefings
- `polish-narrative.js` — Anthropic proxy for narrative polish
- `extract-tax-doc.js` — Anthropic vision proxy for 1040/K-1 OCR
- `notify.js` — Resend email proxy (server-templated, recipient-validated)
- `plaid/*` — link-token, exchange, balances, trends, sync-balances (cron)
- `schwab/*` — authorize, callback, accounts, disconnect

Every route requires a valid Supabase JWT + origin allowlist match.
`userId` always derived from verified JWT, never trusted from request body.

### Database (Supabase Postgres)

Tables (all with RLS enabled):
- `plans` — client plans
- `plan_reviews` — advisor comments
- `plan_documents` — file metadata
- `audit_log` — append-only event log
- `plaid_items` — Plaid OAuth tokens (service-role only)
- `plaid_balance_snapshots` — historical balances
- `team_members` — explicit advisor allowlist

Triggers:
- `trg_plans_audit` — auto-logs plan create/update/delete
- `trg_documents_audit` — auto-logs document upload/delete
- `trg_audit_log_force_actor` — overwrites client-supplied actor
  fields with JWT identity (forgery prevention)

### Storage (Supabase Storage)

Bucket: `plan-documents` (private, 50MB file size limit). RLS policy
requires upload path to start with a plan UUID the user can access.

## Information flow

1. **Client signs in** via magic link → Supabase Auth issues JWT
2. **Browser stores JWT** in localStorage; all requests carry it
3. **Plan view loaded** → `sb.from('plans').select(...)` → RLS scopes
   to user's plans
4. **Plan generated** locally — pure JS computation, no server call
5. **Plan saved** → `sb.from('plans').upsert()` → trigger writes audit log
6. **AI Q&A** → `authedFetch('/api/ask-plan')` → Vercel verifies JWT →
   sends to Anthropic → response sanitized via DOMPurify before render
7. **Document upload** → Supabase Storage upload (RLS-checked path) +
   metadata insert → trigger writes audit log
8. **Plaid refresh** → `authedFetch('/api/plaid/balances')` → Vercel
   reads `plaid_items` (service-role) → calls Plaid → returns balances

## Security controls

See `01-control-matrix.md` for full SOC 2 mapping.

Key technical controls:
- JWT bearer auth on every privileged API call
- Origin allowlist (`pyle-planning.vercel.app`) on all `/api/*`
- RLS on every Supabase table (default deny)
- DOMPurify on AI-returned HTML (prompt-injection defense)
- HTML escaping on every user-controlled string in render templates
- HMAC-signed Schwab OAuth state + nonce cookie (CSRF defense)
- Schwab tokens scoped to Supabase user via signed cookie
- CSP, HSTS, X-Frame-Options, Permissions-Policy headers
- SRI on all CDN scripts
- Append-only audit log (no UPDATE/DELETE policy)
- BEFORE-INSERT trigger forces actor identity from JWT
- 30-minute idle timeout + 24-hour Supabase JWT TTL
- Sentry `beforeSend` hook scrubs $ amounts and SSN patterns

## Subject matter

The audit covers the system as described above for the period
[START DATE] through [END DATE].

## Complementary user-entity controls

The audit may identify controls that *clients* are responsible for:

- Maintaining the security of their email account (the magic-link
  delivery target)
- Reporting suspected unauthorized access to the firm
- Not sharing magic-link emails with others
- Keeping their browser and OS up to date

These are documented in client-onboarding materials.

## Subservice organizations

The Platform relies on subservice organizations (vendors) — see
`04-vendor-management-policy.md`. The audit assumes these vendors
maintain their stated SOC 2 controls; the firm independently verifies
this annually by reviewing each vendor's most recent SOC 2 Type II
report.

---

*This system description is reviewed annually + after any material
architecture change.*
