# Employee Onboarding & Offboarding Policy

**Owner:** [ADVISOR]
**Last reviewed:** [DATE]
**Next review:** Annually

## Purpose

Ensure that every person who handles client data at Pyle Financial
Services is qualified, vetted, contractually bound to confidentiality,
trained on security expectations, and promptly removed from all systems
when they leave. Aligns with SOC 2 CC1.4 (workforce qualifications +
background checks) and CC6.2 (logical access provisioning + removal).

## Scope

Applies to all personnel with logical or physical access to client data:
- Full-time employees
- Part-time employees
- Contractors / 1099 advisors
- Interns
- Outsourced vendors with named human access (e.g., bookkeeper, CPA
  reviewing client returns)

Does **not** apply to vendor sub-processors who never touch raw client
data (Vercel infrastructure staff, Supabase DBAs, etc.) — those are
governed by `04-vendor-management-policy.md`.

## Solo-practice context

Pyle Financial Services currently operates as a single-advisor practice.
This policy documents the workflow that applies the moment a second
person is brought into the firm. While solo, the advisor performs all
roles below and self-attests annually that no additional access has
been granted.

## Pre-hire — qualification & vetting

### Required before any offer is extended

- [ ] Resume + work-history verification (most recent 2 employers
      contacted)
- [ ] FINRA BrokerCheck / IAPD lookup for any RIA-registered candidate
- [ ] Identity verification (government ID; passport or driver's license)
- [ ] Educational credential verification if claimed (CFP®, CFA, JD,
      CPA — confirm with issuing body)

### Required before access is provisioned

- [ ] Criminal background check (national + counties of residence past
      7 years) — via a CRA-compliant vendor (e.g., Checkr, GoodHire)
- [ ] Credit check (only for personnel handling client funds —
      not required for plan-builder users who never touch custody)
- [ ] Reference check — minimum two professional references contacted
- [ ] FINRA fingerprinting if registering as IAR with state
- [ ] State RIA registration filed if required
- [ ] Confirmation that no statutorily disqualifying events exist (per
      Investment Advisers Act § 203(e))

Adverse findings: documented, reviewed by [ADVISOR], decision recorded.
Records retained for 7 years per Rule 204-2.

## Onboarding checklist

Run within the first business day. Track completion in the personnel
binder.

### Day 1 — paperwork

- [ ] Signed offer letter / contractor agreement
- [ ] Confidentiality / NDA agreement signed
- [ ] Acceptable Use Policy (AUP) signed
- [ ] Code of Ethics (firm) signed + acknowledged annually
- [ ] Personal-trading policy acknowledged (if registered IAR)
- [ ] Form ADV Part 2B brochure-supplement information collected
- [ ] Federal/state tax forms (W-4, W-9, state equivalents)
- [ ] Direct-deposit form
- [ ] Emergency contact form

### Day 1 — security awareness

- [ ] Live walk-through of `02-access-control-policy.md`
- [ ] Live walk-through of `03-incident-response-plan.md`
- [ ] Live walk-through of `05-data-retention-policy.md`
- [ ] Phishing-awareness briefing (firm-specific examples shown)
- [ ] Password-manager setup with firm-issued vault
- [ ] Hardware MFA / passkey enrolled for email + Vercel + Supabase
- [ ] Personal device allowlist confirmed (BYOD acceptable; full-disk
      encryption required; auto-lock ≤5 min)

### Day 1 — system access

Provisioned only after all paperwork is signed.

- [ ] Firm email account created (`*@pfs4u.com`)
- [ ] Email-account 2FA enforced (passkey preferred)
- [ ] Magic-link sign-in to Plan Builder verified once
- [ ] Added to `public.team_members` per access-control policy
- [ ] Added to firm password manager with role-appropriate vaults
- [ ] Added to Vercel project (Viewer for analysts, Member for
      developers, Owner only for [ADVISOR])
- [ ] Added to Supabase project (Read-only for analysts, Developer for
      engineers, Owner only for [ADVISOR])
- [ ] Added to Sentry organization (Member with read-only by default)
- [ ] Added to GitHub organization (Read for analysts, Write for
      developers; branch protection prevents direct main pushes)
- [ ] Added to incident-response notification channel

### Within 30 days

- [ ] Completed annual security-awareness training (KnowBe4, Hoxhunt,
      or equivalent) — record completion certificate in personnel file
- [ ] Read all SOC 2 policy documents (`docs/soc2/*.md`); signed
      attestation that policies were read + understood
- [ ] First periodic access review attended (observed if pre-quarter)
- [ ] Shadowed [ADVISOR] through one full client onboarding flow

## Role assignment

Roles align with `02-access-control-policy.md`. Principle of least
privilege.

| Role | Plan Builder | Vercel | Supabase | GitHub | Justification |
|---|---|---|---|---|---|
| Advisor (registered IAR) | Team | Member | Developer | Write | Daily client work |
| Operations / paraplanner | Team | Viewer | Read-only | Read | Plan prep, no deploys |
| Engineer / developer | Team | Member | Developer | Write | Code + schema changes |
| Compliance | Team | Viewer | Read-only | Read | Audit-log review |
| Bookkeeper / external CPA | None (no PII access) | None | None | None | Out of scope |

Role changes (promotion, function change) follow the same
provisioning/deprovisioning flow as a fresh hire/depart for any
elevated access being granted or removed.

## Ongoing requirements

- Annual security-awareness training — every team member, certificate
  filed in personnel record
- Annual Code of Ethics re-acknowledgment
- Annual review of personnel-file completeness during the firm's
  compliance review
- Quarterly access review per `02-access-control-policy.md` (matches
  team_members + Vercel + Supabase + GitHub member lists against
  current personnel roster)
- Suspicious-activity reporting: any team member who suspects a
  security event reports immediately per the incident-response plan;
  no retaliation policy applies

## Offboarding checklist

Triggered the moment notice of departure is given (voluntary or
involuntary). For involuntary terminations, steps 1–6 are completed
**before** the termination conversation begins.

### Within 1 hour of effective departure

- [ ] Remove from `public.team_members`
      ```sql
      delete from public.team_members where user_id = '<uuid>';
      ```
- [ ] Revoke Supabase project membership
- [ ] Revoke Vercel project membership
- [ ] Revoke GitHub organization membership
- [ ] Revoke Sentry organization membership
- [ ] Revoke password-manager vault access
- [ ] Force sign-out across all sessions: Supabase Dashboard →
      Authentication → Users → revoke
- [ ] Disable firm email account (cannot request new magic links)
- [ ] If they held any privileged secrets in memory: rotate the
      affected env vars (Supabase service-role key, Anthropic key,
      Plaid key, Resend key, Sentry DSN, CRON_SECRET)

### Within 24 hours

- [ ] Recover firm-issued hardware (laptop, YubiKey, phone if firm-owned)
- [ ] Wipe firm-issued hardware via MDM or factory reset
- [ ] Forward firm email to [ADVISOR] for ≤90 days; then archive +
      delete the mailbox
- [ ] Update Form ADV Part 2B brochure-supplement listing if the
      departed person was a registered IAR (file amendment within 30
      days per state)
- [ ] If state-registered IAR: file U-5 termination notice (10
      business days)
- [ ] Document offboarding in audit log:
      ```sql
      insert into public.audit_log (action, payload)
      values ('team.deprovisioned',
              jsonb_build_object('user_id','<uuid>',
                                 'reason','<voluntary|involuntary>',
                                 'date',now()));
      ```

### Within 7 days

- [ ] Conduct exit interview (voluntary departures only) — focus on
      whether any security/compliance concerns were ever observed but
      not reported
- [ ] Confirm departing person retained no firm property — signed
      attestation
- [ ] Remind departing person of continuing NDA + non-solicit
      obligations in writing
- [ ] Update org chart + Form ADV Part 1 schedules if material

### Within 30 days

- [ ] Final access-review sweep: confirm no orphaned accounts in any
      vendor system
- [ ] Confirm departed person is not in any password-manager vault
- [ ] Confirm any shared documents owned by them have been transferred
      to a current team member
- [ ] File departure record in personnel binder; retain 7 years

## Records retention

| Record | Retention | Storage |
|---|---|---|
| Background check report | 7 years from termination | Locked file (HR vault) |
| Signed agreements (offer, NDA, AUP, ethics) | 7 years from termination | Personnel binder + encrypted cloud copy |
| Training certificates | 7 years | Personnel binder |
| Access-provisioning checklist (signed) | 7 years from deprovisioning | Compliance binder |
| Offboarding checklist (signed) | 7 years from deprovisioning | Compliance binder |
| Exit interview notes | 7 years | Personnel binder |

Personnel records are Confidential per `05-data-retention-policy.md`
and are not stored in the Plan Builder platform.

## Disciplinary process

Violations of this policy or the Code of Ethics trigger:

1. Written warning + remediation plan for first minor violation
2. Suspension of elevated access pending review for repeated or
   moderate violations
3. Termination + full offboarding flow + regulatory disclosure (if
   reportable under § 203(e) or state rules) for material violations

The advisor or designated compliance officer documents every step.
Records are retained 7 years.

## Annual review

Each year, [ADVISOR] reviews:
- This policy (update if regulatory landscape or firm size has changed)
- Each team member's training records
- Each team member's access matches their current role
- That all departures from the prior year completed the full checklist
- That no orphaned access exists in any vendor system

Document the review date below.

## Review log

| Date | Reviewer | Findings |
|---|---|---|
| | [ADVISOR] | |

---

*This policy satisfies AICPA SOC 2 criteria CC1.4 (Workforce
Competence + Background Checks) and CC6.2 (Logical Access
Provisioning + Removal), and aligns with SEC Rule 204-2 (Books and
Records) personnel-file retention.*
