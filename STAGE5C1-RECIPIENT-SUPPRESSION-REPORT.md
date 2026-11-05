# Stage 5C.1 Recipient Suppression Report

**Date:** 4 November 2026  
**Scope:** Durable recipient-level suppression  
**External email sent:** No

## 1. Durable model

New table: `recipient_suppressions`.

| Field                                              | Purpose                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `normalized_email`                                 | Unique lower-cased recipient key.                                                     |
| `recipient_email`                                  | Original display/evidence value.                                                      |
| `reason`                                           | `HARD_BOUNCE`, `COMPLAINT`, `INVALID_RECIPIENT`, `BLOCKED_PERMANENT`.                 |
| `provider`                                         | Provider name (`brevo`).                                                              |
| `provider_event_id`                                | Provider correlation evidence.                                                        |
| `source_delivery_id`                               | Correlated notification delivery when available.                                      |
| `suppressed_at`                                    | Provider event time.                                                                  |
| `evidence_json`                                    | Sanitized event type, message ID, truncated reason, and payload hash. No raw payload. |
| `status`                                           | `ACTIVE` or `CLEARED`.                                                                |
| `cleared_at`, `cleared_by_user_id`, `clear_reason` | Audited clearance metadata.                                                           |

Migration: `prisma/migrations/20261104120000_recipient_suppression/migration.sql` (additive only).

## 2. Event mapping

| Provider event            | Action                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `hard_bounce`             | Active `HARD_BOUNCE` suppression.                          |
| `complaint`               | Active `COMPLAINT` suppression; highest precedence.        |
| `invalid_email`           | Active `INVALID_RECIPIENT` suppression.                    |
| `blocked`                 | Active `BLOCKED_PERMANENT` suppression.                    |
| `soft_bounce`, `deferred` | Temporary failure only; retry/backoff without suppression. |
| `delivered`               | Updates provider status; never clears suppression.         |

## 3. Idempotency and transactionality

- The webhook keeps HMAC-SHA256 raw-body verification, signature aliases, 64 KiB limit, 1–50 event
  limit, and strict schema validation.
- Event storage and suppression occur in one transaction.
- `provider_event_id` remains unique. A repeated event returns `duplicate`.
- Repeated terminal events re-confirm suppression if the state is missing, but do not duplicate audit
  records.
- Concurrent terminal events are serialized by row lock/atomic insert. Integration tests confirm one
  suppression row under concurrency.
- The webhook transaction runs at `READ COMMITTED` to avoid MariaDB stale-snapshot failures during
  concurrent suppression.

## 4. Enforcement points

1. Worker before claim and immediately before SMTP submission.
2. Worker controlled-acceptance path before reservation/submission.
3. Queued `PENDING`/`RETRY_SCHEDULED` rows marked `FAILED` with `RECIPIENT_SUPPRESSED`.
4. Administrator retry.
5. Administrator/Faculty resend.
6. Student activation/password-recovery email.
7. New issuance delivery when the worker claims it.

`SENT`, provider events, attempts, and credential history are never rewritten.

## 5. Administrator controls

- `/notifications` shows an Administrator-only **Suppressed Recipients** table.
- Columns: recipient, reason, provider, suppression time, truncated correlation ID.
- No raw provider payload is exposed.
- Clearance requires an active Administrator, a reason of at least five characters, and an explicit
  complaint acknowledgement for `COMPLAINT`.
- Clearance writes a `notification.recipient_suppression_cleared` audit record.
- Faculty cannot view or clear suppressions.
- A new permanent provider event after clearance creates a new active suppression.

## 6. Audit records

- `notification.recipient_suppressed`
- `notification.recipient_suppression_updated`
- `notification.recipient_suppression_cleared`

Context includes normalized recipient, reason, previous reason, provider, provider event ID, source
delivery ID, and event time. Sensitive provider payloads are not included.

## 7. Tests

Integration coverage (`recipient-suppression-service.integration.test.ts`):

- hard bounce creates suppression, audit, and fails queued delivery;
- repeated event is idempotent and does not duplicate audits;
- complaint cannot be downgraded by hard bounce or cleared by delivered;
- temporary soft bounce/deferral does not suppress;
- non-Administrator cannot clear; complaint requires acknowledgement;
- clearance is audited and a later permanent event re-suppresses;
- worker refuses a suppressed claimed delivery;
- concurrent permanent events produce one row.

Additional coverage:

- worker stops before SMTP when suppressed;
- retry refuses suppression;
- resend refuses suppression for an Administrator;
- student account email refuses suppression;
- webhook event integration remains idempotent and out-of-order safe.

## 8. Verdict

**Durable recipient suppression: PASS locally.**  
Suppression survives restarts because it is database-backed. Enforcement covers initial delivery,
retries, resends, recovered queue jobs, and account email. Unauthorized/repeated webhook events cannot
remove suppression.
