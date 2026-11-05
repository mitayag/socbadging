# Stage 5C Test Results

**Date:** 4 November 2026  
**Environment:** Local development only  
**Result:** CONDITIONAL PASS — local suites pass; external email/DNS/provider tests are BLOCKED

## 1. Static, unit, integration, build

| Check                      | Result                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run format`           | PASS                                                               |
| `npm run lint`             | PASS                                                               |
| `npm run typecheck`        | PASS                                                               |
| `npm run test`             | 115 files, **845 passed**                                          |
| `npm run test:integration` | 19 files, **136 passed** on fresh `badging_stage5c_integration` DB |
| `npm run build`            | PASS — compiled successfully                                       |

## 2. Targeted Playwright regression

```text
npx playwright test e2e/phase6-regression.spec.ts \
  e2e/phase7-notifications-hardening.spec.ts \
  e2e/phase8-open-badges-conformance.spec.ts \
  e2e/student-portal.spec.ts
42 passed, 0 failed
```

Coverage includes public verification, revocation, expiration, signed proof/tamper states,
individual and batch issuance, notification retry/resend, credential downloads, student
ownership, password recovery, and signed status-bit publication.

The Stage 5A combined suite (57 passed, 1 skipped, run twice consecutively) remains the
broader role-based regression reference.

## 3. Targeted email/webhook/signing tests included in the suites

| Area                         | Test files                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Email config/validation      | `src/config/env.test.ts`                                                            |
| SMTP worker/retry            | `delivery-worker.test.ts`, `retry-policy.test.ts`, `notification-outbox.test.ts`    |
| Student account email        | `student-email-service.test.ts`                                                     |
| Webhook signature/route      | `src/app/api/webhooks/brevo/route.test.ts`                                          |
| Webhook adapter/contract     | `brevo-webhook-adapter.test.ts`, `bounce-event-contract.test.ts`                    |
| Delivery event projection    | `notification-delivery-event-service.integration.test.ts`                           |
| Controlled acceptance        | `controlled-acceptance-service.test.ts` and integration test                        |
| Resend lifecycle             | `notification-resend-service.integration.test.ts`                                   |
| Signing key lifecycle        | `key-service.integration.test.ts`                                                   |
| Signed issuance/verification | `signed-issuance-service.integration.test.ts`, public credential tests              |
| Revocation/status list       | `revocation-service.integration.test.ts`, `status-list-service.integration.test.ts` |

## 4. Local live acceptance checks

| Check                                            | Result                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| Mailpit captured badge-issued email              | PASS                                           |
| Email verification URL resolves                  | PASS — 200                                     |
| Public credential page                           | PASS — active/revoked labels correct           |
| Credential JSON-LD with proof                    | PASS — `DataIntegrityProof`, `eddsa-rdfc-2022` |
| Credential download/image/PDF/QR                 | PASS — 200 with expected content types         |
| Public signing key endpoint                      | PASS — 200 JSON-LD                             |
| Active credential cryptographic verification     | PASS                                           |
| Revoked credential remains verifiable as revoked | PASS                                           |
| Local notification delivery status               | PASS — SENT via mailpit; provider status null  |

## 5. Blocked / external tests

These are not marked PASS:

| Test                                            | Status                | Reason                                                                     |
| ----------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Real Brevo SMTP acceptance                      | BLOCKED               | No Brevo credentials, sender domain, allowlist, or authorization           |
| Brevo provider delivered/deferred/bounce status | BLOCKED               | No provider account/webhook registration                                   |
| Authorized inbox receipt confirmation           | BLOCKED               | No authorized test recipient                                               |
| Brevo domain verification, SPF/DKIM/DMARC       | BLOCKED               | No approved production domain; public example domain lacks visible records |
| Live Brevo webhook signature validation         | BLOCKED               | No webhook secret/provider registration                                    |
| Recipient suppression enforcement               | BLOCKED               | Not implemented in the webhook path                                        |
| External status-list URL fetch                  | **FAIL (local data)** | `status-list-local` returns 503 due to version/allocation mismatch         |
| Production key rotation                         | NOT PERFORMED         | Prohibited without approval                                                |

## 6. Verdict

Local implementation and regression suites pass. External Brevo delivery, DNS, webhook, and
inbox acceptance remain blocked. The status-list endpoint failure and suppression gap are
production blockers.
