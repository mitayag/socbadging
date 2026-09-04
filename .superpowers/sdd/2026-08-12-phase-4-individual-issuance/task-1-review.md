# Phase 4 Task 1 Review — Issuance Schema and MariaDB Migration

## Scope reviewed

Reviewed the task brief, implementer report, and review package, then directly inspected every task-owned implementation file:

- `prisma/schema.prisma`
- `prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql`
- `src/modules/issuance/types.ts`

Task 1 is limited to the Prisma schema, checked-in MariaDB migration, and explicit TypeScript contracts. No issuance service, protected route, UI, audit write, or revocation behavior is expected or reviewed here.

## Verdicts

- **Specification compliance: PASS.** The schema contains the required enum, issuance fields, uniqueness constraints, query indexes, restrictive historical relations, and reverse relations. The migration creates exactly the new issuance table and foreign keys without touching earlier migrations. The TypeScript contracts are explicit domain shapes independent of Prisma JSON types and cover the required recipient, achievement, issuer, credential, list-item, and result contracts.
- **Code quality: PASS.** The schema is internally consistent with the migration, identifiers and database names are clear, and the contracts are narrow and strongly typed. No `Record<string, unknown>` or Prisma JSON types occur in the snapshot-contract module. The task-owned files contain no credentials or secrets.

## Specification evidence

- The required `ACTIVE`, `REVOKED`, and `EXPIRED` status values are declared in [schema.prisma](../../../prisma/schema.prisma#L35-L39), and the migration creates the matching MariaDB enum in [migration.sql](../../../prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql#L8).
- `BadgeIssuance` contains each requested ID, status/date, snapshot, version, revocation, and timestamp field in [schema.prisma](../../../prisma/schema.prisma#L205-L223). `id` uses `cuid()`, `publicId` is unique and `VARCHAR(191)`, and `snapshotVersion` defaults to `1`.
- Every historical parent relation is explicitly restrictive in [schema.prisma](../../../prisma/schema.prisma#L224-L227), with matching `ON DELETE RESTRICT` foreign keys in [migration.sql](../../../prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql#L30-L38). Reverse relations are present on `User`, `Class`, `Student`, and `BadgeTemplate` in [schema.prisma](../../../prisma/schema.prisma#L74), [schema.prisma](../../../prisma/schema.prisma#L123), [schema.prisma](../../../prisma/schema.prisma#L141), and [schema.prisma](../../../prisma/schema.prisma#L197).
- The public-ID and class/template/student uniqueness boundaries are enforced by [schema.prisma](../../../prisma/schema.prisma#L207) and [schema.prisma](../../../prisma/schema.prisma#L229), and by the matching database indexes in [migration.sql](../../../prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql#L20-L21).
- All five required list/query indexes are present in [schema.prisma](../../../prisma/schema.prisma#L230-L234) and in [migration.sql](../../../prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql#L22-L26).
- The migration is additive: it creates only `badge_issuances` and adds its four foreign-key constraints ([migration.sql](../../../prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql#L1-L38)); it does not alter existing tables or prior migration files.
- `RecipientSnapshot`, `AchievementSnapshot`, and `IssuerSnapshot` explicitly include the required historical recipient, badge/class, expiration, and issuer/faculty fields in [types.ts](../../../src/modules/issuance/types.ts#L1-L58). The achievement and credential shapes include optional alignment and tags in [types.ts](../../../src/modules/issuance/types.ts#L10-L45) and [types.ts](../../../src/modules/issuance/types.ts#L60-L97).
- `OpenBadgeCredentialSnapshot` explicitly represents the approved JSON-LD context, credential/subject/issuer/achievement shapes, hashed recipient identity, and optional expiration in [types.ts](../../../src/modules/issuance/types.ts#L60-L97). It does not rely on a Prisma JSON type.
- `IssuanceListItem` is restricted to identifiers, status/dates, and snapshot-oriented class/badge/recipient/issuer values in [types.ts](../../../src/modules/issuance/types.ts#L99-L118); `IssuanceResult` exactly has `{ issuanceId, publicId, alreadyIssued }` in [types.ts](../../../src/modules/issuance/types.ts#L120-L124).

## Verification performed

- `DATABASE_URL='mysql://badging:badging@127.0.0.1:3306/badging' npx prisma validate` — passed.
- `DATABASE_URL='mysql://badging:badging@127.0.0.1:3306/badging' npm run db:generate` — passed; Prisma Client 7.9.1 generated.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm test` — passed: 21 files, 53 tests.

`npx prisma validate` without `DATABASE_URL` correctly stopped at the repository's required Prisma configuration environment variable; supplying the configured local MariaDB URL allowed validation to pass. No database mutation was performed during this review.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Requirements mapping

- **FR-010 / FR-012:** Durable single-issuance storage, immutable internal ID, public ID, and tuple uniqueness are supported by the schema and migration.
- **FR-015:** Explicit immutable snapshot storage and Open Badges–aligned credential TypeScript contracts are present.
- **FR-016:** Status and revocation fields exist, and restrictive foreign keys preserve issuance history.
- **FR-020 / FR-021 / FR-022:** The issuer relation, filtering indexes, and private list-item data contract establish the required foundations; audit writes and authorized query/export behavior are intentionally future Task scope.
