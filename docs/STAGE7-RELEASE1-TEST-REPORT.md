# Stage 7 Release 1 — Test Report

**Date:** 28 November 2026
**Branch:** `feature/stage7-release1-shared-badge-library`
**Environment:** macOS arm64 workstation; disposable MariaDB 11.8; Docker; Next.js 16.4.3; Node 22 container.

## 1. Gate results

| Gate                  | Command                                                                     | Result                                                                 |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Formatting            | `npm run format`                                                            | PASS                                                                   |
| Lint                  | `npm run lint`                                                              | PASS (`--max-warnings=0`)                                              |
| Type check            | `npm run typecheck`                                                         | PASS                                                                   |
| Unit tests            | `npm test`                                                                  | **921 passed**, 124 files                                              |
| Integration tests     | `vitest --config vitest.integration.config.ts`                              | **159 passed**, 23 files                                               |
| E2E — Stage 7 desktop | `playwright test e2e/stage7-shared-badge-library.spec.ts --project=desktop` | **3 passed**                                                           |
| E2E — Stage 7 mobile  | same, `--project=mobile`                                                    | **3 passed**                                                           |
| E2E — full suite      | `playwright test`                                                           | **76 passed, 8 skipped, 2 failed** (see §4)                            |
| Production build      | `npm run build`                                                             | PASS; routes `/catalog`, `/library`, `/library/[definitionId]` emitted |
| Migration validation  | `tsx scripts/stage7-release1-migrate.ts [--apply]`                          | Dry-run, apply and second apply PASS (idempotent)                      |

## 2. New automated coverage

### Unit

- `course-service.test.ts`: faculty cannot create/update/archive courses; faculty cannot map another owner's class; admin mapping payload.
- `badge-library-service.test.ts`: status rollup, faculty approval denial, faculty revision of approved definitions blocked, non-owner submission blocked, archived-course creation blocked, duplicate candidate reporting.
- `class-badge-assignment-service.test.ts`: cross-faculty denial, unapproved version denial, duplicate assignment prevention, template materialization, wrong-course denial.
- `badge-authorization.test.ts`: faculty cannot mutate a shared materialized template.
- `navigation.test.ts`: catalog/badge library navigation and faculty restrictions.

### Integration (MariaDB)

`shared-badge-issuance.integration.test.ts`:

1. Two faculty issue the same approved definition to their own sections with distinct public IDs and signed credentials tied to the shared version.
2. Cross-section issuance by a non-owner faculty is rejected; repeat issuance is handled idempotently (`alreadyIssued`).
3. Approving a new version leaves the existing signed credential and achievement snapshot byte-identical.
4. Archiving preserves the historical credential and blocks new issuance via the archived materialized template.

### E2E (Playwright, desktop + mobile)

`e2e/stage7-shared-badge-library.spec.ts`:

1. Administrator creates a standardized course and approves a shared badge.
2. Two faculty create their own sections, map the same course, and assign the same approved badge; the shared badge is read-only; `/catalog` is inaccessible to faculty.
3. Faculty cannot reach the approval queue.

Evidence screenshots:

- `docs/evidence/stage7-release1/course-catalog.png`
- `docs/evidence/stage7-release1/badge-library-detail.png`
- `docs/evidence/stage7-release1/class-shared-badge.png`

## 3. Migration validation

| Step                          | Observed                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Dry-run on sample legacy data | 1 course to create; 2 classes mapped; 2 definitions planned; 2 duplicate groups; 0 errors |
| Apply                         | Course, 2 definitions, 2 versions, 2 assignments, 2 template links created                |
| Second apply                  | 0 writes; 2 templates already linked (idempotent)                                         |
| Reconciliation report         | JSON + Markdown emitted; duplicates reported, not merged                                  |
| Existing records              | `badge_issuances` rows not updated; signatures unchanged                                  |

## 4. Full E2E suite note

The full Playwright run reported 76 passed, 8 skipped and 2 failed. Both failures are the pre-existing `e2e/production/stageh-acceptance.spec.ts` production probe, which executes when a Stage H credentials file is present and asserted against the disposable local E2E server (`signer.status` was `unknown`). They are unrelated to Stage 7 and do not occur in the Stage 7 spec or the existing functional suites. No Stage 7 test failed.

## 5. Reproduction

```sh
# Unit / static gates
npm run format && npm run lint && npm run typecheck && npm test && npm run build

# Integration (dedicated disposable database)
TEST_DATABASE_URL="mysql://user:pass@127.0.0.1:3307/badging_integration" \
  npx vitest run --config vitest.integration.config.ts

# Migration validation
DATABASE_URL="mysql://user:pass@127.0.0.1:3307/badging_rehearsal" \
  npx tsx scripts/stage7-release1-migrate.ts            # dry run
DATABASE_URL="..." npx tsx scripts/stage7-release1-migrate.ts --apply

# Stage 7 E2E
E2E_DATABASE_URL="mysql://user:pass@127.0.0.1:3307/badging_e2e" \
E2E_CONFIRM_DISPOSABLE_DATABASE=true \
  npx playwright test e2e/stage7-shared-badge-library.spec.ts
```
