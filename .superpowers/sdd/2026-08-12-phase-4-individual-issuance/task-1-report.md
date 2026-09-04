# Phase 4 Task 1 — Issuance Schema and MariaDB Migration Report

## Status

Complete. This task establishes the schema and explicit type contracts only; it does not add issuance services, routes, UI, audit writes, or revocation behavior.

## Requirement Mapping

- **FR-010:** Adds the durable issuance record required for one Faculty-to-student issuance.
- **FR-012:** Adds an immutable issuance ID, unique public ID, and the one-issuance-per-class/template/student database constraint.
- **FR-015:** Adds independent, explicit Open Badges 3.0-aligned credential snapshot contracts and immutable JSON storage columns.
- **FR-016:** Reserves status, revocation reason, and revocation timestamp fields while preserving issuance history through restrictive foreign keys.
- **FR-020:** Provides the issuer relation needed for later transactional issuance audit records; this task intentionally does not create audit entries.
- **FR-021 / FR-022:** Adds the query indexes and role-authorized list-item contract needed by later list/filter/export work.

## Files

- Modified `prisma/schema.prisma`
  - Added `BadgeIssuanceStatus` (`ACTIVE`, `REVOKED`, `EXPIRED`).
  - Added `BadgeIssuance` with required snapshots, versioning, status/revocation fields, unique constraints, indexes, and `Restrict` relations.
  - Added reverse issuance relations to `User`, `Class`, `Student`, and `BadgeTemplate`.
- Created `prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql`
  - Creates the MariaDB `badge_issuances` table and its restrictive foreign keys without modifying prior migrations.
- Created `src/modules/issuance/types.ts`
  - Defines `RecipientSnapshot`, `AchievementSnapshot`, `IssuerSnapshot`, `OpenBadgeCredentialSnapshot`, `IssuanceListItem`, and `IssuanceResult`, plus explicit nested Open Badges types.

## Design Decisions

- Snapshot domain contracts are plain explicit TypeScript object shapes, independent of Prisma `Json` types and without catch-all `Record<string, unknown>` fields.
- Recipient email is part of the private recipient snapshot/list contract only. The credential type represents the recipient through the typed hashed identity object.
- `issuedAt` is required and supplied by the later issuance transaction, while `snapshotVersion` defaults to `1` in the database.
- The tuple unique key is the concurrency-safe duplicate boundary. Parent relations use `ON DELETE RESTRICT` so issued history cannot disappear through normal parent deletion.
- `IssuanceListItem` uses snapshotted class, badge, recipient, and issuer values rather than mutable live credential-critical data.

## Verification

- `DATABASE_URL='mysql://badging:badging@127.0.0.1:3306/badging' npm run db:generate` — passed; Prisma Client 7.9.1 generated successfully.
- `DATABASE_URL='mysql://badging:badging@127.0.0.1:3306/badging' npx prisma format` — passed; schema formatted.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm test` — passed: 21 files, 53 tests.
- `DATABASE_URL='mysql://badging:badging@127.0.0.1:3306/badging' APP_URL='http://localhost:3000' npm run build` — passed.
- `docker compose run --build --rm migrate` against the healthy local MariaDB — passed; Prisma found six migrations and applied `20260812130000_phase_4_individual_issuance` successfully. No reset or destructive database operation was run.

No focused unit test was added because this task adds only declarative schema and TypeScript contracts; the existing automated suite remains green.

## Concerns

- `npm run format` was run and reports existing formatting failures only in `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/progress.md` and `task-1-brief.md`. Those coordination files were not changed by this task and were left untouched.
- The first Docker migration attempt used the previously built tools image, which saw only five migrations and made no database changes. Rebuilding the one-shot tools image then applied the new sixth migration successfully.
- `prisma migrate diff --from-migrations ...` cannot run in this repository because the established migration directory has no `migration_lock.toml`; direct Prisma deployment provides the successful migration evidence instead.
