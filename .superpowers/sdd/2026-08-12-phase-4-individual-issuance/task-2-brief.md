# Task 2 Brief — Credential Snapshot Builder

## Context

Build the deterministic snapshot/Open Badges-aligned serialization boundary for Phase 4. Read `AGENTS.md`, `REQUIREMENTS.md`, `docs/superpowers/specs/2026-08-12-phase-4-individual-issuance-design.md`, and `src/modules/issuance/types.ts`. Do not implement database issuance services, routes, or UI.

## Files

- Create: `src/modules/issuance/services/credential-snapshot.ts`
- Create: `src/modules/issuance/services/credential-snapshot.test.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `compose.yaml`

## Required Interfaces

- `generatePublicId(): string` — 24 cryptographically random bytes, base64url, exactly 32 URL-safe characters.
- `hashRecipientEmail(email: string): string` — SHA-256 lowercase hex of `trim().toLowerCase()`.
- `calculateExpiresAt(issuedAt: Date, expiresAfterDays: number | null): Date | null` — exact UTC millisecond addition without mutating input.
- `buildCredentialSnapshots(input): { recipient; achievement; issuer; credential }` using explicit types from `src/modules/issuance/types.ts`.

## Configuration

Add validated non-secret server defaults:

- `ISSUER_NAME=Holy Angel University — School of Computing`
- `ISSUER_URL` optional URL, defaults to `APP_URL`
- `ISSUER_LOGO_PATH=/images/hausoclogo.png`, must be a safe root-relative path

Propagate them through `.env.example` and Compose without committing secrets. Resolve issuer logo, badge media, achievement, and credential identifiers against canonical URLs.

## Credential Requirements

- Context tuple exactly:
  - `https://www.w3.org/ns/credentials/v2`
  - `https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json`
- Type tuple exactly `VerifiableCredential`, `OpenBadgeCredential`.
- Issuer name/URL/logo match configuration.
- Credential ID is `${APP_URL}/credentials/{publicId}`.
- Achievement ID is stable and based on badge template identity.
- Badge image URL uses the stable application media route.
- Private recipient snapshot contains email; credential subject contains only normalized SHA-256 identity hash, never raw email.
- Include criteria, skills/tags, optional alignment, class identity, template timestamp, and optional `validUntil` derived once from issued/expires timestamps.
- Omit absent optional JSON properties rather than serializing `undefined`.
- Build fresh objects so later source mutation cannot change returned snapshots.
- No proof/signature and no certification claim.

## TDD Tests

Write tests first and prove RED. Cover:

- public ID regex `^[A-Za-z0-9_-]{32}$` and two calls differ;
- normalized email hash equality and literal known SHA-256 value;
- exact UTC expiration and no-expiration case;
- exact issuer defaults and resolved URLs;
- private email present only in recipient snapshot;
- exact context/type literals;
- exact criteria/image/tag/alignment output with omission when absent;
- source mutation after building does not mutate snapshots.

## Verification

- Focused test RED then GREEN
- `npm run format`
- `npm run lint`
- `npm run typecheck`
- full `npm test`

## Report

Write `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-2-report.md` with status, exact files, RED/GREEN evidence, serializer/config decisions, commands/results, and concerns. Return only status, one-line verification summary, and concerns. Git commits are unavailable.
