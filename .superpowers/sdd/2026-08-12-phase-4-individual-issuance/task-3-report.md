# Task 3 Report — Transactional Issuance Service and Authorization

## Status

Complete. Task 3 now has transaction-safe issuance, authorization, immutable transaction-built snapshots, narrow concurrency recovery, and executed MariaDB integration evidence. No routes, actions, query services, exports, UI, schema, or migrations were added or changed.

## Requirement Mapping

- FR-002 and Requirement 10: `issueBadge` remains a server-only Faculty-only mutation, with ownership rechecked from transaction-loaded class data before protected writes.
- FR-010 and acceptance criterion 6: active owned class, active owned badge, and active class enrollment are all validated in the issuance transaction.
- FR-012 and acceptance criterion 9: the class/badge/student tuple remains unique; random public IDs are retried only for their exact unique constraint; tuple collisions recover using a fresh read after the losing transaction has rolled back.
- FR-015: recipient, achievement, and issuer snapshots are constructed only from transaction-loaded records. The issuer name is read from `tx.user`, never a potentially stale session actor.
- FR-020: the issuance and `badge.issued` audit insert remain atomic in the same Prisma transaction, and audit context remains identifier-only.

## Files

- Modified `src/modules/issuance/services/issuance-service.ts`
- Modified `src/modules/issuance/services/issuance-service.test.ts`
- Created `src/modules/issuance/services/issuance-service.integration.test.ts`
- Modified `vitest.config.ts` to exclude opt-in integration tests from the normal unit suite
- Created `vitest.integration.config.ts`
- Created `src/test/integration-setup.ts`
- Modified `compose.yaml` with the Docker-network-only `integration` test profile
- Modified `package.json` with a Compose-profile integration-test shortcut
- Modified `README.md` with the runnable Compose integration command
- Modified `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-3-report.md`

`npm run test:integration` runs the opt-in Vitest suite, while `npm run test:integration:docker` runs it through the Compose-network profile. `TEST_DATABASE_URL` is required, and is assigned to the test process’s `DATABASE_URL`; the suite cannot silently use an application or production URL.

## Authorization, Transaction, and Concurrency Decisions

- The service requires `FACULTY` before opening a transaction. The transaction loads and validates the owned active class, transaction-loads the issuer User, validates the active same-class owned badge, validates active enrollment, performs the duplicate pre-check, builds snapshots, writes one issuance, then writes one audit entry.
- The transaction-time issuer lookup now constrains `id`, `role: FACULTY`, and `status: ACTIVE`, and defensively verifies the selected role/status before later badge, enrollment, snapshot, or write work. This closes the session-to-transaction suspension/role-change window while preserving the initial pre-transaction `requireRole` boundary.
- On an existing tuple the transaction returns it immediately with `alreadyIssued: true`; no snapshot, issuance, or audit write occurs.
- The inner transaction retries only exact public-ID `P2002` targets, at most three times. It rethrows exact tuple `P2002` values, allowing the failed transaction to roll back fully.
- The outer catch recognizes only the known tuple field targets, known constraint names, and Prisma 7 MariaDB adapter’s exact nested constraint index. It then issues a fresh autocommit `findUnique`, which can observe the winner that MariaDB repeatable-read hides from the failed transaction snapshot. Other database errors continue to propagate unchanged.
- The test-only synchronization seam is guarded by `NODE_ENV === "test"` and accessed through a private global symbol. It does nothing in production. The integration test uses it to hold both requests after their duplicate pre-checks, then asserts the hook fired exactly once in the outer tuple-conflict recovery branch.

## RED/GREEN Evidence

- RED: updated unit coverage failed because the snapshot builder received `actor.name` instead of the transaction-loaded user name, and tuple recovery performed no fresh outside-transaction read.
- GREEN: focused unit coverage passed after loading `tx.user` and moving tuple recovery outside the failed transaction.
- RED: MariaDB integration initially failed because the repository’s `test:integration` script referenced a missing config. After adding the config, Docker execution forced a real tuple `P2002`, which initially propagated because Prisma 7’s MariaDB adapter reports the exact index under `meta.driverAdapterError.cause.constraint.index`.
- RED: the focused regression for that nested adapter error failed before the exact index was recognized.
- GREEN: focused unit coverage passed with 17 tests after narrow recognition of that precise adapter index.
- GREEN: Docker Compose integration passed 3 tests: persisted issuance rollback on database audit failure, repeatable-read stale visibility versus fresh read, and deterministic tuple-`P2002` recovery after two post-precheck requests are released together.
- RED: suspension and role-change unit regressions both initially issued credentials because the transactional issuer lookup accepted stale actor authorization.
- GREEN: both regression cases pass after requiring and checking the transaction-loaded issuer’s active Faculty role; each proves no badge/enrollment read, snapshot construction, issuance, or audit write occurs after rejection.

## Docker Integration Execution

The database remains private to the Compose network; the `db` service has no host port mapping. The checked-in `integration` profile uses the existing Docker `tools` target and depends on the healthy database:

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=smoke-db-password MARIADB_ROOT_PASSWORD=smoke-root-password DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging TEST_DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging APP_URL=http://localhost:3000 npm run test:integration:docker
```

Final result: exit 0; 1 integration file and 3 MariaDB-backed tests passed in 545 ms after the image build. Individual tests have a 30-second Vitest cap, and the deterministic service race has its own five-second cap.

## Verification

- Scoped Prettier formatted the Task 3 service, unit/integration tests, configs, Compose file, and README.
- `npm test -- src/modules/issuance/services/issuance-service.test.ts` — passed: 1 file, 17 tests.
- `npm test -- src/modules/issuance/services/issuance-service.test.ts` after issuer revalidation — passed: 1 file, 19 tests.
- Docker Compose integration command above — passed: 1 file, 3 tests.
- `npm run lint` — passed after issuer revalidation.
- `npm run typecheck` — passed in a final sequential rerun after build.
- `npm test` — passed: 32 files, 139 tests after issuer revalidation.
- `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npm run build` — passed after issuer revalidation.
- `npm run format` is expected to remain blocked only by the pre-existing unformatted `task-1-review-package.md` and `task-2-brief.md`; scoped Task 3 files are formatted.

## Concerns

- Repository-wide format has the two pre-existing planning-document violations noted above. They remain untouched to avoid unrelated shared-workspace edits.
- The integration profile uses disposable local smoke credentials supplied at execution time only; no real credentials were added to source control.
