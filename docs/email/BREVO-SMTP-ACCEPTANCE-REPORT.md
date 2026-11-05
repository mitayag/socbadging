# Brevo SMTP Acceptance Report

**Date:** 2026-11-02  
**Status:** PENDING APPROVAL — no external email transmitted.  
**Production readiness:** NOT READY for production email.

## Configuration validation

| Check                              | Result                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| Default transport                  | Mailpit                                                      |
| Active mode in worker              | `mailpit`                                                    |
| External delivery switch           | `false`                                                      |
| Allowlist in worker                | Empty                                                        |
| Brevo SMTP credentials in worker   | Not configured                                               |
| Brevo credentials in tracked files | None                                                         |
| Brevo webhook                      | Disabled                                                     |
| Brevo host/port                    | `smtp-relay.brevo.com:587`                                   |
| Sender                             | `HAU SOC Badging System <badges@hausoc.org>`                 |
| STARTTLS enforcement               | `secure=false`, `requireTLS=true`, `rejectUnauthorized=true` |
| Migration parity                   | No difference                                                |
| Worker/web/Mailpit health          | Healthy                                                      |

## Security validation

- Brevo mode fails closed without `EXTERNAL_EMAIL_ENABLED=true`.
- Brevo mode requires a non-empty allowlist.
- Worker, activation/recovery, and resend paths all enforce the allowlist.
- Notifications carry a `delivery_channel`; the worker claims only its active channel.
- Existing Mailpit rows cannot be automatically released through Brevo.
- Resend refuses rows from a different delivery channel.
- No SMTP username/password is logged or committed.
- No old Brevo key is present in the repository or running configuration.
- Webhook is disabled by default.
- IP restrictions remain unchanged.

## Domain authentication requirements

The following are external Brevo/DNS prerequisites and cannot be verified from this repository:

1. Verify `badges@hausoc.org` as an authorized Brevo sender.
2. Authenticate the `hausoc.org` sending domain in Brevo.
3. Publish the exact SPF record supplied by Brevo for the account. Confirm the current Brevo SPF include in the Brevo dashboard rather than assuming a legacy value.
4. Publish the Brevo DKIM selector records for the sending domain.
5. Publish a DMARC policy with alignment and reporting. Start conservatively, then tighten after monitoring.
6. Confirm provider reputation, suppression, and bounce handling requirements.
7. Do not activate Brevo IP restrictions until the controlled test is complete.

## Controlled delivery plan (requires approval)

Use exactly one explicitly authorized test mailbox controlled by HAU. Do not use a student address.

1. Revoke the previously exposed SMTP key in Brevo.
2. Generate a new Brevo SMTP key.
3. Store the new key in a private file outside the repository, mode `0600`, or in the institutional secrets manager.
4. Create a private test environment with:
   ```text
   EMAIL_DELIVERY_MODE=brevo
   EXTERNAL_EMAIL_ENABLED=true
   EXTERNAL_EMAIL_ALLOWLIST=<single-approved-test-recipient>
   BREVO_SMTP_HOST=smtp-relay.brevo.com
   BREVO_SMTP_PORT=587
   BREVO_SMTP_USER=<private-brevo-username>
   BREVO_SMTP_PASSWORD=<private-brevo-password>
   BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>
   BREVO_WEBHOOK_ENABLED=false
   ```
5. Recreate only `worker` and `web` with the private environment:
   ```text
   docker compose --env-file .env --env-file /absolute/secure/path/brevo-test.env \
     --profile notifications up -d --no-deps --force-recreate worker web
   ```
6. Confirm worker/web/Mailpit health and confirm no secret is printed in logs.
7. Create an isolated test class, badge, and student using only the approved recipient address.
8. Issue exactly one badge and record:
   - application notification status,
   - `provider_message_id`,
   - worker log outcome,
   - Brevo provider delivery event/status,
   - recipient inbox receipt and headers/screenshot.
9. Confirm no real student address was used and no webhook/IP setting changed.
10. Roll back immediately:
    ```text
    EMAIL_DELIVERY_MODE=mailpit
    EXTERNAL_EMAIL_ENABLED=false
    ```
    Recreate `worker` and `web`; verify health and confirm Brevo-channel rows are not claimed by Mailpit.

## Acceptance criteria

The controlled test passes only if all are true:

- Exactly one allowlisted recipient receives the message.
- Brevo accepts the SMTP message.
- Brevo reports provider delivery status.
- The recipient mailbox confirms receipt.
- No non-allowlisted recipient receives anything.
- Existing Mailpit notifications are not delivered through Brevo.
- Rollback restores Mailpit and external delivery is disabled.
- No credential is exposed.

SMTP acceptance alone is not sufficient; provider delivery status and inbox receipt are required.

## Remaining blockers

- No replacement Brevo credentials are configured locally.
- Sender/domain authentication is not verified.
- Exactly one authorized test recipient has not been supplied.
- External delivery approval has not been granted.
- Brevo webhook route, provider signature header, and suppression persistence are not implemented.
- Bounce/complaint handling is not production-ready.
- Seven moderate ExcelJS-chain advisories remain.
- Email delivery is at-least-once; `SENT` does not confirm inbox delivery.

## Recommendation

**PENDING APPROVAL / NOT PRODUCTION READY.** The code and configuration are prepared for a controlled test, but no external email should be enabled until the operator completes the approval gate and supplies the authorized recipient, new credentials, and domain-authentication evidence.
