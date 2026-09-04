# Task 5: Require Signing for Individual Issuance

## Files

- Create `src/modules/issuance/services/signed-issuance-service.ts` plus unit and MariaDB integration tests.
- Modify `src/modules/issuance/services/issuance-service.ts` plus unit and integration tests.
- Modify `src/components/issuance/issue-badge-form.tsx` and test.

## Interface

- `prepareSignedIssuance(input): Promise<PreparedSignedIssuance>`.
- Prepared result includes public ID, immutable source snapshots, immutable signed document, signing key ID, serializer version, and status reservation.

## Requirements

1. Strict TDD proves signer timeout/invalid proof commits no issuance/audit/notification; success commits exactly one issuance, one audit, one notification; signed JSON includes proof/status; duplicate/concurrent issuance consumes no visible credential; private recipient fields never enter signer payload or audit.
2. Signer I/O remains outside the main commit transaction.
3. Commit transaction rechecks duplicate, ownership, active/uncompromised key, status reservation, and signed-document invariants before persistence.
4. Map signer unavailability to retryable safe message exactly: `Credential signing is temporarily unavailable. No badge was issued. Try again.` Invalid payload/proof is non-retryable and includes a safe correlation ID; never expose internal signer codes.
5. Preserve server-side authorization inside every mutation boundary; do not trust rendered-page/session claims or client-supplied ownership.
6. Preserve accessible form focus and polite live-region behavior; pending UI follows current React 19/Next 16 form conventions and avoids extra client serialization/state.
7. Run focused service/form/notification/authorization tests, real MariaDB integration tests, full regression, lint, typecheck, targeted formatting, and production build.

## Binding constraints

- New credentials commit only after successful signing; signer failure creates no issuance/audit/email outbox.
- Issuance requires an atomic audit and immutable signed snapshot.
- Historical credentials are never rewritten.
- Use reviewed Task 2 allocation/key persistence, Task 3 typed signer client, Task 4 canonical builder/status contracts.
- Do not hold DB transactions open across signer network I/O.
- Read AGENTS.md and REQUIREMENTS.md completely; follow Next 16 guides under `node_modules/next/dist/docs/` for forms/server actions.
- Do not touch live DB, `.env`, SMTP, initialize Git, commit, or dispatch subagents.

## Test database

Only `TEST_DATABASE_URL=mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test` is disposable and authorized.
