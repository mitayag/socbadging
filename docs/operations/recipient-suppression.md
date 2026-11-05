# Recipient Suppression Policy and Operations

## Purpose

Suppression protects deliverability, recipients, and the sending domain by permanently blocking email
to addresses that the provider has confirmed cannot or must not receive mail. Suppression is durable
across application and worker restarts.

## Durable model

`recipient_suppressions` stores the current state per normalized recipient address:

- `normalized_email` is unique and lower-cased.
- `reason` is `HARD_BOUNCE`, `COMPLAINT`, `INVALID_RECIPIENT`, or `BLOCKED_PERMANENT`.
- `provider` and `provider_event_id` record the source event.
- `source_delivery_id` records the correlated notification delivery when one exists.
- `suppressed_at` records the provider event time.
- `evidence_json` stores sanitized correlation evidence (event type, provider message ID, truncated
  reason, and payload hash). Raw provider payloads are never stored or displayed.
- `status` is `ACTIVE` or `CLEARED`; clearance records `cleared_at`, `cleared_by_user_id`, and
  `clear_reason`.

Suppression and clearance actions append Administrator-visible audit records. Accepted provider
events remain immutable in `notification_delivery_events`.

## Permanent versus temporary failures

| Provider event             | Provider status | Suppression                    |
| -------------------------- | --------------- | ------------------------------ |
| `hard_bounce`              | `BOUNCED`       | `HARD_BOUNCE`                  |
| `complaint`                | `COMPLAINT`     | `COMPLAINT`                    |
| `invalid_email`            | `INVALID`       | `INVALID_RECIPIENT`            |
| `blocked`                  | `BLOCKED`       | `BLOCKED_PERMANENT`            |
| `soft_bounce` / `deferred` | `DEFERRED`      | None; retry with backoff       |
| `delivered`                | `DELIVERED`     | None; never clears suppression |

`COMPLAINT` has precedence. A later hard bounce, invalid-recipient, or blocked event cannot downgrade
an active complaint suppression.

## Enforcement points

Suppression is checked server-side before every send path:

1. Delivery worker before claiming work and again immediately before SMTP submission, including
   recovered expired claims and scheduled retries.
2. Webhook processing when a terminal provider event is accepted, which also marks queued
   `PENDING`/`RETRY_SCHEDULED` deliveries for that recipient as `FAILED` with
   `RECIPIENT_SUPPRESSED`.
3. Administrator retry.
4. Manual resend by an Administrator or the owning Faculty member.
5. Student activation and password-recovery email.
6. New issuance delivery when the worker picks it up.

`SENT` and historical rows are never rewritten. Only future attempts are blocked.

## Webhook behavior

The Brevo webhook keeps its HMAC-SHA256 authentication, raw-body validation, size limits, event schema
validation, and unique provider event ID. Event storage and suppression are applied in one
transaction. Repeated events return `duplicate` and cannot remove or weaken suppression. A repeated
terminal event re-confirms suppression if the state is missing, but does not duplicate audits.

## Administrator visibility

Administrators see active suppressions on `/notifications` with recipient address, reason, provider,
suppression time, and a truncated correlation identifier. The view never includes raw provider
payloads. Faculty cannot see or modify suppression records.

## Clearing a suppression

Only an active Administrator can clear a suppression:

1. Open `/notifications` as an Administrator.
2. Locate the recipient under **Suppressed Recipients**.
3. Enter a clearance reason of at least five characters.
4. For `COMPLAINT`, explicitly acknowledge the complaint.
5. Confirm the action.

The change is transactional, requires an active Administrator row in the database, and writes a
`notification.recipient_suppression_cleared` audit record. Clearing does not delete history. A new
permanent provider event will create a new active suppression.

Clearing a suppression does not automatically resend prior failures. Use the normal retry policy or
resend action after clearance.

## Rollback

The suppression schema is additive. Application rollback is safe if the previous release ignores the
new table. Do not drop `recipient_suppressions` while active suppressions exist unless the business
decision to forget suppression history is explicitly approved and audited. To roll back the feature,
disable webhook delivery processing or stop the worker before reverting application code; do not
silently re-enable sending to suppressed recipients.
