# Stage 5C Webhook Security Report

**Date:** 4 November 2026  
**Endpoint:** `POST /api/webhooks/brevo`  
**Provider registration / external validation:** BLOCKED

## 1. Security controls verified

| Control                                                                                          | Status                                  | Evidence                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| Disabled webhook returns 404                                                                     | Implemented / locally tested            | route test                                                           |
| HMAC-SHA256 signature over raw body                                                              | Implemented / locally tested            | route and adapter tests                                              |
| Timing-safe signature comparison                                                                 | Implemented / locally tested            | adapter unit test                                                    |
| Signature aliases accepted (`x-brevo-signature`, `x-sib-signature`, `x-brevo-webhook-signature`) | Implemented / locally tested            | route test                                                           |
| Invalid signature rejected before processing                                                     | Implemented / locally tested            | route test                                                           |
| Declared and actual body size limit (64 KB)                                                      | Implemented / locally tested            | route test/code inspection                                           |
| Event batch size limit (50) and non-empty batch                                                  | Implemented / code inspected            | route code                                                           |
| Strict event schema validation                                                                   | Implemented / locally tested            | route test                                                           |
| Secret required when webhook enabled                                                             | Implemented / locally tested            | env test                                                             |
| Sanitized response counts, no payload echo                                                       | Implemented / locally tested            | route test                                                           |
| Idempotency via unique provider event ID                                                         | Implemented / integration tested        | `providerEventId` unique; P2002 duplicate path                       |
| Provider message/recipient correlation                                                           | Implemented / integration tested        | message ID or email + sent-window match                              |
| Unmatched event persistence                                                                      | Implemented / integration tested        | applied=false event record                                           |
| Out-of-order/stale event handling                                                                | Implemented / integration tested        | rank + occurred-at checks                                            |
| Delivered/deferred/hard/soft bounce/blocked/invalid/complaint mapping                            | Implemented / integration tested        | delivery-event service                                               |
| Bounce/complaint status recording                                                                | Implemented / integration tested        | provider status update                                               |
| Recipient suppression enforcement                                                                | **NOT IMPLEMENTED in the webhook path** | provider-neutral contract exists; no durable suppression store wired |

## 2. Findings

### Suppression gap — production blocker

The webhook route records bounce/complaint provider status but does not add the recipient to a
durable suppression store. The resend service does not check a suppression store, and the
notification list still marks a SENT delivery as resendable even when provider status is
`BOUNCED` or `COMPLAINT`. This is a deliverability/compliance risk.

Required before production:

1. Add a durable suppression model/migration.
2. Wire the webhook route to the existing provider-neutral suppression contract after
   idempotent event claiming.
3. Block worker sends and resends for suppressed recipients.
4. Expose suppression status/administrative override with audit records.
5. Add tests for hard bounce, complaint, duplicate events, and resend denial.

### External webhook validation blocked

No Brevo webhook secret or provider registration is configured. The endpoint cannot be
validated against a real Brevo signature or event delivery in Stage 5C. Do not use an
unverified secret or provider endpoint in production.

## 3. Local verification

- Route tests cover disabled webhook, invalid signature, oversized payload, invalid event,
  valid signed event, and signature alias.
- Integration tests cover apply, duplicate replay, stale/out-of-order events, terminal
  bounce/complaint, and unmatched events.
- No real webhook was sent; no secret was printed.

## 4. Verdict

**Webhook authentication/processing: PASS locally.**  
**Webhook production readiness: BLOCKED** by missing external registration and recipient
suppression.
