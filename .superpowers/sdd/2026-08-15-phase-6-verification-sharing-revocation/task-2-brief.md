# Task 2 Brief: Privacy-Safe Public Credential and JSON-LD Services

Read this first — it is your requirements, with exact values to use verbatim.

Implement Task 2 from `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` using strict TDD. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 6 design, and the Task 1 public settings types/service before editing.

## Files

- Create `src/modules/verification/types.ts`.
- Create `src/modules/verification/services/public-credential-service.ts`.
- Create `src/modules/verification/services/public-credential-service.test.ts`.
- Create `src/modules/verification/services/public-credential-json.ts`.
- Create `src/modules/verification/services/public-credential-json.test.ts`.
- Extract shared snapshot runtime schemas from `src/modules/issuance/services/issuance-query-service.ts` only if necessary; preserve existing protected behavior/tests.

## Required interfaces

- `PublicCredential`, `PublicCredentialStatus`, and exact runtime schemas.
- `getPublicCredential(publicId, now?): Promise<PublicCredential>`.
- `effectiveCredentialStatus(input): "ACTIVE" | "REVOKED" | "EXPIRED"`.
- `buildPublicCredentialJson(detail): PublicOpenBadgeCredential`.
- `serializePublicCredentialJson(detail): string`.

## Privacy and behavior

- Query only by strictly validated non-sequential `publicId`; malformed and missing identifiers raise the same safe `PublicCredentialNotFoundError`.
- Select only public ID, persisted status/dates/revocation fields, and immutable recipient/achievement/issuer/credential snapshot JSON.
- Runtime-validate all raw JSON before projection and fail closed on corruption.
- Recipient public name is first name plus last initial, e.g. `Maria S.`. Define deterministic safe handling for whitespace, single-token, non-Latin, and blank/invalid snapshot names.
- Public DTO and JSON must never include plain recipient email, full student number, student ID, class roster ID, internal issuance ID, issuer user ID/name, private file path, or raw database JSON.
- Effective status precedence: persisted `REVOKED`; otherwise `EXPIRED` when `expiresAt <= now`; otherwise `ACTIVE`. A persisted `EXPIRED` remains expired.
- Keep issuance-time issuer/achievement/credential content immutable. Merge Task 1 settings only for current support contact and `sharingEnabled`, not credential issuer identity.
- Public JSON/JSON-LD preserves the exact existing VC/OpenBadge context/type, issuer, achievement, and SHA-256 hashed email identity. Add deterministic current lifecycle metadata outside immutable assertion fields, including revoked/expired status and dates/reason where applicable. Do not add a fake `proof`; explicitly mark output unsigned and never certified.
- Credential JSON identifier must use the canonical existing `/credentials/{publicId}` URL and contain no internal IDs.
- Revocation reason is public but trimmed/bounded and must be projected from stored data without HTML interpretation.
- Use `import "server-only"`, explicit DTO construction, cloned arrays/objects, and no mutation of Prisma JSON/snapshot values.

## TDD and verification

Write named failing tests first and record RED evidence. Cover masking, every status boundary, ID validation, missing/corrupt snapshots, exact database select, Task 1 settings integration, recursive sentinel privacy checks, deterministic JSON serialization, preserved Open Badges fields, lifecycle metadata, unsigned/no-proof behavior, and immutability.

Run focused suites, issuance snapshot/query regressions, format, lint, typecheck, full tests, and configured production build. Do not claim success if any check fails.

Write the full report to `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-2-report.md` with RED/GREEN evidence, changed files, commands/counts, assumptions, and concerns. Return only status, one-line verification summary, and concerns.
