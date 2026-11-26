# Production Test-Account and Playwright Acceptance Procedure

**Date:** 24 November 2026  
**Production:** https://socbadging.hausoc.org  
**Status:** Preparation only — no production accounts or tests created/performed

## 1. Safety boundary

Do **not** run the existing local Playwright suite against production. Its global setup expects a
disposable database and `E2E_CONFIRM_DISPOSABLE_DATABASE=true`; it truncates fixture tables and is
unsafe for production.

Production acceptance requires a separate production-safe runner with:

- no database truncation;
- dedicated isolated accounts/class/badge;
- no access to real students, faculty, administrators, or credentials;
- explicit production-write approval;
- one authorized external recipient only: `authorized-test-recipient@example.org`.

## 2. Required approvals

- [ ] Production test-account/class/badge creation.
- [ ] Production Playwright/non-destructive write window.
- [ ] One live email to `authorized-test-recipient@example.org`.
- [ ] Named operator, observer, rollback owner, and window.
- [ ] Current backup/restore evidence and signing-key risk acceptance.
- [ ] Worker healthy, queue empty, notifications ready.
- [ ] Production test runner reviewed and approved.

## 3. Test accounts and data

Use the existing plan in `PRODUCTION-TEST-ACCOUNT-PLAN.md`:

```text
test.admin@hausoc.org
test.faculty@hausoc.org
authorized-test-recipient@example.org
TEST-FAC-001
TEST-STU-001
TEST-ISO-001 / Automated Testing — Isolated
```

Rules:

- Passwords generated randomly and stored only in the approved secret store; never in chat, logs, or
  Git.
- If an account exists with unexpected role/status, stop; do not reset or modify it without approval.
- Student activation must use the existing create → invite → activate flow without sending email.
- The test badge and class are isolated; no real roster/class is modified.
- Do not use a real student address for any outbound email.

## 4. Production-safe test sequence

### 4.1 Read-only/public

- `/login` 200; TLS valid; security headers present.
- `/api/health` web/database/signer ready; notifications ready after worker recovery.
- Issuer, key, and signed status list 200 and unchanged.
- Existing public credential verification/download/QR remains valid.

### 4.2 Administrator

- Login/logout and session invalidation.
- Dashboard cards and responsive layout.
- Faculty/student create/edit/disable/reset.
- Class and badge create/edit/issue.
- Issuance, duplicate prevention, revocation.
- Audit logs, search, filters, pagination.
- Unauthorized route/resource denial.

### 4.3 Faculty

- Login/logout.
- Only assigned classes visible.
- Roster/student management and password-reset permissions.
- Badge creation/issuance.
- Class-scoped credential visibility; cross-class denial.
- Audit actions.

### 4.4 Student

- Login/logout; password reset/activation.
- Dashboard, My Badges, status filtering.
- Credential detail, JSON-LD/image/PDF/QR downloads.
- Public verification link and social sharing/Open Graph.
- Ownership isolation: another student’s credential returns not found.

### 4.5 Credential lifecycle

- Create → issue → sign → verify → status list.
- JSON-LD/proof/download/QR.
- Revocation and immutable history.
- Expiration behavior.
- Duplicate issuance prevention.
- Notification row, delivery tracking, retry, duplicate guard.
- One authorized email only after separate approval.

### 4.6 UI/UX

- Desktop, tablet, mobile.
- Scrollable tables, pagination, search, sorting.
- Form validation, modals, navigation, empty/error states.
- Accessibility checks (labels, focus, keyboard, headings).
- No horizontal overflow at 390 px.

## 5. Evidence

Record for each test:

- timestamp, account role, URL, action, expected/actual;
- screenshot/trace only for test data; redact PII/secrets;
- public credential ID, audit ID, notification ID, provider event (redacted);
- test result PASS/FAIL/BLOCKED;
- cleanup state.

Do not store passwords, cookies, tokens, SMTP credentials, or private keys in evidence.

## 6. Pilot email (separate approval)

After worker recovery and production acceptance:

1. Confirm `authorized-test-recipient@example.org` authorization and window.
2. Confirm queue empty and Brevo staging allowlist.
3. Issue one isolated test badge.
4. Verify exactly one email, content, links, public credential, provider event.
5. No resend/retry unless separately approved.
6. Preserve the test credential; revoke only with separate approval because revocation may send another
   notification.

## 7. Cleanup

- Suspend test accounts; archive isolated class.
- Revoke only the isolated test credential if approved.
- Retain audit logs and delivery history; do not delete.
- Remove temporary password files after the window.
- Restore production email policy only under the approved change procedure.

## 8. Acceptance exit criteria

- All production gates PASS or explicitly accepted with documented residual risk.
- No unauthorized recipient/email.
- Queue/heartbeat healthy after observation.
- Backups and rollback evidence current.
- Security findings have owners.
- Final acceptance report signed by operator/observer/owner.

No production test account or email was created in preparing this procedure.
