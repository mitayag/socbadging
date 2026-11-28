# Stage 7 Release 1D — Test Account Retirement Report

**Date:** 28 November 2026
**Scope:** retirement of the dedicated STAGE7 production acceptance accounts and test data
**Result:** PASS

## 1. Accounts retired

| Account                            | Role    | Final status |
| ---------------------------------- | ------- | ------------ |
| `stage7.test.admin@hausoc.org`     | ADMIN   | SUSPENDED    |
| `stage7.test.faculty.a@hausoc.org` | FACULTY | SUSPENDED    |
| `stage7.test.faculty.b@hausoc.org` | FACULTY | SUSPENDED    |
| `stage7.test.student.a@hausoc.org` | STUDENT | SUSPENDED    |
| `stage7.test.student.b@hausoc.org` | STUDENT | SUSPENDED    |

- `sessionVersion` incremented for each account.
- 46 active sessions deleted.
- 0 password-reset tokens and 0 student tokens remained.
- Accounts were not hard-deleted; audit history is preserved.

## 2. Test records archived

| Record type                                     | Count | Action   |
| ----------------------------------------------- | ----- | -------- |
| Test classes (`STAGE7-CAP-001` A/B)             | 2     | ARCHIVED |
| Test courses (`STAGE7-CAP-001`, `STAGE7-E2E-*`) | 3     | ARCHIVED |
| Test badge definitions (`STAGE7 E2E …`)         | 12    | ARCHIVED |
| Test badge versions                             | 16    | ARCHIVED |
| Test class badge assignments                    | 10    | ARCHIVED |
| Materialized test badge templates               | 10    | ARCHIVED |

No row was hard-deleted. Cleanup recorded `stage7.test_data_archived` in the audit log with counts.

## 3. Credentials removal

- Production temporary credentials file deleted immediately after secure transfer.
- Local credentials file deleted with overwrite (`rm -P`); directory removed.
- No credentials appear in the repository, documentation, screenshots, test results or CI artifacts.
- The provisioning and cleanup scripts contain only test email addresses and identifiers, never passwords.

## 4. Production integrity after cleanup

| Metric                                      | Result                  |
| ------------------------------------------- | ----------------------- |
| Active STAGE7 users                         | 0 (5 suspended)         |
| STAGE7 sessions                             | 0                       |
| Production issuances                        | 3                       |
| Issuance identity CRC32                     | 10420535069 (unchanged) |
| Signed credential CRC32                     | 5032942483 (unchanged)  |
| Notification deliveries                     | 4                       |
| Delivery attempts                           | 2                       |
| Audit logs                                  | 181 (preserved)         |
| Existing production accounts/classes/badges | Not modified            |

## 5. Historical preservation

- No historical credential was deleted, reissued or modified.
- No public ID, signature, expiration date or revocation state changed.
- No notification or delivery-attempt record was removed.
- Audit records for provisioning, acceptance and cleanup remain.

## 6. Operational state

- Production remains on `c64038b` with healthy web/worker/signer/db/mailpit.
- Staging was restarted after the build and is healthy.
- The three pre-existing operator scripts remain untracked and untouched.
