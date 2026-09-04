# Phase 8 — Task 2 Report: Signing, Status, and Replacement Persistence

## Status

**BLOCKED before implementation.** The required disposable MariaDB integration-test URL was not configured in this execution environment. The existing integration setup fails closed when `TEST_DATABASE_URL` is absent, and the only running Compose MariaDB service is the application service; per task constraints, it was not used, reset, migrated, or otherwise touched.

## Preconditions completed

- Read `AGENTS.md`, `REQUIREMENTS.md`, the task brief, the Phase 8 implementation plan, the Phase 8 design specification, and the existing Prisma/service/audit/integration-test patterns.
- Confirmed the integration harness sets `DATABASE_URL` only from `TEST_DATABASE_URL` in `src/test/integration-setup.ts`.
- Confirmed `TEST_DATABASE_URL` is missing without inspecting or exposing any `.env` contents or credentials.
- Confirmed a live Compose MariaDB instance is running, so it was intentionally excluded from all schema and test operations.

## TDD / RED-GREEN evidence

No RED tests were authored or run: creating schema-dependent integration tests without a safe disposable database would not satisfy the binding real-MariaDB coverage gate and could not be progressed safely. No production code was written.

## Test results

- Not run: `npm run test:integration -- src/modules/signing/key-service.integration.test.ts src/modules/issuance/services/status-allocation-service.integration.test.ts` — blocked by absent `TEST_DATABASE_URL`.
- Not run: `npm run db:generate`, focused unit tests, format/lint, typecheck, and production build — implementation was not started.

## Migration verification

No migration was created or applied. This avoids any possibility of applying a Phase 8 schema change to the live development MariaDB instance.

## Files changed

- Added this blocked-task report only: `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/task-2-report.md`.

## Self-review

- No application, Prisma schema, migration, test, environment, or Compose file was changed.
- No secrets or real credentials were read, printed, or stored.
- No Git repository was initialized and no commit was created.

## Requirements mapping

No functional requirement changed because the task is blocked. The pending work will underpin FR-010, FR-011, FR-012, FR-013, FR-015, FR-016, and FR-020, plus the Phase 8 signing/status/replacement invariants.

## Concern / required unblocker

Provide a configured, confirmed-disposable `TEST_DATABASE_URL` through the existing integration-test mechanism (for example, the documented `docker compose --profile test` flow). Once available, the task can begin with the mandated schema-failure RED integration tests and apply the new migration only to that disposable database.

---

## Resumed implementation

The parent established a dedicated MariaDB 11.8 disposable container on loopback port 3318 with no persistent volume. Every database command in this task used the supplied process-scoped `TEST_DATABASE_URL`/`DATABASE_URL`; `.env` was never edited or inspected, and the live Compose database was never queried, migrated, reset, or otherwise changed.

### Implementation

- Added `SigningKeyStatus` and the public-only `SigningKey`, `CredentialStatusList`, and `CredentialStatusAllocation` Prisma models.
- Extended `BadgeIssuance` with nullable legacy-safe `signedCredentialJson`, `signingKeyId`, `serializerVersion`, `supersedesId`, and `supersededById` mapped to the required database column names.
- Added restrictive foreign keys, unique constraints, status/public lookup indexes, and MariaDB triggers for replacement self/cycle protection and signed-history allocation deletion protection.
- Added public-key registration/lifecycle service operations. All require a current active `ADMIN`, use database locks, and atomically append a single `SigningKey` audit event.
- Added active-key set locking for concurrent activation; activation retires the previous active key and then activates the requested non-compromised key.
- Added transactional status allocation reservation. It locks the issuance, returns an existing allocation idempotently, reserves a unique cursor index, and returns the canonical public status-list URL. A short MariaDB advisory lock prevents repeatable-read cursor races; database unique constraints remain the integrity backstop.

### Strict TDD evidence

1. **RED:** Before Task 2 modules existed, the mandated integration command failed with both expected missing-module errors:
   - `Cannot find module './key-service'`
   - `Cannot find module './status-allocation-service'`
     The focused unit test also failed with the expected unresolved `./key-service` import.
2. Existing migrations were applied to the disposable database. After the new migration was initially added, Prisma reported a deterministic MariaDB migration failure at `DELIMITER $$`; Prisma Migrate executes statements directly and does not accept that client-side directive. The migration was minimally corrected to use direct `CREATE TRIGGER ... BEGIN ... END;` statements, then the explicitly authorized disposable schema was reset and all 12 migrations were applied successfully.
3. **GREEN:** Focused MariaDB integration tests passed with 13 tests, including concurrent key activation, concurrent unique index reservation, audit rollback, FK restrictions, replacement-cycle rejection, and prohibited-column inspection. The focused unit test passed.
4. A MariaDB error 1020 during the concurrent allocation RED-to-GREEN cycle was traced to a repeatable-read stale snapshot from a read-then-update status cursor. The allocation service now obtains its short advisory lock before any status-list read; the concurrent allocation test passes deterministically.

### Migration verification

- `npm run db:generate` — passed (Prisma Client v7.9.1 generated).
- `DATABASE_URL=<dedicated-disposable-db> npx prisma migrate reset --force` — passed after explicit parent authorization; all existing migrations plus `20260825_phase_8_open_badges_signing` applied successfully.
- `DATABASE_URL=<dedicated-disposable-db> npx prisma migrate status` — passed: database schema is up to date.

### Final verification

- Focused integration: `13 passed` across `key-service.integration.test.ts` and `status-allocation-service.integration.test.ts`.
- Focused unit: `1 passed` in `key-service.test.ts`.
- Full unit suite: `87 files, 520 tests passed` (one existing Node deprecation warning only).
- Full disposable MariaDB integration suite: `10 files, 46 tests passed`.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `DATABASE_URL=<dedicated-disposable-db> APP_URL=http://localhost:3000 npm run build` — passed.
- `npm run format` was run but remains non-zero because of five pre-existing/unrelated formatting-only files: Phase 8 progress/Task 1 report, the Phase 8 plan, and two checked-in Open Badges JSON contexts. Task 2 TypeScript files were individually formatted and checked. Prisma schema/SQL are not supported by this repository's Prettier parser.

### Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260825_phase_8_open_badges_signing/migration.sql`
- `src/modules/signing/key-service.ts`
- `src/modules/signing/key-service.test.ts`
- `src/modules/signing/key-service.integration.test.ts`
- `src/modules/issuance/services/status-allocation-service.ts`
- `src/modules/issuance/services/status-allocation-service.integration.test.ts`
- This report.

### Self-review

- No database column in the three new tables contains `private`, `secret`, or `seed`; a MariaDB `information_schema` integration assertion verifies this.
- Only public multikey metadata, URLs, and fingerprints are persisted. No private material is accepted by the service or present in the migration.
- Public key lifecycle authorization is server-side and revalidated from a locked current user row, not trusted from session claims alone.
- Registration, activation, retirement, and compromise all write an audit row after their state mutation within the same Prisma transaction; trigger-backed integration coverage proves each mutation rolls back when the audit insert fails.
- No Git repository was initialized and no commit was made. The required code-review skill was inspected, but no reviewer was dispatched because the task explicitly prohibits subagents.

### Requirements mapping

- **FR-002:** Current active `ADMIN` authorization is enforced server-side for every signing-key lifecycle action.
- **FR-010 / FR-011 / FR-012 / FR-015:** Durable foundations for later signed individual/batch issuance, immutable signed credentials, and credential export.
- **FR-013 / FR-016:** Persistent status-list allocations and replacement traversal/restriction foundations for public status verification and historical revocation.
- **FR-020:** Atomic audit records for signing-key registration and lifecycle changes.

### Concerns

- The repository-wide format gate has pre-existing failures outside this task, listed above; no unrelated files were reformatted.
- Status-list creation/regeneration and signed issuance/replacement orchestration remain intentionally deferred to later Phase 8 tasks. This task provides their persistence and transaction contracts only.

---

## Fix Round 1 — Review Findings

### Findings addressed

1. **Critical — compromised key reactivation:** `retireSigningKey` and `activateSigningKey` now reject a key that is currently `COMPROMISED` or has any non-null `compromisedAt` timestamp. The migration additionally adds `signing_keys_compromised_status_check`, preventing a persisted key with compromise history from being changed to any non-`COMPROMISED` state by a direct database update.
2. **Important — public Multikey validation:** Registration now validates the supplied material through the pinned `@digitalbazaar/ed25519-multikey` implementation and compares its canonical public export to the original value. This rejects malformed, PEM/private-key text and secret-multikey encodings before the transaction starts. Integration fixtures now use a real public Ed25519 Multikey; a test-generated ephemeral secret is never written or logged and proves secret material is rejected.
3. **Important — replacement cross-field and concurrent cycles:** A singleton `credential_replacement_guards` table is locked by both replacement triggers before inspecting the proposed relationship. That lock is held by the transaction through commit/rollback, serializing replacement writes. The triggers additionally reject one issuance assigning both replacement directions to the same peer. This preserves legitimate reciprocal cross-row history (`old.superseded_by_id = new`, `new.supersedes_id = old`) while rejecting same-direction cycles and contradictory pairs.
4. **Important — protected action authorization:** Integration coverage now exercises missing and FACULTY actors for activation, retirement, and compromise, and verifies stale session actors are denied when their database user is suspended, soft-deleted, or role-downgraded.
5. **Minor — same-issuance concurrency:** Added concurrent reservation coverage. Both requests return the same allocation and exactly one allocation row is persisted.

### Fix Round 1 TDD evidence

- **RED command:**
  `TEST_DATABASE_URL=<dedicated-disposable-db> npm run test:integration -- src/modules/signing/key-service.integration.test.ts src/modules/issuance/services/status-allocation-service.integration.test.ts`
  failed as expected before the fixes:
  - malformed private-key text was persisted;
  - `COMPROMISED → RETIRED` succeeded;
  - assigning both replacement relation fields to the same peer succeeded.
- **GREEN focused command:** the same command passed with **2 files / 19 tests** after the changes.
- The same-issuance concurrency regression test was added and already passed with the existing issuance-row lock; it now protects that foundational idempotency behavior.

### Migration correction verification

- Regenerated Prisma Client with `DATABASE_URL=<dedicated-disposable-db> npm run db:generate`.
- Reset only the explicitly authorized disposable schema with `prisma migrate reset --force`; all 12 migrations, including the corrected Phase 8 migration, applied successfully.
- `DATABASE_URL=<dedicated-disposable-db> npx prisma migrate status` reported `Database schema is up to date!`.

### Fix Round 1 verification

- Focused integration: `src/modules/signing/key-service.integration.test.ts` and `src/modules/issuance/services/status-allocation-service.integration.test.ts` — **19 passed**.
- Focused unit: `src/modules/signing/key-service.test.ts` — **1 passed**.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- Full unit suite: `npm test` — **87 files / 520 tests passed** (one pre-existing Node deprecation warning only).
- Full disposable integration suite: `npm run test:integration` — **10 files / 52 tests passed**.
- Production build: `DATABASE_URL=<dedicated-disposable-db> APP_URL=http://localhost:3000 npm run build` — passed.
- `npm run format` still reports only the pre-existing unrelated Phase 8 planning/report and checked-in context JSON formatting issues documented above; all edited TypeScript/declaration files were individually formatted.

### Fix Round 1 files added or changed

- `prisma/schema.prisma`
- `prisma/migrations/20260825_phase_8_open_badges_signing/migration.sql`
- `src/modules/signing/key-service.ts`
- `src/modules/signing/key-service.integration.test.ts`
- `src/modules/issuance/services/status-allocation-service.integration.test.ts`
- `src/types/ed25519-multikey.d.ts`
- This report.
