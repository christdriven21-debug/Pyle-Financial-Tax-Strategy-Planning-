# Vendor Management Policy

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]

## Purpose

Identify every third party that processes, stores, or transmits client
data; verify each maintains adequate security controls; document the
data-flow boundary so SOC 2 auditors and SEC examiners can trace it.

## Vendor inventory

| Vendor | Service | Data processed | Sub-processor of | SOC 2 / equivalent |
|---|---|---|---|---|
| **Vercel** | Hosting + serverless functions | All HTTP traffic; environment vars | Cloudflare, AWS | SOC 2 Type II ([trust.vercel.com](https://trust.vercel.com)) |
| **Supabase** | PostgreSQL DB + Auth + Storage | Plans, audit log, documents, sessions | AWS | SOC 2 Type II ([supabase.com/security](https://supabase.com/security)) |
| **Anthropic** | LLM API (Claude) | Plan context strings sent for AI Q&A; tax-doc PDFs for OCR | AWS | SOC 2 Type II ([trust.anthropic.com](https://trust.anthropic.com)) |
| **Plaid** | Bank/brokerage aggregation | OAuth tokens, account balances | AWS | SOC 2 Type II ([plaid.com/legal](https://plaid.com/legal/#privacy)) |
| **Sentry** | Error monitoring | JS exception payloads (PII-scrubbed via beforeSend hook) | AWS | SOC 2 Type II ([sentry.io/security](https://sentry.io/security)) |
| **Resend** | Transactional email | Recipient email + branded subject + body | AWS SES | SOC 2 Type II ([resend.com/legal](https://resend.com/legal)) |
| **GoDaddy** | Domain registration + DNS | DNS records only | — | Not applicable — no client data |
| **GitHub** | Source control | Code only — no client data | — | SOC 2 Type II |
| **Schwab** (planned) | Custody data | OAuth tokens, account positions | Schwab | Internal SOX 404 / FINRA |

## Onboarding a new vendor

Before any new vendor processes client data:

1. **Privacy review** — read the vendor's privacy policy + DPA. Verify
   they don't sell or further share data.
2. **Security review** — request their most recent SOC 2 Type II report
   under NDA. Read the auditor's qualified-opinion section. Note any
   exceptions.
3. **Data classification** — what specific fields will be sent to this
   vendor? Are any of them Confidential under our classification scheme?
4. **DPA execution** — Data Processing Agreement signed before any
   production data flows.
5. **Add to inventory** — update the table above.
6. **Add to incident playbook** — escalation contact + status page in
   `03-incident-response-plan.md`.

## Annual review

For each vendor on the inventory, every 12 months:

1. Re-request the SOC 2 Type II report (most vendors update annually).
2. Verify their service status (still operating, no breach disclosure).
3. Compare list of sub-processors against last review — any new ones?
4. Confirm DPA still in force.
5. Document the review date in this file.

## Data minimization

Per Reg S-P, only send data to vendors that strictly need it.

| Vendor | Data we send | Data we DON'T send |
|---|---|---|
| Anthropic | Plan numeric values, strategy choices, plan-context string | SSN, full address, account numbers, tax-doc PII (extraction prompt scrubs) |
| Sentry | JS error stack traces; URL path | Plan data (scrubbed via `beforeSend`); SSN; financial amounts (scrubbed) |
| Resend | Recipient email; firm-branded body | No client financial data in email body — deep-link only |
| Plaid | User UUID; institution selection (no SSN sent by us) | All financial data flows direct Plaid → user, never staged on our infra |
| Supabase | Plan data (Confidential — encrypted at rest by Supabase) | — (single source of truth) |

## Vendor termination

If a vendor relationship ends:

1. Export all firm data from their platform within 30 days
2. Confirm the vendor deletes our data per their retention policy
   (most are 30-90 days post-termination)
3. Document deletion confirmation in the compliance binder
4. Update inventory table — mark vendor as "Terminated [DATE]"

---

## Notes on specific vendors

### Anthropic — special considerations

- API requests do **not** train future models (Anthropic's stated policy
  for paid API customers). Verify in latest commercial Privacy Policy.
- We use Claude vision for tax-doc OCR; the document itself transmits
  to Anthropic. Our extraction prompt explicitly tells Claude not to
  return SSN or full address — but the input PDF passes through.
  Acceptable per data-minimization analysis: client has consented to
  professional review of the document, and Anthropic is contractually
  bound not to retain or train on it.

### Plaid — token storage

- Plaid `access_token` is stored in `plaid_items` with RLS forcing
  `service-role only` on writes. Client side never reads this column.
- Tokens are revoked at Plaid (via `/item/remove`) when a user
  disconnects an institution.

### Supabase — encryption

- Encrypted at rest (AES-256, AWS KMS).
- Encrypted in transit (TLS 1.2+).
- Backups encrypted with same KMS keys.
- PITR (7-day window on Pro plan) enabled.

### Sentry — PII scrubbing

- Custom `beforeSend` hook scrubs dollar amounts and SSN-like patterns
  from event payloads before they leave the browser.
- Default Sentry data scrubbing also applies (passwords, tokens, etc.).
- Confirm in Sentry dashboard: Settings → Security & Privacy → Data
  scrubbing rules cover what we expect.

---

*This policy aligns with SEC Reg S-P, FINRA Rule 3110, and the AICPA
SOC 2 vendor-management criteria (CC9.2).*
