# Task 2: Add Signing, Status, and Replacement Persistence

Source plan: `/Users/marlontayag/Desktop/SOC Badging System/docs/superpowers/plans/2026-08-25-phase-8-open-badges-issuer-conformance.md`

## Files

- Modify `prisma/schema.prisma`.
- Create `prisma/migrations/20260825_phase_8_open_badges_signing/migration.sql`.
- Create `src/modules/signing/key-service.ts`, unit test, and MariaDB integration test.
- Create `src/modules/issuance/services/status-allocation-service.ts` and MariaDB integration test.

## Interfaces

- `registerPublicSigningKey(input, actor): Promise<SigningKeyView>`.
- `activateSigningKey(keyId, actor): Promise<SigningKeyView>`.
- `retireSigningKey(keyId, actor)` and `markSigningKeyCompromised(keyId, actor)`.
- `reserveStatusAllocation(tx, issuancePublicId): Promise<{ listId: string; index: number; statusUrl: string }>`.

## Required invariants

1. New database tables contain no column whose name includes `private`, `secret`, or `seed`.
2. Exactly one `ACTIVE` signing key is allowed under concurrent activation; enforce with transactional locking because MariaDB has no portable partial unique index.
3. Fingerprint and verification-method URL are unique.
4. Status-list index is unique within one list; one issuance has at most one allocation.
5. Replacement relations cannot self-reference or form an immediate two-node cycle.
6. Deleting keys, status lists, allocations, or superseded issuances referenced by history is restricted.
7. Create `SigningKeyStatus`, `SigningKey`, `CredentialStatusList`, `CredentialStatusAllocation`; extend `BadgeIssuance` with nullable legacy-safe `signedCredentialJson`, `signingKeyId`, `serializerVersion`, `supersedesId`, and `supersededById` fields with the exact mapped database names from the plan.
8. Add restrictive foreign keys and indexes for public lookup, active-key selection, allocation, status updates, and replacement traversal.
9. Registration, activation, retirement, and compromise each write exactly one audit record in the same transaction. Actor context is mandatory; protected/public actions accept only `ADMIN`.
10. Use strict TDD: observe missing-schema failures, implement minimal schema/migration/services, generate Prisma client, then pass deterministic MariaDB integration tests including concurrency.

## Commands and gates

- `npm run db:generate`.
- With the existing disposable test database configuration, run `npm run test:integration -- src/modules/signing/key-service.integration.test.ts src/modules/issuance/services/status-allocation-service.integration.test.ts`.
- Run focused unit tests, lint, and typecheck.
- Do not alter or expose the real `.env`/SMTP password and do not reset or destroy the live development database.

## Binding global constraints

- Every schema change has an explicit migration and real MariaDB integration coverage.
- Every protected action has server-side authorization tests.
- Key lifecycle changes write audits atomically; no private key material enters MariaDB or logs.
- Historical credentials remain immutable and legacy rows remain valid.
- Read `AGENTS.md` and `REQUIREMENTS.md` completely before editing.
- Do not dispatch subagents, initialize Git, or commit.

## Existing dependency interface

- Task 1 created strict proof transport and local context modules under `src/modules/open-badges/`; Task 2 should not modify them.
