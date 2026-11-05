# Brevo SMTP One-Attempt Safety Report

**Date:** 2026-11-02  
**Stage:** 3.3A — durable at-most-once SMTP submission protection  
**External email accepted:** Yes — Stage 3.3D SMTP accepted; Brevo reports delivered/opened/clicked; independent Outlook screenshot pending  
**Brevo activated:** No  
**Production deployment:** No

## Root cause

The notification worker was at-least-once:

- It claimed a delivery, sent through SMTP, and only then updated the delivery row.
- A crash after SMTP acceptance but before the database update left the row `PROCESSING`.
- After the claim lease expired, another worker could reclaim and submit again.
- Transient failures scheduled retries; `maxAttempts` limited retries but was not a durable submission boundary.
- The unique key on `(issuance_id, type)` prevented duplicate notification rows, not duplicate SMTP submissions.
- SMTP Message-ID alone cannot prevent duplicate application submissions.

## Database migration

New migration:

`prisma/migrations/20261102140000_smtp_submission_attempts/migration.sql`

New table: `smtp_submission_attempts`

| Field                      | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `id`                       | Attempt record ID                                     |
| `notification_delivery_id` | Unique one-to-one delivery link                       |
| `delivery_channel`         | Channel snapshot                                      |
| `recipient`                | Recipient snapshot                                    |
| `acceptance_key`           | Unique key for the controlled acceptance exercise     |
| `attempt_token`            | Unique token for the worker that reserved the attempt |
| `submission_state`         | Durable state machine                                 |
| `submission_started_at`    | Reservation timestamp                                 |
| `smtp_completed_at`        | SMTP completion timestamp                             |
| `provider_message_id`      | Provider result when available                        |
| `last_error_code`          | Safe diagnostic code                                  |
| `created_at`, `updated_at` | Timestamps                                            |

Unique constraints:

- one attempt per `notification_delivery_id`;
- one controlled exercise per `acceptance_key`;
- one reservation token per attempt.

Migration parity: **PASS — no difference detected** on both the local database and the clean integration database.

## State machine

```text
NOT_STARTED
  -> SUBMISSION_RESERVED  (atomic reservation before SMTP)
  -> ACCEPTED             (SMTP accepted)
  -> REJECTED             (definite SMTP rejection)
  -> OUTCOME_UNKNOWN      (timeout, ambiguous result, crash recovery)
```

Once `SUBMISSION_RESERVED` is committed, the attempt is consumed permanently. The worker never resets it to `NOT_STARTED`.

## Concurrency design

- The worker atomically updates the attempt from `NOT_STARTED` to `SUBMISSION_RESERVED` with a conditional `updateMany`.
- Only the worker whose update returns `count = 1` may call SMTP.
- The database transaction is committed before the SMTP connection begins; no transaction is held open during network I/O.
- A second worker sees `CONSUMED` and does not call SMTP.
- Expired claims cannot re-reserve a consumed attempt.
- `CONTROLLED_ACCEPTANCE_ONLY=true` makes the worker refuse Brevo deliveries that have no armed controlled attempt.
- `sendStudentAccountEmail` refuses direct activation/recovery email while controlled-only Brevo mode is active.
- Manual retry and resend refuse any notification with a controlled attempt row.

## Crash and recovery handling

| Scenario                                              | Behavior                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Crash before SMTP after reservation                   | Attempt remains `SUBMISSION_RESERVED`; reconciliation marks `OUTCOME_UNKNOWN` and delivery `FAILED`; no SMTP |
| Crash after SMTP acceptance before attempt update     | Attempt remains `SUBMISSION_RESERVED`; reconciliation marks `OUTCOME_UNKNOWN`; no SMTP                       |
| Crash after attempt `ACCEPTED` before delivery update | Reconciliation marks delivery `SENT`; no SMTP                                                                |
| Expired processing lease                              | Reconciliation terminalizes the delivery without sending                                                     |
| SMTP timeout                                          | Attempt `OUTCOME_UNKNOWN`; delivery `FAILED`; no retry                                                       |
| Definite SMTP rejection                               | Attempt `REJECTED`; delivery `FAILED`; no retry                                                              |
| Worker restart                                        | Consumed attempt remains consumed; no reset                                                                  |
| Concurrent workers                                    | Only one reservation wins                                                                                    |
| Manual resend                                         | Refused for controlled notifications                                                                         |
| Admin retry                                           | Refused for controlled notifications                                                                         |
| Activation/recovery bypass                            | Refused in controlled-only mode                                                                              |

Reconciliation runs at the start of each worker cycle and never calls SMTP.

## Files modified

- `prisma/schema.prisma`
- `prisma/migrations/20261102140000_smtp_submission_attempts/migration.sql`
- `src/config/env.ts`
- `src/config/env.test.ts`
- `src/worker.ts`
- `src/modules/notifications/services/controlled-acceptance-service.ts`
- `src/modules/notifications/services/controlled-acceptance-service.test.ts`
- `src/modules/notifications/services/controlled-acceptance-service.integration.test.ts`
- `src/modules/notifications/services/delivery-worker.ts`
- `src/modules/notifications/services/delivery-worker.test.ts`
- `src/modules/notifications/services/notification-retry-service.ts`
- `src/modules/notifications/services/notification-retry-service.test.ts`
- `src/modules/notifications/services/notification-resend-service.ts`
- `src/modules/notifications/services/notification-resend-service.integration.test.ts`
- `src/modules/student/services/student-email-service.ts`
- `src/modules/student/services/student-email-service.test.ts`
- `compose.yaml`
- `.env.example`
- `.env.brevo.example`

No private credentials were displayed, logged, modified, committed, or included in reports.

## Test results

### Unit tests

- Targeted one-attempt tests: **24 passed**
- Config safety test: **13 passed**
- Student-email safety test: **1 passed**
- Full unit suite: **815 passed, 1 failed**
  - Failure: `src/app/api/issuance-batches/batch-routes.test.ts` expected `200`, received `400` while inspecting a multipart upload. This test does not exercise notification delivery and is unrelated to this change.

### Integration tests

Clean disposable database `badging_test`:

- **18 files passed**
- **120 tests passed**
- Includes concurrent reservations across separate Prisma clients, restart persistence, expired lease recovery, crash-window recovery, and controlled resend refusal.

### Playwright

- **36 passed**
- **2 failed, 8 did not run** in the full run
- The mobile Phase 6 timeout passed when rerun.
- One persistent unrelated failure remains in the desktop student-portal wallet test (`My Badges` heading not visible after navigation).

### Static checks

- Format: **PASS**
- Lint: **PASS**
- Typecheck: **PASS**
- Production build: **PASS**
- Migration parity: **PASS**

## Live attempt results

### Stage 3.3B

- One durable reservation and one SMTP submission.
- Brevo rejected authentication with `EAUTH`.
- Attempt state `REJECTED`; notification `FAILED`.
- No provider message ID; no retry or resend.
- Mailpit rollback completed successfully.

### Stage 3.3D

- New synthetic student, new notification, and new acceptance key.
- One durable reservation and one SMTP submission.
- Brevo accepted the message; attempt state `ACCEPTED`; notification `SENT`.
- SMTP Message-ID recorded as provider message ID.
- No duplicate or additional submission.
- Mailpit rollback completed successfully.
- Brevo reports delivery, first opening, and clicks; independent Outlook screenshot correlation remains pending.

The guard held in both attempts. The Stage 3.3B failure was an authentication issue, not a guard failure.

## Remaining risks

- The guarantee is **at most one application-initiated SMTP submission**, not provider-side deduplication or guaranteed inbox delivery.
- If the database is unavailable immediately after a reservation, the attempt remains consumed and the delivery is terminalized as unknown; it is not resent.
- Reconciliation is required after an abrupt crash to move `PROCESSING` rows to a terminal state.
- The live Brevo send has not been executed. Provider delivery, inbox receipt, and badge verification remain unverified.
- One unrelated unit test failure and one unrelated desktop Playwright failure remain in the existing suite.

## Readiness decision

**PASS — durable at-most-once SMTP submission protection is implemented and demonstrated for the tested crash, restart, concurrency, recovery, timeout, and resend scenarios.**

The guard was exercised by two separate authorized notifications. Stage 3.3B was rejected with `EAUTH`; Stage 3.3D was accepted by Brevo. Both attempts are consumed and neither was retried. Brevo provider delivery is operator-reported; independent Outlook screenshot correlation remains pending.
