# Task 3 Brief — Transactional Issuance Service and Authorization

## Context

Implement only the Phase 4 domain service for one-student issuance. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 4 design, the full implementation plan, existing class/badge/student authorization services, the Prisma schema, and Task 2 snapshot builder/types before editing. Do not add routes, actions, queries, exports, or UI.

## Files

- Create `src/modules/issuance/services/issuance-service.ts`
- Create `src/modules/issuance/services/issuance-service.test.ts`
- Modify another small reusable module only if essential; document why.

## Required Interface

`issueBadge(actor: Actor, input: { classId: string; badgeTemplateId: string; studentId: string }): Promise<IssuanceResult>`

Return only `{ issuanceId, publicId, alreadyIssued }`.

## Authorization and Validation

- Require Faculty before database reads; Administrators cannot issue.
- All authoritative validation and writes occur inside one Prisma transaction.
- Faculty must own the active class.
- Badge template must be active, owned by the Faculty, and associated with the selected class according to the current schema/design.
- Student must have an active enrollment in that class.
- Reject inactive class, archived badge, removed enrollment, cross-class badge/student, and non-owner Faculty without writes.
- Use the Task 2 snapshot builder only from records loaded transactionally.

## Atomic Writes and Audit

- Insert exactly one `BadgeIssuance` and one `badge.issued` audit entry in the same transaction.
- Audit context contains only class, badge, student, issuance/public identifiers; never snapshot JSON or private recipient email.
- Snapshot-builder or audit failure must roll back issuance.
- Preserve issued historical snapshots; do not mutate template/source records.

## Idempotency and Concurrency

- Pre-existing tuple `(classId, badgeTemplateId, studentId)` returns the existing record with `alreadyIssued: true` and creates no audit event.
- Narrowly recognize Prisma `P2002` targets.
- Tuple-unique race must fetch and return the existing issuance.
- Public-ID collision retries generation with a small fixed maximum.
- Do not swallow or translate unrelated database errors.

## TDD Tests

Prove RED before implementation and cover:

- owner Faculty success: one issuance plus one audit;
- minimal non-sensitive audit context;
- Administrator denied before DB reads;
- non-owner denied before issuance creation;
- each inactive/archived/removed/cross-boundary case rejected without writes;
- duplicate pre-check idempotency;
- tuple race recovery;
- public-ID-only collision retry;
- snapshot failure and audit failure rollback behavior.

Use complete Prisma transaction fixtures and assertions strong enough to catch missing authorization/status predicates.

## Verification

- Focused RED then GREEN
- Scoped formatting
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Production build

## Report

Write `task-3-report.md` in this SDD directory with exact files, RED/GREEN evidence, authorization/transaction/concurrency decisions, commands/results, and concerns. Git commits are unavailable. Return only status, one-line verification summary, and concerns.
