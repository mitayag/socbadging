# Task 1 Report — Typed Issuer Settings Schema and Authorized Service

## Status

DONE

## Requirement mapping

- **FR-023:** Added typed Administrator-managed issuer name, issuer URL, issuer logo path, support contact, and sharing visibility settings with deployment-environment fallback.
- **FR-020:** Each settings update writes one transactional `settings.updated` audit event whose context contains only changed field names.
- **FR-002 / FR-001 security constraints:** The settings-form read and mutation boundaries require an active, currently authoritative Administrator. The mutation repeats that check inside its transaction.

## Changed files

- `prisma/schema.prisma` — added the singleton `SystemSetting` Prisma model. Its nullable `updatedByUserId` is a scalar, deliberately not a relation.
- `prisma/migrations/20260815_phase_6_system_settings/migration.sql` — forward migration for the `system_settings` table only; it has no foreign key or destructive cascade.
- `src/modules/settings/types.ts` — Zod runtime schemas/types and reusable root-relative-path validation.
- `src/modules/settings/services/system-settings-service.ts` — server-only public/admin reads and transactional update service with authoritative locking.
- `src/modules/settings/services/system-settings-service.test.ts` — 26 focused behavior, validation, authorization, revalidation, locking, and audit tests.
- `src/modules/settings/services/system-settings-service.integration.test.ts` — four MariaDB rollback/concurrency/authorization-race tests.

## Behavior delivered

- Blank settings state falls back to validated `getServerEnv()` issuer values and emits only the narrow public settings DTO.
- Input enforces the database field bounds; issuer URLs must be credential-free HTTP/HTTPS; logo paths must be safe root-relative paths; support contact accepts only an email, safe `mailto:` email, or credential-free HTTP/HTTPS URL. Blank support contact normalizes to `null`.
- Form reads and updates reject anonymous, Faculty, suspended, deleted, and role-changed actors. Updates check authoritative user state once before the transaction and then lock/revalidate the user row with `FOR UPDATE` before any settings or audit write.
- Updates materialize and `FOR UPDATE` lock the singleton before calculating the audit delta, use `upsert` for `id = "default"`, set `updatedByUserId`, and append exactly one `settings.updated` audit record in the same transaction. Audit context is `{ changedFields: string[] }` only.

## Strict TDD evidence

### RED

Command:

```text
npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **1**. Vitest collected **0 tests** because it could not resolve the missing `./system-settings-service` module. This was the intended missing-production-module failure after the contract suite was written.

### GREEN

Command:

```text
DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npx prisma format && DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npm run db:generate && npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **0**. Prisma format and client generation completed, then the focused suite passed: **1 test file, 21 tests passed**.

Fresh focused verification after the final formatting/self-review:

```text
npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **0** — **1 test file, 21 tests passed**.

## Verification commands

| Command                                                                                                                                                                                                                                                              | Result                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npx prisma format`                                                                                                                                                                                               | exit 0                                                                                                                                                                                          |
| `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npm run db:generate`                                                                                                                                                                                             | exit 0                                                                                                                                                                                          |
| `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npx prisma validate`                                                                                                                                                                                             | exit 0; schema valid                                                                                                                                                                            |
| `npm test -- src/modules/settings/services/system-settings-service.test.ts`                                                                                                                                                                                          | exit 0; 1 file, 21 passed                                                                                                                                                                       |
| `npm run lint`                                                                                                                                                                                                                                                       | exit 0                                                                                                                                                                                          |
| `npm run typecheck`                                                                                                                                                                                                                                                  | exit 0                                                                                                                                                                                          |
| `npm test`                                                                                                                                                                                                                                                           | exit 0; 45 files, 314 passed (Node emitted pre-existing `[DEP0129] _channel is deprecated` warning)                                                                                             |
| `npm audit`                                                                                                                                                                                                                                                          | exit 0; 0 vulnerabilities                                                                                                                                                                       |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`                                                                                                                                                            | exit 0; optimized production build succeeded                                                                                                                                                    |
| `npm run format`                                                                                                                                                                                                                                                     | exit 1 because the pre-existing `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` is not Prettier-formatted; all Task 1 TypeScript files were formatted separately |
| `MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=phase6-settings-password MARIADB_ROOT_PASSWORD=phase6-settings-root-password DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging docker compose -p phase6settings up -d --wait db` | exit 1; Docker daemon unavailable at `unix:///Users/marlontayag/.docker/run/docker.sock`, so disposable-MariaDB migration deployment could not run                                              |

## Debugging notes

- The first unconfigured Prisma format/generate attempt failed because `prisma.config.ts` requires `DATABASE_URL`. The command was rerun with a disposable test URL and succeeded.
- The first TypeScript check after implementation found that `Prisma.TransactionClient` cannot be assigned to `typeof prisma`; the authoritative-user helper was narrowed to the structural `Pick<typeof prisma, "user">` dependency. The subsequent typecheck and focused tests passed.

## Assumptions

- The update input is a complete settings form payload, so all five public settings fields are required. This keeps the singleton upsert deterministic and matches the future Administrator form.
- `changedFields` compares persisted override values to the submitted values. Creating an override that matches an environment fallback is therefore recorded as a database field change, while the audit still contains no values.
- Issuer and support URLs are restricted to credential-free HTTP/HTTPS URLs to prevent presentation settings from introducing non-web or credential-bearing links.

## Concerns

The full unit suite continues to emit Node's existing `[DEP0129]` `_channel` deprecation warning. It does not fail the suite and is outside Task 1 scope.

## Fix Round 1 — Concurrency and MariaDB verification

### Review findings addressed

1. The transaction now authoritatively locks the current Administrator row using `SELECT ... FOR UPDATE`, rejects suspended/deleted/disappeared/role-changed states before settings work, and holds that lock through audit commit.
2. The transaction now materializes the singleton with an insert-on-duplicate-key statement and locks it with `SELECT ... FOR UPDATE` before it reads the baseline used for `changedFields`. This serializes first-use and concurrent updates.
3. MariaDB lock values normalize `BOOLEAN` `0`/`1` results before delta comparison, preventing false `sharingEnabled` audit changes.
4. The new real MariaDB suite proves audit-failure rollback, concurrent update audit accuracy, stale-actor rejection, and lock-held suspension serialization.
5. Unit coverage adds invalid-input no-write protection and transaction-time deleted, disappeared, role-changed, and suspended denial cases.

### RED evidence

After adding the locking/transaction tests before the implementation change:

```text
npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **1** — **5 failed, 20 passed (25 total)**. The old implementation made no singleton bootstrap/locking calls and accepted all four transaction-time invalid Administrator states.

The first real MariaDB integration run then exposed the driver-specific boolean baseline issue:

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=phase6-settings-password MARIADB_ROOT_PASSWORD=phase6-settings-root-password DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging TEST_DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging APP_URL=http://localhost:3000 docker compose -p phase6settings --profile test run --rm integration
```

Result: exit **1** — **1 failed, 14 passed (15 total)**. The concurrent-audit test observed changed-field counts `[2, 3]` rather than `[1, 2]`; MariaDB returned `sharing_enabled` as numeric `0`/`1` and strict comparison treated it as changed.

The focused runtime regression test was added next and failed as expected:

```text
npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **1** — **1 failed, 25 passed (26 total)**. The audit incorrectly contained `sharingEnabled` for equivalent `0`/`false` values.

### GREEN evidence

```text
npm test -- src/modules/settings/services/system-settings-service.test.ts
```

Result: exit **0** — **1 file, 26 passed**.

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=phase6-settings-password MARIADB_ROOT_PASSWORD=phase6-settings-root-password DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging APP_URL=http://localhost:3000 docker compose -p phase6settings up -d --wait db
```

Result: exit **0** — isolated `phase6settings-db-1` became healthy.

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=phase6-settings-password MARIADB_ROOT_PASSWORD=phase6-settings-root-password DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging APP_URL=http://localhost:3000 docker compose -p phase6settings run --rm migrate
```

Result: exit **0** — all eight migrations, including `20260815_phase_6_system_settings`, applied successfully to the disposable MariaDB database.

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=phase6-settings-password MARIADB_ROOT_PASSWORD=phase6-settings-root-password DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging TEST_DATABASE_URL=mysql://badging:phase6-settings-password@db:3306/badging APP_URL=http://localhost:3000 docker compose -p phase6settings --profile test run --build --rm integration
```

Result: exit **0** — **3 files, 15 passed**; the settings suite contributed four MariaDB tests.

### Final fix-round verification

| Command                                                                                                   | Result                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npx prisma format`                                    | exit 0                       |
| `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npm run db:generate`                                  | exit 0                       |
| `npm run format`                                                                                          | exit 0                       |
| `npm run lint`                                                                                            | exit 0                       |
| `npm run typecheck`                                                                                       | exit 0                       |
| `npm test`                                                                                                | exit 0; 45 files, 319 passed |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` | exit 0                       |
