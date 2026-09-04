# Task 3 Report — Authorized Preview Creation and Retrieval

## Status

Implemented the authorized batch-preview service only. This covers FR-011 (server-validated, expiring batch previews), FR-012 (idempotent existing-issuance identifiers in preview rows), FR-020 (atomic private-safe audit), and FR-021 (authorized batch detail/history reads). No commit service, route, action, report route, template, schema migration, or UI was added.

## Files

- `src/modules/issuance/services/batch-preview-service.ts`
- `src/modules/issuance/services/batch-preview-service.test.ts`

## RED / GREEN

- RED: `npm test -- src/modules/issuance/services/batch-preview-service.test.ts` failed because `./batch-preview-service` did not exist.
- GREEN: the initial focused suite passed with 17 tests.
- Review round 1 RED: named sparse-row, 101-column row, and aggregate cell-payload boundary coverage failed because an overwide JSON row was accepted and persisted.
- Review round 1 GREEN: the focused suite passes with 18 tests after raw JSON row bounds, a faithful canonical set-query fixture, and exact classified-row/fingerprint persistence assertions.

## Decisions

- Preview rejects unauthenticated and non-Faculty actors before opening a transaction. The transaction independently reads the actor's database User with `id`, `role=FACULTY`, and `status=ACTIVE` before class, badge, student, or persistence work.
- Active class and badge reads bind the exact class, Faculty owner, badge owner, and badge status. Inaccessible, cross-owner, cross-class, and inactive targets return the safe `BatchNotFoundError` and create neither preview nor audit record.
- Submitted filename, mapping, and raw rows are bounded and validated before persistence. Preview JSON allows at most 5,000 rows, 100 columns per row, 10,000 characters per cell, and 1,048,576 aggregate UTF-8 cell bytes. The one-MiB row-payload cap is intentionally below the established two-MiB file limit to leave headroom for JSON structure while protecting the separately reachable preview boundary. Sparse rows, overwide rows, individual oversize cells, and aggregate oversize payloads fail safely before a transaction. Mapping and row normalization/classification/fingerprint are delegated to the Task 2 server-only helpers.
- Classification uses one bounded `Student.findMany`, one bounded active `ClassStudent.findMany`, and one bounded `BadgeIssuance.findMany`; lookups are canonicalized using lowercase trimmed student-number keys. There are no row-by-row database reads.
- Preview creation and `badge.batch_previewed` audit creation share one Prisma transaction. The expiry is derived once from one `createdAt` reference. Audit context contains exactly IDs and counts, never filename, mapping, row payloads, or supplied email.
- Detail uses a scoped `findFirst` for Faculty (`class.ownerUserId`) and no unrestricted existence probe, preserving safe not-found equivalence. Stored JSON is parsed through Task 1 schemas and count reconciliation before return; malformed snapshots become `BatchUnavailableError`.
- History uses a 20-row, `createdAt DESC, id DESC` projection that omits mapping JSON, rows JSON, and recipient email. Administrators have class-scoped read-only global access; Faculty is owner-scoped.

## Verification

- `npm test -- src/modules/issuance/services/batch-preview-service.test.ts` — pass, 18 tests.
- `npm run format` — pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm test` — pass, 36 files / 201 tests.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` — pass.

## Concerns

- The unconfigured `npm run build` correctly stops during route configuration collection because `DATABASE_URL` is required; it passed with the disposable local configuration above.
- Transaction rollback is covered through propagated audit failure in the unit seam. A later MariaDB integration suite should additionally exercise physical rollback with a real database transaction.
