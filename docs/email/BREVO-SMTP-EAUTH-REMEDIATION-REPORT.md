# Brevo SMTP EAUTH Remediation Report

**Date:** 2026-11-02  
**Status:** PASS — corrected Brevo SMTP credentials authenticated successfully; no email transmitted.  
**External email transmitted:** No  
**Consumed Stage 3.3B attempt:** Preserved, not retried.

## Previous failure

The Stage 3.3B controlled attempt failed with `EAUTH`. The notification is `FAILED` and the durable submission attempt is `REJECTED` with safe code `EAUTH`. The attempt is permanently consumed.

## Private configuration verification

File:

`<private-brevo-env-file>`

| Check                                    | Result                                               |
| ---------------------------------------- | ---------------------------------------------------- |
| Directory mode                           | `0700`                                               |
| File mode                                | `0600`                                               |
| `BREVO_SMTP_USER` before correction      | Incorrect — did not match the Brevo dashboard login  |
| `BREVO_SMTP_USER` after correction       | `<redacted-brevo-smtp-username>`                     |
| Password modified                        | No                                                   |
| Password present                         | Yes                                                  |
| Password whitespace                      | None                                                 |
| Password surrounding quotes              | None                                                 |
| Password length                          | Within expected range                                |
| Password format                          | Consistent with a Brevo SMTP key (`xsmtpsib-` class) |
| `EMAIL_DELIVERY_MODE` in private file    | `mailpit`                                            |
| `EXTERNAL_EMAIL_ENABLED` in private file | `false`                                              |
| Allowlist                                | Exactly `authorized-test-recipient@example.org`      |
| Sender                                   | `HAU SOC Badging System <badges@hausoc.org>`         |
| Host/port                                | `smtp-relay.brevo.com:587`                           |
| STARTTLS / certificate verification      | Required / enabled                                   |
| Webhook                                  | Disabled                                             |

No credential values were printed or logged.

## Parser validation

The application parser was exercised in memory with Brevo mode and external delivery enabled only for validation; no application service was activated. The parser validation itself made no SMTP connection.

| Check                                          | Result |
| ---------------------------------------------- | ------ |
| Config accepted                                | PASS   |
| Username matches expected Brevo login          | PASS   |
| Username has whitespace                        | No     |
| Password present                               | PASS   |
| Password has whitespace                        | No     |
| Password has unexpected quotes                 | No     |
| Password format consistent with Brevo SMTP key | PASS   |
| Allowlist parsed as exactly one recipient      | PASS   |
| Host/port/TLS/sender parsed correctly          | PASS   |

## Authentication-only verification

A single SMTP authentication-only check was performed directly against Brevo. No application worker was used.

| Check                                  | Result                                   |
| -------------------------------------- | ---------------------------------------- |
| Timestamp                              | 2026-11-02 15:34:52–15:34:53 Asia/Manila |
| Host/port                              | `smtp-relay.brevo.com:587`               |
| TLS verification                       | Enabled                                  |
| STARTTLS                               | PASS — SMTP `220`                        |
| TLS version                            | TLSv1.3                                  |
| TLS cipher                             | TLS_AES_128_GCM_SHA256                   |
| SMTP authentication                    | **PASS**                                 |
| SMTP response code                     | **235**                                  |
| Sanitized response                     | `2.0.0 Authentication succeeded`         |
| Existing key accepted                  | **YES**                                  |
| `MAIL FROM` issued                     | No                                       |
| `RCPT TO` issued                       | No                                       |
| `DATA` issued                          | No                                       |
| Email transmitted                      | No                                       |
| Connection closed after authentication | Yes                                      |
| Automatic retries                      | None                                     |

Only `EHLO`, `STARTTLS`, `AUTH`, and `QUIT` were used. No envelope or message commands were issued.

## Active runtime state

- Worker: Mailpit, external delivery disabled, empty allowlist, no Brevo credentials.
- Web: Mailpit, external delivery disabled, no Brevo credentials.
- Mailpit, database, signer, and web health: healthy.
- No pending Brevo notifications.
- The consumed attempt remains one row in `smtp_submission_attempts`; it was not reset, retried, or resent.
- Retry and resend refusal for the controlled notification: verified.

## Active-key correspondence

The existing SMTP key was accepted by Brevo SMTP with response `235 2.0.0 Authentication succeeded`. This confirms the configured key is accepted for the configured SMTP login and is consistent with the active key shown in the Brevo dashboard. No key value was disclosed.

## Remaining blockers

1. The consumed Stage 3.3B notification cannot be retried or resent.
2. A future attempt requires a new controlled notification and new controlled acceptance key.
3. A new explicit one-send authorization is required.
4. Provider delivery and inbox receipt remain unverified because this check did not transmit an email.

## Recommendation

**READY for a new controlled badge email test**, subject to a new explicit one-send authorization, a new controlled notification, and a new controlled acceptance key. Do not retry the consumed Stage 3.3B attempt. No external email was transmitted during this authentication-only check.
