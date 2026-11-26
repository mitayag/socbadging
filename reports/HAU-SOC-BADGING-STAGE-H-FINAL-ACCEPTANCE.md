# HAU SOC Badging — Stage H Final Production Acceptance

**Date:** 24 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production host/project:** `badging-server` / `hau_soc_badging_stage2`  
**Production changes in this phase:** None  
**Live emails sent:** None

## 1. Executive summary

Production web, database, signer, notification worker, and heartbeat are healthy and stable. The
corrected issuer configuration is now live: the public issuer ID uses `socbadging.hausoc.org`, the
verification method is nonempty, the public key endpoint returns HTTP 200, and the signed status-list
proof verifies externally.

Final production acceptance still cannot be completed because the authorized production test
accounts, production-safe Playwright runner, Brevo inbox pilot, and current backup/signing-key
recovery evidence were not available or authorized in this execution. No production test account,
badge, email, or cleanup operation was performed.

**Final decision: CONDITIONAL GO for monitored existing operation; NO-GO for full production
acceptance and new issuance rollout.** Public issuer/status-list verification is now PASS.

## 2. Production health

| Check                       | Result                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `/api/health`               | PASS — HTTP 200, readiness ready, database/signer/notifications ready, heartbeat fresh |
| `/login`                    | PASS — HTTP 200                                                                        |
| Public issuer profile       | **PASS** — correct `socbadging.hausoc.org` ID and nonempty verification method         |
| Public signing-key endpoint | **PASS** — HTTP 200, active `staging-2026-11`, `eddsa-rdfc-2022`                       |
| Status-list proof           | **PASS** — independently verified with `scripts/verify-status-list-external.ts`        |
| Security headers            | PASS — `X-Frame-Options`, `nosniff`, referrer policy, permissions policy               |
| Worker stability            | PASS over the observed short window                                                    |

## 3. Issuer/key correction result

The previously failing public issuer/key endpoints are fixed:

```text
GET /api/issuers/hau-soc
id = https://socbadging.hausoc.org/api/issuers/hau-soc
verificationMethod = [
  "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11"
]

GET /api/issuers/hau-soc/keys/staging-2026-11
HTTP 200
keyTrust.state = ACTIVE

status-list proof verification: PASS
```

## 4. Tests executed

### Production read-only

| Check                                       | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `/login`                                    | PASS — HTTP 200                                               |
| `/api/health`                               | PASS — HTTP 200 ready/fresh                                   |
| `/api/issuers/hau-soc`                      | **PASS** — correct issuer ID and nonempty verification method |
| `/api/issuers/hau-soc/keys/staging-2026-11` | **PASS** — HTTP 200, active key                               |
| `/api/status-lists/status-list-local`       | **PASS** — external Data Integrity proof verified             |
| Security headers on login/health            | PASS — X-Frame-Options, nosniff, referrer, permissions policy |
| Restricted SSH forced command               | PASS — command probe returned only status                     |

### Automated/local

Existing local results, not re-run in Stage H:

- Unit: 875 PASS.
- Integration: 150 PASS.
- Playwright: 61 passed, 1 skipped by design.

These are not production acceptance evidence.

### Production Playwright/account tests

**BLOCKED / NOT TESTED.** No authorized production test accounts, dedicated production test runner, or
production-write confirmation was available. The local Playwright global setup is destructive and must
not be run against production.

## 5. Test accounts and cleanup

**NOT TESTED / BLOCKED.** No production test accounts were created. No cleanup was required.

The plan remains in `PRODUCTION-TEST-ACCOUNT-PLAN.md` and
`reports/PHASE-H-PRODUCTION-ACCEPTANCE-PROCEDURE.md`; it requires explicit authorization.

## 6. Badge issuance, verification, and email

- Production badge issuance: **NOT TESTED**.
- Production revocation/expiration: **NOT TESTED**.
- Test credential verification: **NOT TESTED**.
- Public status-list proof resolution: **PASS**.
- Brevo test email: **NOT SENT / NOT TESTED**.
- Inbox confirmation: **NOT AVAILABLE**.
- No duplicate/unauthorized email evidence exists because no email was sent.

SMTP acceptance must not be treated as inbox delivery; none was attempted.

### 6.1 Test-recipient update

The approved test recipient is now `authorized-test-recipient@example.org`, replacing
`test.student@hausoc.org` for Stage H. Prepared but not applied:

- `deploy/production-brevo.override.yaml` now sets the allowlist to `authorized-test-recipient@example.org` for both
  web and worker (SHA-256 `8e314a5fda4ab1f00e02c2520a6fd2ea03d9b265062d3d8108f05308e8e3aa2c`).
- `EMAIL_RECIPIENT_POLICY=staging` is preserved.
- Provisioning and cleanup scripts now use `authorized-test-recipient@example.org` for the test Student.
- Local provisioning/cleanup validation passed with the new recipient; no email was sent.
- Production allowlist change and worker/web recreation are **BLOCKED pending approval**.
- No production email was sent to the new or old address.

## 7. RBAC and security

- Production RBAC/account isolation: **NOT TESTED**.
- Local RBAC, ownership isolation, session, rate-limit, and audit tests remain PASS from prior
  reports, not production acceptance.
- Session cookies are HTTP-only, secure when HTTPS, `SameSite=Lax`.
- Origin checks and shared rate limits are implemented.
- Worker/web/db/signer network separation and container restrictions are configured.
- Production test-account/password/permission behavior is unverified.
- Signing key authorization: signer healthy and public key publication PASS.

## 8. Backup and signing-key recovery

| Item                                     | Status                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Historical VM/DB/media evidence          | PASS (prior records)                                                             |
| Current backup checksum/restore evidence | **BLOCKED** — not available/not run                                              |
| Independent encrypted signing-key backup | **BLOCKED** — none identified/verified                                           |
| Rollback images                          | PASS — `socbadging-web:rollback-20261123`, `socbadging-worker:rollback-20261123` |
| Migration requirement                    | NONE                                                                             |
| Production image identity                | **BLOCKED** — not independently verified from this access                        |

No backup or signing key was created, restored, exposed, or overwritten in Stage H.

## 9. Final acceptance gates

| Gate                                   | Status                   |
| -------------------------------------- | ------------------------ |
| Web readiness                          | PASS                     |
| Database readiness                     | PASS                     |
| Signer health                          | PASS                     |
| Worker/heartbeat                       | PASS (short observation) |
| Public issuer/key publication          | **PASS**                 |
| SMTP/email configuration               | BLOCKED / not tested     |
| Approved email delivery                | NOT TESTED               |
| Administrator production functionality | NOT TESTED               |
| Faculty production functionality       | NOT TESTED               |
| Student production functionality       | NOT TESTED               |
| Badge lifecycle production             | NOT TESTED               |
| RBAC/ownership production              | NOT TESTED               |
| Security checks                        | PARTIAL                  |
| Backup verification                    | BLOCKED                  |
| Signing-key recovery                   | BLOCKED                  |
| Audit evidence                         | NOT TESTED (production)  |

## 10. Exact remaining actions

1. Create/reuse the authorized isolated production test accounts using the approved provisioning
   procedure; record operator/window/rollback owner.
2. Run a production-safe Playwright acceptance suite. Do not run the destructive local global setup
   against production.
3. Issue one isolated test badge and verify signing, JSON-LD, public page, downloads/QR, status proof,
   and duplicate prevention. Revoke only that test credential if authorized.
4. Perform exactly one approved Brevo pilot to `authorized-test-recipient@example.org`; confirm provider event and
   actual inbox receipt, not merely SMTP acceptance.
5. Complete current DB/media backup verification and independent signing-key backup/recovery, or
   explicitly accept the residual risk under approval.
6. Clean up/suspend test accounts and test records while preserving audit and immutable credential
   history.
7. Verify health, issuer, key, status list, and worker readiness after cleanup.

## 11. Decision

**CONDITIONAL GO for monitored existing operation; NO-GO for full production acceptance and new
issuance rollout.**  
Web/database/signer/worker health and public issuer/key/status-list verification are PASS, but
production functional, email, test-account, backup, and signing-key recovery acceptance remain
blocked/not tested.

No production change, deployment, account change, badge issuance, secret/key change, or email was
performed.
