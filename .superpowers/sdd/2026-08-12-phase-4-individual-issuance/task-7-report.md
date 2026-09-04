# Phase 4 Task 7 — Integration, Docker, and Acceptance Preparation Report

## Status

Non-browser Task 7 work is complete. Phase 4 is **not** declared complete: the controller must still perform in-app Browser acceptance, historical-immutability validation, and final broad review.

## Exact Files Changed

- Modified `README.md` — documented issuer configuration, bootstrap workflow, authenticated issuance/download/export routes, Docker-network MariaDB integration command, and the unsigned/not-certified Open Badges status.
- Modified `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-1-review-package.md` — mechanical Prettier formatting only.
- Modified `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-2-brief.md` — mechanical Prettier formatting only.
- Created `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-7-report.md`.
- Created `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-7-browser-handoff.md`.

No application source, schema, migration, credential record, template, roster, or Compose configuration was changed by this task. One disposable local Administrator was created through the supported seed workflow solely to give the controller a known local acceptance account; its credentials are confined to the private browser handoff.

## Fresh Sequential Quality Gate

All commands below ran fresh from the workspace and exited `0`.

| Command                                                                                                   | Result                                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run format`                                                                                          | Passed: all matched files use Prettier code style.                               |
| `npm run lint`                                                                                            | Passed: `eslint . --max-warnings=0` returned no warnings.                        |
| `npm run typecheck`                                                                                       | Passed: `tsc --noEmit`.                                                          |
| `npm test`                                                                                                | Passed: 32 test files, 137 tests.                                                |
| `npm audit`                                                                                               | Passed: 0 vulnerabilities.                                                       |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` | Passed: production Next.js build completed and included Phase 4 issuance routes. |

## MariaDB Integration and Compose Smoke

| Command                                                                                                                                                                                                                                                                                                                       | Result                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=smoke-db-password MARIADB_ROOT_PASSWORD=smoke-root-password DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging TEST_DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging APP_URL=http://localhost:3000 npm run test:integration:docker` | Passed: 1 MariaDB-backed integration file, 3 tests.                        |
| `MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=smoke-db-password MARIADB_ROOT_PASSWORD=smoke-root-password DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging APP_URL=http://localhost:3000 docker compose up --build -d --wait`                                                                 | Passed: rebuilt production-like topology and waited for health.            |
| `docker compose ps` with the same smoke environment                                                                                                                                                                                                                                                                           | `db` healthy and `web` healthy; web published at `localhost:3000`.         |
| `curl -i http://127.0.0.1:3000/api/health`                                                                                                                                                                                                                                                                                    | Passed: HTTP 200 and `{"status":"ok","service":"hau-soc-badging-system"}`. |

The migration container log reported six checked-in migrations and `No pending migrations to apply.` The web log reported `Ready` and no application errors. Compose prints an informational warning that `TEST_DATABASE_URL` is unset when the optional test profile is not selected; that value is supplied for the separate integration command and the warning did not affect the smoke services.

## Local Acceptance Setup

The database was read only to identify existing disposable records, then the supported Compose `seed` profile created one local Administrator. The browser-ready account roles, IDs, active class/badge/student state, and local-only credentials are in `task-7-browser-handoff.md`. Both local account credentials were verified through the application login endpoint with HTTP 200; no browser automation was performed.

## Requirement Mapping

- **FR-010 / acceptance criterion 6:** the refreshed automated suite, MariaDB-backed transaction suite, and prepared active Faculty/class/badge/student flow cover the non-browser issuance foundation; actual UI issuance remains controller Browser work.
- **FR-012 / acceptance criterion 9:** the complete suite and MariaDB concurrency tests passed; the browser handoff includes an active issuance flow ready to verify a fresh non-sequential public ID.
- **FR-015:** production build includes the authenticated `application/ld+json` credential route; README explicitly states output is unsigned and aligned, not certified.
- **FR-020:** MariaDB integration tests passed the transaction/audit rollback coverage already implemented in Task 3.
- **FR-021 / FR-022:** production build includes role-scoped issuance records and CSV endpoints; browser filter/export checks remain controller work.
- **Security and integrity rules:** no real credentials were added to source; all local acceptance data is disposable; Docker migration/web health and audit-sensitive integration checks passed. Historical snapshots were not edited or overwritten.

## Remaining Browser Work and Concerns

- The controller must perform the Browser-only Faculty issuance/idempotency, list/filter/export, Administrator read-only, non-owner denial, visual/mobile/console, and historical immutability checks described in the approved Task 7 plan.
- Phase 5 batch issuance and Phase 6 public verification/revocation are out of Phase 4 scope.
- No issue was found in this non-browser task. The only non-error environmental limitation was that Docker socket and local mapped-port inspection required the approved elevated local access; all requested checks completed successfully once that access was used.
