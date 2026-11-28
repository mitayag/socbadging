# Stage 7 Release 1B — Regression and Test Report

**Date:** 28 November 2026
**Release candidate:** `feature/stage7-release1-shared-badge-library` (`81579e9` application code)
**Environment:** macOS arm64 operator workstation; disposable MariaDB 11.8; Docker; Node 22 container.

## 1. Static and build gates

| Gate              | Command                                        | Result                                                               |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Formatting        | `npm run format`                               | PASS                                                                 |
| Lint              | `npm run lint`                                 | PASS (`--max-warnings=0`)                                            |
| Type check        | `npm run typecheck`                            | PASS                                                                 |
| Unit tests        | `npm test`                                     | **921 passed**, 124 files                                            |
| Integration tests | `vitest --config vitest.integration.config.ts` | **159 passed**, 23 files                                             |
| Production build  | `npm run build`                                | PASS                                                                 |
| GitHub CI         | Quality workflow                               | PASS (`46115842142`, `46116130003`; rerun on readiness commit below) |

## 2. End-to-end results

### Local functional suite (root specs, desktop + mobile)

Command: `npx playwright test e2e/*.spec.ts` against the disposable E2E database.

- **78 passed**, **2 skipped**, **0 failed**.
- Skipped: the two `student-import-evidence.spec.ts` screenshot-capture cases, which are evidence-capture helpers intentionally excluded from functional assertions.

Coverage includes: login/dashboard, faculty management, classes, rosters, student import, individual and batch issuance, revocation/replacement, public verification/sharing, student portal and account activation/recovery, notifications, audit logs, Phase 8 Open Badges conformance, and the new Stage 7 shared badge library.

### Stage 7 shared badge library (desktop + mobile)

`e2e/stage7-shared-badge-library.spec.ts` — **8 passed** (4 tests × 2 projects):

1. Administrator creates a standardized course and approves a shared badge.
2. Two faculty create their own sections, map the same course, assign the same approved badge, and cannot edit it; faculty cannot access `/catalog`.
3. Faculty can propose a badge but cannot approve it (no approve control; pending status).
4. Faculty cannot reach the approval queue or the administrator catalog.

Evidence screenshots: `docs/evidence/stage7-release1/course-catalog.png`, `badge-library-detail.png`, `class-shared-badge.png`.

### Production public acceptance

Command: `npx playwright test --config playwright.production.config.ts` against `https://socbadging.hausoc.org`.

- **2 passed** (desktop + mobile): health, database, signer, notifications, worker heartbeat, issuer, signing key and status list.
- **6 skipped**: authenticated production acceptance tests require `STAGEH_CREDENTIALS_FILE`, which was not supplied. No production credential was issued or used.

### Investigation of the two previously failed Stage H tests

**Root cause:** the production-only spec `e2e/production/stageh-acceptance.spec.ts` was executed by the default Playwright config against the disposable local E2E server. Its public health assertion expected the production signer to be ready, but the disposable server had no registered active signing key (`signer.status = unknown`).

**Resolution:** the spec is designed for `playwright.production.config.ts`, which targets `https://socbadging.hausoc.org`. Run that way, the two public tests pass on desktop and mobile. The six authenticated tests correctly skip without authorized Stage H credentials.

**Conclusion:** not a Stage 7 regression and not a production defect. Authenticated production acceptance remains pending approved credentials.

## 3. Functional acceptance mapping

| Scenario                                                       | Evidence                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Administrator creates/manages a standardized course            | Stage 7 E2E test 1; `course-service.test.ts`                                                 |
| Administrator creates/approves a shared badge                  | Stage 7 E2E test 1; `badge-library-service.test.ts`                                          |
| Faculty proposes a badge                                       | Stage 7 E2E test 3; unit tests                                                               |
| Multiple faculty assign the same approved badge                | Stage 7 E2E test 2; integration test 1                                                       |
| Faculty cannot modify an approved shared badge                 | Unit + E2E read-only assertion                                                               |
| Faculty cannot access another faculty's class/roster           | Existing authorization/student-import E2E suites; assignment unit/integration tests          |
| Duplicate class assignments prevented                          | Unit test + unique constraint                                                                |
| Individual and batch issuance                                  | Existing E2E + integration suites                                                            |
| New version does not alter historical credentials              | Integration test 3 (byte-identical snapshots/signatures)                                     |
| Archiving blocks new issuance without invalidating credentials | Integration test 4                                                                           |
| Student portal displays credentials                            | `student-portal.spec.ts` (desktop + mobile)                                                  |
| Public verification, QR, downloads, sharing                    | Production acceptance + `stage6a-sharing.spec.ts` + `phase8-open-badges-conformance.spec.ts` |
| Student import and password reset                              | `student-import.spec.ts`, `password-reset.spec.ts`, student portal recovery/reset E2E        |
| Notification delivery and audit logging                        | `phase7-notifications-hardening.spec.ts`, `audit-logs.spec.ts`, integration suites           |

## 4. Security verification

- Server-side authorization enforced for course, library, approval, version and assignment mutations.
- Faculty approval denial, approved-version revision denial, shared-template mutation denial and cross-owner assignment denial covered by unit tests.
- Ownership isolation and student/administrator denial covered by the existing security and E2E suites.
- Immutable versions and historical credential preservation verified by integration tests.
- Input validation via Zod and existing artwork validation; audit rows for every sensitive write.
- No secrets or student PII were printed, committed or exposed.

## 5. Skipped / not-run tests

| Test                                            | Reason                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Stage H authenticated production acceptance (6) | `STAGEH_CREDENTIALS_FILE` not supplied; requires authorized production test accounts |
| Student import evidence capture (2)             | Intentional evidence-capture helper, not a functional assertion                      |

## 6. Notes

- A benign E2E teardown warning (`destination stream errored while writing data`) appeared after the browser context closed during the mobile Stage 7 run; all tests passed and it does not affect the application.
- No production data, schema, containers or configuration were modified during testing.
