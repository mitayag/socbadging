# Stage 5C.1 Critical Remediation Report

**Date:** 4 November 2026  
**Scope:** Local implementation only  
**External email sent:** No  
**DNS changed:** No  
**Keys rotated/deleted:** No  
**Committed/pushed:** No

## 1. Objective

Resolve the two Stage 5C blockers:

1. Recipient suppression was a contract only and was not wired to the Brevo webhook, worker,
   retries, or resends.
2. The public status-list endpoint returned HTTP 503 because the published list version and
   allocation versions were inconsistent.

## 2. Summary of changes

| Area                 | Change                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database             | Added `recipient_suppressions` with reason/status enums, unique normalized email, provider correlation, evidence, and clearance fields. Additive migration `20261104120000_recipient_suppression`. |
| Webhook              | Terminal provider events now create/re-confirm durable suppression in the same transaction as immutable event storage. Duplicate events remain idempotent and cannot bypass or clear suppression.  |
| Worker               | Checks suppression before claiming work and immediately before SMTP submission, including controlled acceptance, retries, and recovered claims.                                                    |
| Retry/resend         | Administrator retry, Faculty/Administrator resend, and student activation/recovery email refuse suppressed recipients.                                                                             |
| Queue                | Queued `PENDING`/`RETRY_SCHEDULED` deliveries are failed with `RECIPIENT_SUPPRESSED` when suppression is created.                                                                                  |
| Audit                | Suppression, suppression updates, and clearance append audit records. Raw provider payloads are not stored or displayed.                                                                           |
| Administrator UI     | `/notifications` now lists active suppressions with an audited clearance form. Complaint clearance requires explicit acknowledgement.                                                              |
| Status list          | Added audited regeneration repair, synchronized allocation versions, restored revoked bits, and fixed the bootstrap script so a rerun cannot overwrite or desynchronize a published list.          |
| Verification tooling | Added an external-consumer-style status-list verifier that fetches published artifacts over HTTP, verifies the Data Integrity proof directly, and decodes the bitstring independently.             |

## 3. Requirement traceability

| Requirement              | Evidence                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-013 Verification      | Public status-list returns HTTP 200; revoked and active credentials verified through the public page and external status-list consumer.                                               |
| FR-016 Revocation        | Revoked allocation index 1 remains revoked; signatures and historical credential payloads unchanged.                                                                                  |
| P1 Email notification    | Suppression enforced for issuance, revocation, retry, resend, and account email paths.                                                                                                |
| P1 Cryptographic signing | Status-list repair re-signed only the publication document with the existing active key; no key rotation and no credential rewrite.                                                   |
| FR-020 Audit log         | `notification.recipient_suppressed`, `notification.recipient_suppression_updated`, `notification.recipient_suppression_cleared`, and `credential-status-list.repaired` audit records. |
| MVP acceptance #10       | Revoked credential page reports revoked; active credential page reports cryptographically verified.                                                                                   |
| MVP acceptance #13       | Revocation history and immutable delivery/event history preserved.                                                                                                                    |
| MVP acceptance #14       | Suppression and repair actions are auditable by Administrators.                                                                                                                       |
| Security section         | Server-side authorization retained; webhook HMAC/raw-body validation/size/schema limits unchanged.                                                                                    |

## 4. Verification summary

- Format, lint, typecheck: pass.
- Unit tests: 115 files / 849 tests pass.
- Integration tests: 20 files / 145 tests pass on a freshly migrated disposable database.
- Playwright Phase 7 and Phase 8: 11 desktop + 11 mobile tests pass.
- Production build: pass.
- Migration deploy on a fresh database: pass.
- Public status list: HTTP 200 with valid signed JSON-LD.
- Independent external verification: proof verified, revoked index 1 set, active index 2 clear.
- System containers: db, signer, migrate, media-init, web, worker, and mailpit started; `/api/health` returns 200 with fresh worker heartbeat and ready signer.

## 5. Verdict

**Stage 5C.1 remediation: PASS locally.**

The two critical defects are resolved, regression tests pass, and the public status list is externally
verifiable. Production GO remains blocked on external provider/DNS/sender verification and the
remaining deployment risks in `STAGE5C1-REMAINING-RISKS.md`.
