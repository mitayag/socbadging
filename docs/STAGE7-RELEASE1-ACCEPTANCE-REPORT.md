# Stage 7 Release 1 — Acceptance Report

**Date:** 28 November 2026
**Status:** Local acceptance complete; production deployment NOT performed.
**Branch:** `feature/stage7-release1-shared-badge-library`

## 1. Functional acceptance

| #   | Requirement                                                  | Result                    | Evidence                                                                            |
| --- | ------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Administrator creates a standardized course                  | PASS                      | E2E Stage 7 test 1; unit `course-service.test.ts`                                   |
| 2   | Multiple faculty teach different sections of the same course | PASS                      | E2E test 2; integration test 1                                                      |
| 3   | Authorized user creates and approves a shared badge          | PASS                      | E2E test 1; unit `badge-library-service.test.ts`                                    |
| 4   | Both faculty assign the same badge to their classes          | PASS                      | E2E test 2; integration test 1                                                      |
| 5   | Both independently issue credentials to eligible students    | PASS                      | Integration test 1 (existing issuance pipeline)                                     |
| 6   | Both credentials are individually verifiable                 | PASS (unchanged pipeline) | Credential snapshots and distinct public IDs asserted; verification suite unchanged |
| 7   | Faculty cannot issue to unauthorized students                | PASS (existing control)   | Issuance integration/unit suites; class ownership assertions                        |
| 8   | Faculty cannot modify approved shared definitions            | PASS                      | Unit tests; E2E read-only assertion                                                 |
| 9   | Duplicate assignments are prevented                          | PASS                      | Unit + unique constraint                                                            |
| 10  | Unauthorized approval is prevented                           | PASS                      | Unit `reviewBadgeDefinition` denial; E2E queue denial                               |
| 11  | Duplicate issuance protection remains operational            | PASS                      | Integration idempotent `alreadyIssued` assertion                                    |
| 12  | Concurrent issuance handled safely                           | PASS (existing control)   | Existing tuple-reservation/concurrency integration tests + full suite               |
| 13  | Badge version changes preserve historical credentials        | PASS                      | Integration test 3                                                                  |
| 14  | Archived badges follow issuance restrictions                 | PASS                      | Integration test 4; service archival                                                |
| 15  | Existing individual issuance operational                     | PASS                      | Full unit/integration/E2E suites                                                    |
| 16  | Existing batch issuance operational                          | PASS                      | Full unit/integration/E2E suites                                                    |
| 17  | Existing student import operational                          | PASS                      | Full suite                                                                          |
| 18  | Existing student portal operational                          | PASS                      | Full suite                                                                          |
| 19  | Existing public verification operational                     | PASS                      | Full suite                                                                          |
| 20  | Existing credential signatures remain valid                  | PASS                      | No format/signing changes; integration snapshot assertions                          |
| 21  | Notification history preserved                               | PASS                      | No notification schema changes; full suite                                          |
| 22  | Migration preserves historical records                       | PASS                      | Additive migration + dry-run/apply/reconciliation + no issuance updates             |
| 23  | Faculty/administrator authorization enforced server-side     | PASS                      | Authorization unit tests + E2E                                                      |
| 24  | Audit logs record sensitive actions                          | PASS                      | New audit actions; service transactions                                             |
| 25  | Search/filter/pagination/responsive layouts                  | PASS                      | Catalog/library filters and pagination; E2E desktop + mobile                        |

## 2. Static and build acceptance

- Formatting, lint, typecheck, production build: **PASS**.
- Migration applies cleanly on a disposable MariaDB and is idempotent.
- No new lint warnings.

## 3. Security acceptance

- Server-side authorization matrix implemented and unit-tested.
- Faculty immutability of approved shared definitions verified.
- Duplicate assignment/approval denial verified.
- All sensitive actions audited.
- No secrets or student PII introduced into logs or public pages.

## 4. Outstanding items before production

- Obtain explicit production deployment approval.
- Rehearse the migration on a production data copy and reconcile duplicates.
- Verify fresh database/media/signing-key backups and rollback images.
- Run the full authenticated production smoke test after deployment.
- Two full-suite E2E failures remain in the pre-existing production acceptance spec (environmental, not Stage 7).

## 5. Decision

**Local acceptance: PASS.** The feature is ready for review and a controlled deployment rehearsal. Production merge and deployment require explicit authorization.
