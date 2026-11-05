# Stage 5C Email Readiness Report

**Date:** 4 November 2026  
**Environment:** Local development only  
**External email sent:** No

## Status matrix

| Area                                 | Implemented   | Locally tested    | Externally verified   | Blocked / pending                           |
| ------------------------------------ | ------------- | ----------------- | --------------------- | ------------------------------------------- |
| Mailpit development transport        | Yes           | Yes               | N/A                   | N/A                                         |
| Brevo SMTP mode                      | Yes           | Yes (config/unit) | No                    | Credentials, sender domain, sender approval |
| Env validation                       | Yes           | Yes               | N/A                   | Production values not configured            |
| Queue/worker/retry                   | Yes           | Yes               | No provider-level run | Brevo acceptance run pending authorization  |
| SMTP acceptance vs provider delivery | Yes           | Yes               | No                    | Provider webhook registration               |
| Bounce/complaint status recording    | Yes           | Yes               | No                    | Provider webhook registration               |
| Recipient suppression                | Contract only | Contract tests    | No                    | **Not wired to the Brevo webhook path**     |
| Controlled acceptance allowlist      | Yes           | Yes               | No                    | Authorized recipient pending approval       |
| Brevo webhook secret                 | Yes (config)  | Unit tests        | No                    | Secret and provider registration pending    |

## Configuration audit

The local `.env` uses the default Mailpit path:

- `EMAIL_DELIVERY_MODE` is not set; Mailpit is the default.
- `EXTERNAL_EMAIL_ENABLED` is not enabled.
- No Brevo SMTP username/password is configured.
- `EXTERNAL_EMAIL_ALLOWLIST` is empty.
- `BREVO_WEBHOOK_ENABLED` is not enabled; no webhook secret is configured.
- `SMTP_HOST` is empty; Compose defaults to the `mailpit` service on port 1025.
- No real sender domain is configured; the repository default sender is the example
  `badges@hausoc.org` address.

No SMTP credentials, API keys, or webhook secrets were printed.

## Implementation findings

- `loadEmailDeliveryConfig` requires Brevo mode to have `EXTERNAL_EMAIL_ENABLED=true`,
  port 587, STARTTLS, certificate verification, SMTP credentials, and a non-empty allowlist.
- `loadSmtpConfig` rejects partial credentials and requires `SMTP_HOST`/`SMTP_FROM` in
  production.
- The worker separates queue status (`PENDING`/`PROCESSING`/`RETRY_SCHEDULED`/`SENT`/`FAILED`)
  from provider status (`ACCEPTED`/`DELIVERED`/`DEFERRED`/`BOUNCED`/`BLOCKED`/`INVALID`/
  `COMPLAINT`).
- Retry backoff, bounded attempts, claim leases, attempt history, and Administrator retry are
  implemented and tested.
- Controlled acceptance mode prevents non-allowlisted external recipients from receiving
  email.
- Webhook delivery events update provider status and handle out-of-order/duplicate/stale
  events, but **recipient suppression is not wired to the webhook route**. A hard bounce or
  complaint is recorded as provider status; it does not automatically block future sends or
  resends.

## Local evidence

- Mailpit contains badge-issued and password-reset messages.
- A local badge-issued email linked to a public credential that rendered successfully.
- The notification delivery row was `SENT` via `mailpit` with provider status null, as
  expected without a Brevo webhook.

## Readiness

**Local email implementation: PASS.**  
**Production Brevo readiness: BLOCKED** pending sender-domain verification, SPF/DKIM/DMARC,
Brevo credentials/sender approval, webhook registration, authorized recipient allowlist, and
recipient-suppression enforcement.
