# Stage 5E.1 Recipient Policy

**Date:** 5 November 2026  
**Live email sent:** No

## 1. Policy model

`EMAIL_RECIPIENT_POLICY` is explicit and fail-closed:

| Policy       | Transport                       | Recipient rule                                                             |
| ------------ | ------------------------------- | -------------------------------------------------------------------------- |
| `local`      | Mailpit only                    | Any syntactically valid sink recipient; Brevo is rejected                  |
| `staging`    | Brevo (or safe local rehearsal) | Exact-recipient allowlist, then immutable envelope check                   |
| `production` | Brevo                           | Recipient must match the immutable issuance/student envelope; no allowlist |

Brevo mode without an explicit policy is a configuration error. A `local` policy with Brevo, a
non-local policy with Mailpit, an invalid policy value, or a staging policy without an allowlist all
fail closed.

## 2. Enforcement points

| Path                              | Enforcement                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Outbox worker                     | Valid email syntax, policy, immutable issuance recipient snapshot, suppression |
| Administrator retry               | Same policy and envelope check before resetting the job                        |
| Administrator/Faculty resend      | Same policy and envelope check before queuing                                  |
| Student activation/recovery email | Policy, student/email match, and matching unexpired system token               |
| Suppression                       | Checked before every send/retry/resend path; never silently cleared            |

Production/staging badge delivery is tied to the issuance `recipientSnapshotJson`; a substituted
delivery recipient is marked `RECIPIENT_NOT_AUTHORIZED`. Revocation notices additionally require the
issuance to be revoked.

## 3. What prevents arbitrary bulk email

- There is no bulk email endpoint.
- Each delivery is unique per `(issuanceId, type)` and is created only by authorized issuance,
  revocation, or student-account flows.
- The worker sends only claimed outbox rows, in bounded batches.
- Production/staging workers verify the immutable recipient snapshot.
- Retry and resend require persisted Administrator/Faculty authorization and rate limits.
- Student account email requires a matching, unexpired, unused system token.
- Durable suppression applies before every attempt.

## 4. Configuration examples

Local development:

```text
EMAIL_DELIVERY_MODE=mailpit
EMAIL_RECIPIENT_POLICY=local
EXTERNAL_EMAIL_ENABLED=false
```

Staging provider acceptance:

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=authorized-recipient@hau.edu.ph
```

Production:

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=production
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=
```

## 5. Automated coverage

- `src/config/env.test.ts`: local/staging/production, missing/invalid policy, cross-mode rejection,
  invalid and header-injection addresses.
- `delivery-worker.test.ts`: local delivery, staging allowlist denial, production snapshot match,
  production substitution denial.
- `recipient-suppression-service.integration.test.ts`: production snapshot delivery and substitution
  denial with MariaDB; suppression still applies.
- `notification-retry-service.test.ts`: staging policy denial.
- `notification-resend-service.integration.test.ts`: staging policy denial.
- `student-email-service.test.ts`: local/production success, policy denial, student substitution,
  missing token, suppression.

## 6. Preserved behavior

The existing staging exact-recipient allowlist behavior is preserved: staging requires a non-empty
allowlist and only listed addresses pass the policy layer. Production no longer requires an allowlist,
but every delivery remains constrained by the immutable system envelope and suppression.

## 7. Remaining external dependency

The production policy is locally/CI verified but has not delivered a live external email in Stage
5E.1. Real provider acceptance remains gated by the Stage 5E.1 Brevo acceptance plan and written
authorization.
