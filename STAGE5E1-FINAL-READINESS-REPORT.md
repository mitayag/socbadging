# Stage 5E.1 Final Application and Integration Readiness Report

**Date:** 5 November 2026  
**Proposed release:** `0.5.0-rc.1`  
**Production deployment:** Prohibited / not performed  
**Live external email:** Not sent  
**DNS or production signing key changed:** No  
**Commit/push/merge/publish:** No

## 1. Summary

Stage 5E.1 closes the application-level gap that remained after Stage 5D: production email is no
longer blocked by an unconditional exact-recipient allowlist. Delivery now uses explicit
LOCAL/STAGING/PRODUCTION policies with immutable system-envelope authorization, retention of the
staging allowlist, fail-closed configuration, and the existing durable suppression/authorization
controls.

The application, integration, signing, data, security, and release-candidate gates pass locally and
in isolated staging. External Brevo/DNS/NPM production-key acceptance remains outside this stage and
therefore production remains NO-GO.

## 2. Task results

| Task                                     | Result                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| E1 Recipient allowlist production policy | PASS — local/staging/production policies, envelope/token checks, fail-closed |
| E2 Brevo integration readiness           | PASS for local/configuration; controlled external acceptance plan prepared   |
| E3 Production credential signing         | PASS locally; production key/HTTPS activation pending                        |
| E4 Production data readiness             | PASS locally; 27 legacy records preserved/quarantined                        |
| E5 Security and operational readiness    | PASS for production dependencies; external activation pending                |
| E6 Full regression                       | PASS — unit/integration/E2E/build/staging smoke                              |
| E7 Release candidate review              | PASS for content/version; publication and commit withheld                    |

## 3. E1 recipient policy outcome

- `EMAIL_RECIPIENT_POLICY=local`: Mailpit only; Brevo rejected.
- `EMAIL_RECIPIENT_POLICY=staging`: exact-recipient allowlist preserved.
- `EMAIL_RECIPIENT_POLICY=production`: authorized system-issued recipients, no allowlist.
- Brevo mode fails closed without an explicit policy.
- Worker, retry, resend, and student email enforce policy plus immutable issuance/student-token
  checks.
- Suppression is checked before every attempt and cannot be silently cleared.

Details: `STAGE5E1-RECIPIENT-POLICY.md`.

## 4. E2 Brevo outcome

Audited SMTP/TLS, sender verification, DNS authentication, webhook authentication, provider status
correlation, suppression, and retry lifecycle. Added `scripts/brevo-readiness.ts` and
`scripts/arm-controlled-acceptance.ts`. The acceptance plan requires written authorization before a
single external message is sent.

No external delivery result is claimed. Details: `STAGE5E1-BREVO-ACCEPTANCE-PLAN.md`.

## 5. E3 signing outcome

- Public issuer/key/status-list endpoints are available locally.
- External-style status-list proof verification passed.
- Key backup decrypted and restored into a ready signer runtime.
- Key lifecycle, rotation/retirement, compromise rejection, signed issuance, revocation, and
  historical verification tests passed.
- Final HTTPS issuer and production key activation remain external.

Details: `STAGE5E1-SIGNING-ACCEPTANCE.md`.

## 6. E4 data outcome

- 36 issuances, of which the known 27 legacy test artifacts remain unsigned/quarantined.
- No signed credential lacks a key or allocation; no orphan allocations; no status-version mismatch.
- Fresh DB/media backup and checksums verified.
- Separate encrypted signing-key backup decrypted and validated.
- No deletion or destructive change performed.
- Integration and E2E databases are now separate with guard rails.

Details: `STAGE5E1-DATA-READINESS.md`.

## 7. E5 security outcome

- Authorization, ownership isolation, password reset, verification/revocation, rate limiting, secret
  handling, network isolation, monitoring, and incident-response controls reviewed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Full audit retains 14 dev-only advisories (4 high, 10 moderate) in build/test tooling.
- No production high/critical finding identified.

Details: `STAGE5E1-SECURITY-REVIEW.md`.

## 8. E6 test outcome

| Gate                      | Result                                    |
| ------------------------- | ----------------------------------------- |
| Format/lint/typecheck     | PASS                                      |
| Unit                      | 115 files / 859 tests PASS                |
| Integration               | 20 files / 148 tests PASS                 |
| Playwright desktop+mobile | 57 passed, 1 skipped by design            |
| Fresh migrations          | PASS for test and E2E databases           |
| Isolated staging smoke    | PASS                                      |
| Production build          | PASS                                      |
| Fixture isolation         | PASS — E2E then integration without reset |

Details: `STAGE5E1-TEST-RESULTS.md`.

## 9. E7 release candidate outcome

- Version set to `0.5.0-rc.1` in `package.json` and `package-lock.json`.
- Inclusion/exclusion, secret scan, documentation consistency, reproducible build, and artifact
  checksums documented.
- No commit, tag, push, publish, or production deployment.

Details: `STAGE5E1-RELEASE-CANDIDATE.md`.

## 10. Final decision

1. **Stage 5E.1: CONDITIONAL PASS.**  
   Application and integration readiness passes locally/staging. Conditions are external acceptance
   tasks, not known application defects.

2. **Exact remaining external acceptance requirements:**
   - written authorization for one controlled Brevo test;
   - verified sender domain, SPF/DKIM/DMARC, and Brevo sender approval;
   - Brevo SMTP credentials and webhook registration;
   - NPM/HTTPS proxy host and certificate validation;
   - production signing-key generation/activation and HTTPS issuer verification;
   - production backup/vault and monitoring/on-call provisioning;
   - controlled external delivery, inbox confirmation, webhook lifecycle, suppression, and
     revocation/status-list evidence.

3. **Production GO/NO-GO: NO-GO.**  
   Blocked by incomplete external acceptance and production activation, not by an identified
   application regression.

4. **Stage 5E.2:** **May begin** for external acceptance/production activation preparation after
   written authorization, approved environment/credentials, and separate approval for any
   deployment or commit.

No secrets were revealed. No production deployment, live email, DNS change, production key
activation, destructive database change, commit, push, merge, or publication occurred.
