# Stage 5E.1 Brevo Acceptance Plan

**Date:** 5 November 2026  
**External email sent in Stage 5E.1:** No  
**External delivery results claimed:** None

## 1. Readiness audit

| Area                                  | Implemented                                        | Locally verified                | Externally verified |
| ------------------------------------- | -------------------------------------------------- | ------------------------------- | ------------------- |
| Brevo SMTP transport                  | Yes — `smtp-relay.brevo.com`                       | Unit/integration config tests   | No                  |
| STARTTLS and certificate verification | Yes — port 587, `requireTLS`, `rejectUnauthorized` | Config tests, staging preflight | No                  |
| Sender identity validation            | Yes — required sender with `@`                     | Config tests                    | No                  |
| SPF/DKIM/DMARC                        | Not verifiable locally                             | DNS reference only              | No — external       |
| Webhook HMAC authentication           | Yes — timing-safe HMAC-SHA256                      | Route/adapter tests             | No                  |
| Provider event correlation            | Yes — message ID then recipient + sent window      | Integration tests               | No                  |
| Bounce/complaint invalidation         | Yes — durable suppression, transactionally applied | Integration tests               | No                  |
| Delivery/retry lifecycle              | Yes — claims, bounded retry, outbox, audit         | Unit/integration/E2E            | No                  |
| Recipient policy                      | Yes — LOCAL/STAGING/PRODUCTION                     | Unit/integration tests          | No                  |
| Controlled acceptance arming          | Yes — one-shot durable reservation                 | Service/integration tests       | No                  |

## 2. Policy for the first external test

Use **staging** policy for the first real provider test:

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging
EXTERNAL_EMAIL_ENABLED=true
CONTROLLED_ACCEPTANCE_ONLY=true
EXTERNAL_EMAIL_ALLOWLIST=<one-authorized-recipient@approved-domain>
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=<provider-user>
BREVO_SMTP_PASSWORD=<provider-secret>
BREVO_SENDER=<approved sender on verified domain>
BREVO_WEBHOOK_ENABLED=true
BREVO_WEBHOOK_SECRET=<provider-webhook-secret>
```

Do not use production policy for the first external test. Production policy is for normal authorized
issuance/student delivery after the staging acceptance evidence is approved.

## 3. Explicit authorization gate

Before executing any step below, record written approval covering:

- the exact sender domain and sender address;
- the exact authorized recipient;
- the approved test window;
- who may observe/confirm inbox receipt;
- permission to send exactly one external message;
- contact and rollback owner.

Do not proceed if any item is missing. Do not use a real student's private address.

## 4. Preflight (no email sent)

1. Run the configuration preflight against the private staging environment:

   ```sh
   npx tsx scripts/brevo-readiness.ts
   ```

   It fails closed unless Brevo mode, an explicit `staging`/`production` policy, external delivery,
   port 587/STARTTLS, certificate verification, credentials, one staging allowlist recipient, and the
   webhook secret are present. It sends no email and prints no credentials.

2. Confirm the worker channel is `brevo` and the queue is drained or contains only the intended
   controlled notification.

3. Confirm `CONTROLLED_ACCEPTANCE_ONLY=true` and `CONTROLLED_ACCEPTANCE_RECIPIENT` exactly matches
   the approved recipient.

4. Confirm the public status-list and issuer/key endpoints resolve through staging HTTPS or the
   approved staging URL.

5. Confirm durable suppression is active and there are no active suppressions for the test recipient.

## 5. Arm exactly one controlled notification

Create/identify one pending Brevo notification for the approved recipient, then arm it once:

```sh
CONTROLLED_ACCEPTANCE_RECIPIENT=<approved-recipient> \
DATABASE_URL=<staging-db-url> \
npx tsx scripts/arm-controlled-acceptance.ts <delivery-id>
```

The service refuses a second arm, a different recipient, a non-Brevo channel, or a non-pending
delivery. The submission attempt is permanently consumed after reservation.

## 6. Execute the single authorized send

1. Start/recreate the worker and web with the approved staging environment.
2. Observe the worker claim the controlled delivery.
3. Record the application notification status, provider message ID, attempt outcome, and timestamps.
4. Confirm `SENT` means SMTP/provider acceptance, not inbox delivery.
5. Obtain explicit recipient confirmation of inbox receipt and record the evidence location.
6. Do not arm or send a second message during the same acceptance attempt.

## 7. Webhook and provider lifecycle

Only after provider registration is approved and reachable over HTTPS:

1. Send a signed provider test event or wait for real delivered/deferred/bounce/complaint events.
2. Confirm signature rejection for an invalid signature.
3. Confirm duplicate events are idempotent.
4. Confirm out-of-order/stale events do not regress status.
5. Confirm hard bounce/complaint/invalid/blocked creates durable suppression.
6. Confirm a suppressed recipient cannot be retried or resent; verify Administrator clearance is
   audited and complaint clearance requires acknowledgement.

## 8. Public credential and revocation check

1. Open the public verification URL from the accepted email.
2. Verify the signed credential, issuer/key binding, status-list URL, and active status externally.
3. Revoke the controlled credential.
4. Confirm the signed status list and public page report revoked.
5. Confirm the signed credential payload did not change.

## 9. Stop conditions and rollback

Stop immediately and restore Mailpit/local mode if:

- any message is sent to an unapproved recipient;
- the allowlist/policy check can be bypassed;
- suppression fails;
- the webhook accepts an invalid signature;
- provider or application status is inconsistent;
- the recipient reports an unexpected message.

Rollback:

```text
EMAIL_DELIVERY_MODE=mailpit
EMAIL_RECIPIENT_POLICY=local
EXTERNAL_EMAIL_ENABLED=false
CONTROLLED_ACCEPTANCE_ONLY=false
```

Recreate worker and web. Do not delete the controlled attempt or audit records. Record the incident.

## 10. Evidence to capture

- Approval record and authorized recipient.
- Preflight output with credentials redacted.
- Delivery ID, provider message ID, queue status, attempt history.
- Provider event payloads stored by the application (not raw secrets).
- Recipient confirmation.
- Public credential/status-list verification output.
- Suppression, retry/resend denial, and revocation evidence.
- Operator, timestamps, result, and any deviation.

## 11. Current verdict

**Brevo local/configuration readiness: PASS.**  
**External Brevo acceptance: NOT EXECUTED.**  
No external delivery, inbox receipt, DNS authentication, or webhook delivery is claimed.
