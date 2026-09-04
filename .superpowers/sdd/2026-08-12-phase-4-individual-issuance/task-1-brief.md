# Task 1 Brief — Issuance Schema and MariaDB Migration

## Context

This is the foundation for Phase 4 individual issuance. Read `AGENTS.md`, `REQUIREMENTS.md`, and `docs/superpowers/specs/2026-08-12-phase-4-individual-issuance-design.md` before editing. Do not implement issuance services, routes, or UI.

## Files

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql`
- Create: `src/modules/issuance/types.ts`

## Required Interfaces

- Produce Prisma `BadgeIssuance`, `BadgeIssuanceStatus`, and relations used by later tasks.
- Produce explicit `RecipientSnapshot`, `AchievementSnapshot`, `IssuerSnapshot`, `OpenBadgeCredentialSnapshot`, `IssuanceListItem`, and `IssuanceResult` TypeScript types independent of Prisma JSON types.
- Do not use `Record<string, unknown>` for snapshot domain shapes.

## Schema

Add enum statuses `ACTIVE`, `REVOKED`, `EXPIRED`.

`BadgeIssuance` fields:

- `id` cuid primary key
- `publicId` unique varchar(191)
- `classId`, `badgeTemplateId`, `studentId`, `issuerUserId`
- `status` default ACTIVE
- `issuedAt`, optional `expiresAt`
- JSON `recipientSnapshotJson`, `achievementSnapshotJson`, `issuerSnapshotJson`, `credentialJson`
- `snapshotVersion` default 1
- optional `revocationReason` text and `revokedAt`
- `createdAt`, `updatedAt`

Relations use `onDelete: Restrict` to Class, BadgeTemplate, Student, and issuer User. Add reverse relations.

Constraints/indexes:

- unique `publicId`
- unique `(classId, badgeTemplateId, studentId)`
- `(classId, issuedAt)`, `(issuerUserId, issuedAt)`, `(status, issuedAt)`
- indexes on `badgeTemplateId` and `studentId`

Migration must be checked in, MariaDB-compatible, and must not modify earlier migrations.

## Type Shapes

Follow the approved spec exactly. Include optional alignment, skills/tags, expiration, and credential context/type/issuer/subject/achievement shapes. `IssuanceResult` is `{ issuanceId: string; publicId: string; alreadyIssued: boolean }`. `IssuanceListItem` contains the role-authorized list view fields required by the spec without using live mutable credential-critical data.

## Verification

- `npm run db:generate`
- `npm run format`
- `npm run typecheck`
- If safe with the running local Docker MariaDB, apply the migration and report evidence. Do not destroy or reset data.

## Report

Write `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-1-report.md` with status, exact files, design decisions, migration/generation results, commands/output summary, and concerns. Return only status, one-line verification summary, and concerns. Git commits are unavailable.
