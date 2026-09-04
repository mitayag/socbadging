# Task 2 Report — Credential Snapshot Builder

## Status

Complete for the Task 2 serializer/configuration scope. No database issuance service, route, UI, schema, or migration was added.

## Requirement Mapping

- FR-012: cryptographically random, non-sequential 32-character public identifiers and immutable issuance snapshot data.
- FR-015: unsigned Open Badges 3.0-aligned credential serialization with required context/type literals.
- Requirement 10 privacy: recipient email remains only in the private recipient snapshot; the credential subject contains the normalized SHA-256 email hash.

## Files

- Created `src/modules/issuance/services/credential-snapshot.ts`
- Created `src/modules/issuance/services/credential-snapshot.test.ts`
- Modified `src/config/env.ts`
- Modified `.env.example`
- Modified `compose.yaml`
- Created `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-2-report.md`

## Serializer and Configuration Decisions

- `generatePublicId` uses Node `randomBytes(24)` with base64url encoding, producing exactly 32 URL-safe characters.
- Email hashing trims and lowercases before SHA-256 lowercase-hex digesting.
- Expiration is calculated as a UTC millisecond offset from the supplied issuance timestamp without changing its input.
- Snapshot objects are independently allocated, including nested tags, alignments, class data, credential fields, and recipient data.
- Credentials use the required W3C/1EdTech context tuple and `VerifiableCredential`/`OpenBadgeCredential` type tuple. They intentionally include no proof, signature, or certification assertion.
- Canonical application URLs are used for credential identifiers, template-based achievement identifiers, the media API route, and the issuer logo.
- `ISSUER_NAME`, optional `ISSUER_URL` (defaulting to `APP_URL`), and validated safe root-relative `ISSUER_LOGO_PATH` are server-only configuration values and are propagated through Compose and the environment template.
- Issuer logo paths reject query/fragment characters, backslashes, encoded values (including encoded traversal/separators), control characters, empty segments, and dot segments before URL resolution.
- Badge media URLs require a segmented `badges/...` storage key and reject traversal, encoded separators, empty segments, URL delimiters, backslashes, and control characters before resolving the stable `/api/media/` route.

## RED/GREEN Evidence

- RED: `npm test -- src/modules/issuance/services/credential-snapshot.test.ts` failed before implementation because `./credential-snapshot` did not exist.
- RED: after adding the Compose-compatible empty `ISSUER_URL` case, the focused suite failed with the expected Zod URL validation error.
- GREEN: the focused command passed with 9 tests after implementation and after the empty optional URL normalization.
- RED: after review, the new focused URL-boundary tests failed for five unsafe issuer-logo paths and three crafted badge-media keys because the prior serializer accepted them.
- GREEN: `npm test -- src/modules/issuance/services/credential-snapshot.test.ts` passed with 18 tests after adding root-path and media-key validation.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 22 files, 71 tests.
- `DATABASE_URL=mysql://test:test@127.0.0.1:3306/test npm run build` — passed.
- `npm run format` — blocked by two pre-existing unformatted planning documents: `task-1-review-package.md` and `task-2-brief.md`. The Task 2 TypeScript/YAML files were individually formatted; Prettier does not infer a parser for `.env.example`.

## Concerns

- Repository-wide formatting remains non-green solely because of the two pre-existing planning documents noted above; they were left unchanged to avoid unrelated shared-workspace edits.
- Issuance transaction persistence, authorization, audit records, routes, and UI are intentionally deferred to their assigned tasks.
