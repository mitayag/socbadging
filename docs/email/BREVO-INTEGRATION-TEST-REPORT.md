# Brevo Integration Test Report

**Date:** 2026-11-02  
**External email:** Not enabled. No real email sent.  
**Local transport:** Mailpit (`http://127.0.0.1:8025`)

## Configuration validation

- Mailpit remains the default.
- Brevo mode fails closed unless `EXTERNAL_EMAIL_ENABLED=true`.
- Brevo mode requires username/password and a non-empty allowlist.
- Brevo port is restricted to 587.
- STARTTLS is required; certificate verification is enabled.
- Sender is `HAU SOC Badging System <badges@hausoc.org>`.
- Webhook is disabled by default and requires a secret when enabled.

## Automated tests

| Gate                | Result                           |
| ------------------- | -------------------------------- |
| Format              | PASS                             |
| Lint                | PASS                             |
| Typecheck           | PASS                             |
| Unit                | 112 files / 798 tests PASS       |
| MariaDB integration | 17 files / 113 tests PASS        |
| Production build    | PASS                             |
| Playwright E2E      | 46 passed / 0 failed / 0 skipped |
| Migration parity    | PASS — no difference             |
| Production audit    | 0 critical / 0 high / 7 moderate |

Focused Brevo/Mailpit tests:

- Email delivery config defaults and fail-closed Brevo validation.
- Allowlist normalization and recipient denial.
- Worker delivery-channel filtering.
- Non-allowlisted Brevo recipient fails without SMTP send.
- Brevo webhook signature verification, idempotency, replay, and suppression.
- Provider-neutral bounce/complaint contract.
- Resend refusal across delivery channels.

## Mailpit verification

- Worker and Mailpit containers were healthy.
- Default `mailpit` transport was used.
- A resend was queued and the worker processed it.
- Mailpit message count increased from 3 to 4.
- No external SMTP connection was made.

## Remaining limitations

- No real Brevo test was performed; external delivery remains disabled.
- Brevo webhook route and suppression persistence are not wired.
- Provider-specific webhook signature/header must be confirmed.
- Remaining moderate ExcelJS-chain advisories remain.
- `SENT` still means SMTP accepted, not inbox delivery.
