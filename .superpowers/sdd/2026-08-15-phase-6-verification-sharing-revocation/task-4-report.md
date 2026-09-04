# Task 4 Report — Transactional Revocation, Authorization, and MariaDB Concurrency

## Status

Implementation and review fixes are complete. Authoritative MariaDB evidence was collected from fresh disposable Docker Compose projects with new named volumes, rather than the drifted shared database. The final review-fix run used `task4finalverify`, applied all eight migrations, and was removed with its volume after verification.

## Requirement Mapping

- **FR-012:** Revocation operates only on the immutable issuance identifier and leaves issuance snapshots untouched.
- **FR-016:** Active Administrator or currently owning active Faculty can revoke; reason/timestamp are persisted atomically; repeated requests are idempotent and historical data is retained.
- **FR-020:** The first successful revocation appends one `badge.revoked` audit record in the same transaction, with identifier-only context plus reason length/category.
- **FR-013:** The real MariaDB integration test verifies the public service immediately observes the persisted revoked state.
- **Acceptance 10, 13–15:** Lifecycle status, preserved history, auditability, authorization and transactional/concurrency tests are covered.

## Changed Files

- `src/modules/issuance/services/revocation-service.ts`
- `src/modules/issuance/services/revocation-service.test.ts`
- `src/modules/issuance/services/revocation-service.integration.test.ts`
- `src/app/issued/[issuanceId]/revocation-actions.ts`
- `src/app/issued/[issuanceId]/revocation-actions.test.ts`
- `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-4-report.md`

## Implementation Notes

- `revokeCredential(actor, { issuanceId, reason })` validates bounded base64url-style IDs and a trimmed 1–1000-character non-control-character reason before it opens a transaction.
- The transaction locks/reloads the current actor, issuance, and class with `FOR UPDATE`; accepts only an unchanged active Administrator or Faculty actor; and permits Faculty only for a currently owned class.
- Exact MariaDB snapshot-conflict errors (`P2010` / `1020`) map to the same safe unavailable error as absent/non-owned issuances.
- Only `status`, `revocationReason`, and `revokedAt` are updated. The first mutation writes exactly one audited `badge.revoked`; the audit never contains recipient data or reason text. Existing `REVOKED` rows return without updating or auditing.
- `revokeCredentialForAction` is a server-only internal helper that returns the authoritative locked class ID alongside the public result; `revokeCredential` retains its prescribed narrow result. The action accepts only `FormData`, reauthenticates via `getCurrentActor`, validates only issuance ID/reason, revalidates exact authenticated/public paths plus `/classes/{lockedClassId}/issued`, and redirects with `notice=revoked|existing`.
- The real MariaDB suite covers actor suspension and role-change races, an active credential whose `expiresAt` is already past, an actual MariaDB snapshot-isolation `P2010`/`1020` lock conflict, and a repeated request with a different reason while preserving the original reason/timestamp.
- Fixture teardown deletes only the exact fixture IDs and email, never a wildcard set of test-looking student accounts.

## RED / GREEN Evidence

### RED

`npm test -- src/modules/issuance/services/revocation-service.test.ts 'src/app/issued/[issuanceId]/revocation-actions.test.ts'` failed before implementation with two expected missing-module errors:

- `./revocation-service` did not exist.
- `./revocation-actions` did not exist.

The local integration runner also rejected the new suite before Docker setup because `TEST_DATABASE_URL` was absent, confirming it does not silently use a non-test database.

Review-fix RED evidence:

- The new action/helper contract test failed because `revokeCredentialForAction` did not exist and the action still imported `revokeCredential`; action tests consequently failed before any revalidation/redirect.
- The deliberate MariaDB regression check removed the transaction argument from the snapshot hook. The focused integration run then failed only the snapshot-conflict test with `TypeError: Cannot read properties of undefined`, proving the test reaches the transaction-bound lock-race seam; restoring the argument produced the safe `CredentialUnavailableError` result from the real `P2010`/`1020` conflict.

### GREEN

- Focused unit/action suite after review fixes: **2 files, 24 tests passed**.
- Focused fresh MariaDB Task 4 suite after review fixes: **1 file, 10 tests passed**.
- Full unit suite after review fixes: **51 files, 395 tests passed** (the runtime emitted one existing Node deprecation warning for `_channel`).
- Fresh MariaDB migration evidence: the isolated project applied all **8** checked-in migrations, `SHOW TABLES LIKE 'system_settings'` returned `system_settings`, and the second migration deployment reported no pending migrations.
- Final rebuilt Docker MariaDB suite on the fresh `task4finalverify` database: **4 files, 25 tests passed**. This includes all **10/10** Task 4 atomicity/concurrency/public-projection tests, Phase 4 issuance regressions (**3/3**), Phase 5 batch issuance regressions (**8/8**), and Task 1 settings regressions (**4/4**).

## Quality Gate Evidence

- `npm run format`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 395 tests.
- `npm audit`: passed, 0 vulnerabilities.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`: passed.
- The drifted shared database was not used as final evidence. The fresh disposable `task4finalverify` Compose project was stopped and removed with its explicitly named volume after integration verification.

## Assumptions

- Safe audit reason categories are length-only (`short` <=100, `medium` <=500, `long` >500), so audit context contains no revocation text or recipient data.
- The public `revokeCredential` result intentionally omits `classId`; the action uses the private server-only helper result obtained from the same locked transaction, rather than accepting a class ID from `FormData` or doing an unlocked follow-up read.

## Concerns

- The pre-existing shared Docker database remains drifted: it reports the Phase 6 settings migration as applied while lacking `system_settings`. It was deliberately left unchanged; the fresh isolated database supplied the authoritative clean migration and integration evidence.
