# Task 1 Brief: Typed Issuer Settings Schema and Authorized Service

Read this first — it is your requirements, with exact values to use verbatim.

Implement Task 1 from `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` using strict TDD. Read `AGENTS.md`, `REQUIREMENTS.md`, and the approved Phase 6 design completely before editing.

## Files

- Modify `prisma/schema.prisma`.
- Create `prisma/migrations/20260815_phase_6_system_settings/migration.sql`.
- Create `src/modules/settings/types.ts`.
- Create `src/modules/settings/services/system-settings-service.ts`.
- Create `src/modules/settings/services/system-settings-service.test.ts`.

## Required interfaces

- `PublicSystemSettings` and `SystemSettingsInput` runtime schemas/types.
- `getPublicSystemSettings(): Promise<PublicSystemSettings>`.
- `getAdminSystemSettings(actor): Promise<PublicSystemSettings>`.
- `updateSystemSettings(actor, input): Promise<PublicSystemSettings>`.

## Required behavior

- Use a typed singleton `SystemSetting` table with `id = "default"`, nullable issuer name/URL/logo path/support contact overrides, `sharingEnabled` default true, nullable `updatedByUserId`, and timestamps.
- Blank database state falls back to validated `getServerEnv()` values and returns no secret.
- Only an active Administrator may read the Administrator form or mutate settings. Deny unauthenticated, Faculty, suspended/deleted, and role-changed actors before mutation and revalidate current actor state inside the transaction.
- Validate URL lengths, safe root-relative logo path, and support contact as either a safe `mailto:`/email value or HTTPS/HTTP URL according to the approved design. Empty support contact normalizes to null.
- Update through singleton upsert and write exactly one atomic `settings.updated` audit. Audit context contains changed field names only, never prior/new values or secrets.
- No schema relation that could cascade-delete settings history. Every schema change has the forward migration.
- Use `import "server-only"`, small reusable functions, existing authorization/error patterns, and modern TypeScript/Zod conventions.

## TDD and verification

Write named failing tests first and record RED evidence. Then implement minimally and record GREEN. Cover defaults, validation, Administrator success, all denial cases, transaction revalidation, atomic audit, and no writes on denial.

Run Prisma format/generate, deploy the migration to disposable MariaDB, focused tests, format, lint, typecheck, full tests, and configured production build. Do not claim success if any check fails.

Write the full report to `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-1-report.md`, including changed files, RED/GREEN evidence, commands with exact counts/exit codes, assumptions, and concerns. Return only status, a one-line verification summary, and concerns.
