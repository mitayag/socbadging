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

## Badge-issued email

The official HAU SOC issued-badge email uses the subject
`Congratulations! You Have Earned a Digital Badge — HAU School of Computing`.
It includes the HAU/SOC identity, privacy-safe recipient display name, badge title, achievement
description, issue/expiry dates, public verification link, Student Badge Portal link, optional
LinkedIn/Facebook/X sharing instructions, badge artwork when available, and the configured support
contact. It never includes signing material, recipient email, or student number.

For issued-badge email, the worker first tries to attach artwork from the existing badge media store
as an inline CID image. It never fetches arbitrary artwork URLs: the stored URL must use HTTP(S),
match the issuance verification origin, and resolve to the validated `/api/media/badges/…` storage
path. The production worker mounts `media_data` at `/app/storage` read-only. Missing, invalid,
oversized, cross-origin, or unreadable artwork falls back to the original absolute remote image URL.
Every artwork variant retains descriptive alt text, an absolute HTML artwork link, and a plain-text
artwork URL for clients that block images. SMTP acceptance and provider events retain their existing
meanings; inline attachment support does not prove inbox rendering.

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

## Worker resilience

- Each cycle is bounded by `NOTIFICATION_CYCLE_TIMEOUT_MS` (default 60000 ms).
- SMTP uses connection/greeting/socket timeouts; MariaDB uses connect/acquire/query/socket timeouts.
- Heartbeat writes are bounded so a database hang cannot re-block the loop.
- A cycle timeout logs `notification.worker.stall_exit` and exits with code 70 immediately. Because
  a timed-out promise cannot be cancelled reliably, no replacement cycle is started in the same
  process; container recovery prevents late work from overlapping a new delivery cycle.
- Polling is interruptible for graceful SIGTERM/SIGINT.
- Tune the cycle timeout above expected batch duration for slow providers; do not use it to hide
  repeated failures.
- Docker worker health diagnostics print heartbeat age and mail status on failure.

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
