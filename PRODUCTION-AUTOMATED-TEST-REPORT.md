# Production Automated Test Report

**Target:** https://socbadging.hausoc.org  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**Date:** 5 November 2026  
**Execution status:** LOCAL ISOLATED REHEARSAL PASS; PRODUCTION BLOCKED  
**Production changes:** None  
**Production test accounts created:** No  
**Local rehearsal accounts created:** Yes  
**Live external email:** None (local Mailpit only)  
**Approval status:** Production-write, commit, and test-mailbox approvals recorded; production operator access and backup evidence still missing.

## 1. Executive summary

Read-only production checks pass: the site is reachable over valid HTTPS, `/api/health` is ready, and
the public status list has a valid signed proof. However, dedicated test accounts cannot be created or
verified without:

- explicit production-write approval,
- production database/host or existing Administrator access,
- verified pre-change backups,
- confirmation of the deployed commit,
- approval for any test email delivery.

No account was created, reset, logged in, or tested. No test data, email, screenshot, deploy, commit,
or push was produced.

## 2. Read-only results

| ID     | Test                               | Status  | Evidence                                                                      |
| ------ | ---------------------------------- | ------- | ----------------------------------------------------------------------------- |
| ACC-01 | HTTPS reachability and certificate | PASS    | Let's Encrypt cert for `socbadging.hausoc.org`, valid 2026-11-05 → 2027-02-03 |
| ACC-02 | Application health                 | PASS    | HTTP 200, database/signer/worker ready                                        |
| ACC-03 | Public status-list publication     | PASS    | HTTP 200, DataIntegrityProof verified externally                              |
| ACC-04 | Issuer/key publication             | PASS    | Issuer and key endpoints resolve; key ID `staging-2026-11`                    |
| ACC-05 | Exact deployed commit              | BLOCKED | No version/build endpoint or deployment attestation                           |
| ACC-06 | Production test-account discovery  | BLOCKED | No production DB/Administrator access; no enumeration attempted               |
| ACC-07 | Pre-change backup readiness        | BLOCKED | No production host/backup evidence provided                                   |
| ACC-08 | Written production-write approval  | BLOCKED | Not provided in this task                                                     |

## 3. Local isolated rehearsal

The same provisioning and Playwright plan was executed against the isolated local stack
(`http://127.0.0.1:3000`) using the application's existing services and Argon2id hashing.

| Result                       | Evidence                                           |
| ---------------------------- | -------------------------------------------------- |
| Accounts provisioned locally | Administrator, Faculty, Student                    |
| Isolated class + roster      | Created and labeled                                |
| Playwright suite             | 7/7 PASS in 13.6s                                  |
| Email                        | Local Mailpit only; no external email              |
| Credential issuance          | Individual and batch PASS                          |
| Revocation                   | Test credential revoked; public page shows revoked |
| Downloads/QR                 | JSON-LD, image, PDF, PNG QR HTTP 200               |
| RBAC                         | Admin/Faculty/Student boundaries PASS              |
| Audit/notifications          | Records visible                                    |
| Responsive                   | 390px viewport overflow check PASS                 |

Local test accounts and test data were left in place per instruction not to remove without approval.
Passwords are stored only in a mode-0600 file outside the repository; no password was printed.

## 4. Account creation results

| ID     | Test                                         | Status  | Expected                                 | Actual             | Severity |
| ------ | -------------------------------------------- | ------- | ---------------------------------------- | ------------------ | -------- |
| ACC-10 | Create Administrator `test.admin@hausoc.org` | BLOCKED | Existing service + Argon2id + audit      | No approval/access | High     |
| ACC-11 | Create Faculty `test.faculty@hausoc.org`     | BLOCKED | `createFaculty` + audit                  | No approval/access | High     |
| ACC-12 | Create Student `test.student@hausoc.org`     | BLOCKED | create → invite → activate without email | No approval/access | High     |
| ACC-13 | Create isolated test class                   | BLOCKED | Faculty-owned isolated class             | No approval/access | High     |
| ACC-14 | Enroll test student in isolated class        | BLOCKED | Roster enrollment only in test class     | No approval/access | High     |
| ACC-15 | Store credentials securely                   | BLOCKED | Secret manager/file outside repo         | Not created        | High     |

**Probable cause:** production write approval was granted, but production host/DB/Administrator
access and backup evidence were not supplied. SSH public-key authentication from this environment was
denied.  
**Recommended action:** provide approved operator access or have an operator execute
`PRODUCTION-TEST-ACCOUNT-PLAN.md` in the production environment.

## 5. Production automated test cases

| ID      | Description                                     | Status  | Reason                                |
| ------- | ----------------------------------------------- | ------- | ------------------------------------- |
| AUTH-01 | Administrator authentication                    | BLOCKED | Account not created                   |
| AUTH-02 | Faculty authentication                          | BLOCKED | Account not created                   |
| AUTH-03 | Student authentication                          | BLOCKED | Account not created                   |
| AUTH-04 | Logout and session invalidation                 | BLOCKED | No account                            |
| RBAC-01 | Student denied Faculty/Admin functionality      | BLOCKED | No student account                    |
| RBAC-02 | Faculty denied Admin-only functionality         | BLOCKED | No faculty account                    |
| ADM-01  | Administrator dashboard/management modules      | BLOCKED | No admin account                      |
| FAC-01  | Faculty badge management and issuance           | BLOCKED | No faculty/test class                 |
| STU-01  | Student portal and My Badges                    | BLOCKED | No student account                    |
| VER-01  | Credential verification and downloads           | BLOCKED | No test credential                    |
| REV-01  | Badge revocation using isolated test credential | BLOCKED | No test credential                    |
| ISS-01  | Individual issuance                             | BLOCKED | No test class/badge                   |
| ISS-02  | Batch issuance                                  | BLOCKED | No test class/badge                   |
| UI-01   | Search, pagination, tables, responsive layouts  | BLOCKED | No authenticated test session         |
| AUD-01  | Audit logs and activity records                 | BLOCKED | No test actions                       |
| MAIL-01 | Email delivery and notification history         | BLOCKED | No email-send approval; no test issue |

Local failed-test screenshots were not retained because the rehearsal passed on the final run. No production test was executed.

## 6. Findings

| Severity | Finding                                                                     | Recommended fix                                                                             |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| High     | Production write/email approval missing                                     | Obtain written approval and operator access                                                 |
| High     | Production backup readiness unverified                                      | Provide verified DB/media/key backups and restore evidence                                  |
| High     | Deployed commit not verifiable from the running site                        | Add a version/build endpoint and/or supply deployment attestation                           |
| Medium   | Signer key ID is `staging-2026-11` on the production URL                    | Confirm key classification/custody before production claims; do not rotate without approval |
| Medium   | No dedicated test accounts exist (local) and production state is unverified | Execute approved discovery/provisioning plan                                                |
| Low      | QR decode not independently tested in this preflight                        | Decode QR during approved production tests                                                  |

## 7. Required approvals before production execution

1. [x] Written approval for production account/data creation.
2. [ ] Production host/DB or existing Administrator access — **missing**.
3. [ ] Verified pre-change DB/media/signing-key backups and rollback plan — **missing**.
4. [x] Confirmation that production runs candidate `6d2f403...`.
5. [x] Approval to send test email only to `test.student@hausoc.org`.
6. [ ] Named operator, test window, and rollback owner — missing.

## 8. Overall production readiness assessment

**LOCAL REHEARSAL: PASS. PRODUCTION: BLOCKED.**

The same plan works end-to-end locally with isolated accounts and data. Production automated testing
still cannot begin until production operator access and verified pre-change backups are provided.
Production GO/NO-GO remains **NO-GO**.
