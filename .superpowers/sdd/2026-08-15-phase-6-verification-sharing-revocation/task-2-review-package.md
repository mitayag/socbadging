# Task 2 Independent Review Package

Review Task 2 only against `task-2-brief.md`, the approved Phase 6 design/plan, `AGENTS.md`, and `REQUIREMENTS.md`.

## Exact review scope

- `src/modules/issuance/services/snapshot-schemas.ts`
- `src/modules/issuance/services/issuance-query-service.ts`
- `src/modules/verification/types.ts`
- `src/modules/verification/services/public-credential-service.ts`
- `src/modules/verification/services/public-credential-service.test.ts`
- `src/modules/verification/services/public-credential-json.ts`
- `src/modules/verification/services/public-credential-json.test.ts`
- `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-2-report.md`

## Required review checks

1. Verify specification compliance and code quality independently.
2. Re-check the privacy boundary recursively: no email, full student number, student/internal IDs, issuer user data, private paths, or raw snapshots.
3. Verify strict fail-closed snapshot parsing, credential-free HTTP(S) URLs, and exact configured-origin canonical credential IDs.
4. Verify lifecycle precedence/boundaries and immutable issuance-time content.
5. Verify JSON-LD keeps the hashed identity and Open Badges fields, adds deterministic lifecycle metadata, and never invents a proof or certification claim.
6. Verify Task 1 settings contribute only support contact and sharing state.
7. Run appropriate focused tests and type checking. Report findings by severity with exact file/line evidence.

Return separate `SPEC COMPLIANCE` and `CODE QUALITY` verdicts. Do not edit files.
