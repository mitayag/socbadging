# Email Delivery Operations

## Status model

Keep queue status and provider status separate:

- Queue status: `PENDING`, `PROCESSING`, `RETRY_SCHEDULED`, `SENT`, `FAILED`.
- `SENT` means the SMTP server accepted the message. It does not prove provider delivery or inbox receipt.
- Provider status: `ACCEPTED`, `DELIVERED`, `DEFERRED`, `BOUNCED`, `BLOCKED`, `INVALID`, `COMPLAINT`.
- `smtpAcceptedAt` records SMTP acceptance.
- `providerStatusAt` records the provider event time.
- Delivery attempts are stored in `notification_delivery_attempts`.
- Provider events are stored immutably in `notification_delivery_events`.

## Recipient policies

Email delivery requires an explicit recipient policy:

- `local`: Mailpit only. Brevo mode is rejected.
- `staging`: Brevo with a non-empty exact-recipient allowlist.
- `production`: Brevo for recipients tied to an immutable system-issued issuance or student token;
  no allowlist is required.

`EMAIL_DELIVERY_MODE=brevo` fails closed unless `EMAIL_RECIPIENT_POLICY` is `staging` or
`production`. Invalid or missing policies are configuration errors. The worker additionally verifies
that each badge notification matches the issuance recipient snapshot; retry, resend, and student
account email enforce the same policy and token/envelope checks. See
[Recipient Suppression Policy](recipient-suppression.md) for suppression.

## Retry and resend

- Transient SMTP failures use bounded exponential backoff with jitter.
- Maximum attempts are controlled by `NOTIFICATION_MAX_ATTEMPTS`.
- Workers claim rows atomically and recover expired claims.
- Administrator retry is available for `FAILED` and `RETRY_SCHEDULED` rows.
- Resend is available for `SENT` rows to Administrator or the owning Faculty member.
- Controlled acceptance notifications cannot be retried or resent.
- Retry and resend actions require confirmation in the notification dashboard.
- Retry and resend are denied for recipients with an active suppression. Only an Administrator can
  clear suppression through the audited `/notifications` procedure.

## Brevo webhook

Endpoint:

`POST /api/webhooks/brevo`

Required environment:

```text
BREVO_WEBHOOK_ENABLED=true
BREVO_WEBHOOK_SECRET=<private-webhook-secret>
```

Authentication:

- HMAC-SHA256 of the raw request body.
- Send the hex digest in `x-brevo-signature` or `x-sib-signature`.
- Invalid signatures return `401`.

Limits:

- 64 KiB maximum body.
- 1–50 events per request.

Behavior:

- Events are validated before processing.
- Duplicate provider event IDs return a duplicate count and do not reapply side effects.
- Events are correlated by provider message ID first, then by a single recent matching recipient delivery.
- Delivered, deferred, bounced, blocked, invalid, and complaint events update provider status.
- Hard bounce, complaint, invalid-recipient, and permanent block events also create or re-confirm a
  durable recipient suppression in the same transaction as event storage.
- Temporary soft bounces and deferrals never suppress a recipient.
- Stale or out-of-order events are stored but are still evaluated for permanent suppression.
- Unmatched events are stored without changing a delivery but still suppress permanent failures.
- Repeated provider events are idempotent and cannot bypass or clear suppression.
- Provider delivery does not prove inbox receipt.

See [Recipient Suppression Policy](recipient-suppression.md) for the durable model, enforcement
points, Administrator visibility, and clearance procedure.

## Local webhook simulation

1. Set `BREVO_WEBHOOK_ENABLED=true` and a local `BREVO_WEBHOOK_SECRET`.
2. Run the app.
3. Simulate a signed event:

```text
APP_URL=http://127.0.0.1:3000 \
BREVO_WEBHOOK_SECRET=<local-secret> \
npx tsx scripts/simulate-brevo-webhook.ts \
  --event delivered \
  --email authorized-test-recipient@example.org \
  --message-id '<smtp-message-id>'
```

No external email is sent by the simulation.

## Monitoring

`/notifications` shows:

- Queue status and provider status.
- SMTP acceptance time.
- Recipient masking.
- Attempts.
- Filters for queue status, provider status, type, and recipient/badge search.
- Pagination.
- Retry/resend actions with confirmation.
- Administrator-only suppressed recipient list with audit-reason clearance.

`/notifications/[deliveryId]` shows attempt history and provider event history.

Administrators see all notifications. Faculty see notifications for classes they own. Retry remains Administrator-only.

## Production requirements

- Configure an authenticated Brevo webhook and secret.
- Verify provider delivery events in the target environment.
- Confirm recipient inbox receipt separately.
- Use externally reachable HTTPS URLs for badge artwork and public verification.
- Duplicate-complaint and hard-bounce suppression are implemented; monitor suppressed recipients
  during controlled acceptance.
- Do not treat SMTP acceptance as inbox delivery.
