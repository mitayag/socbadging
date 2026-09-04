# Task 4 Brief: Transactional Revocation, Authorization, and MariaDB Concurrency

Implement Task 4 from `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` using strict TDD. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 6 design/plan, installed Next.js 16 Server Actions/Data Security documentation, and established Phase 4/5 locking/audit patterns before editing.

## Exact files

- Create `src/modules/issuance/services/revocation-service.ts`.
- Create `src/modules/issuance/services/revocation-service.test.ts`.
- Create `src/modules/issuance/services/revocation-service.integration.test.ts`.
- Create `src/app/issued/[issuanceId]/revocation-actions.ts`.
- Create `src/app/issued/[issuanceId]/revocation-actions.test.ts`.
- Do not implement Phase 6 UI, SMTP, student portal, signing, evidence, wallet, or certification work.

## Required service/action behavior

- Implement `revokeCredential(actor, { issuanceId, reason }): Promise<{ issuanceId; publicId; alreadyRevoked }>`.
- Strictly validate bounded IDs and a required trimmed revocation reason; reject blank, overlong, and control-character input before writes.
- Reauthorize inside the transaction using authoritative locked rows. Administrator may revoke any issuance. Faculty may revoke only an issuance belonging to a class they currently own. Suspended, deleted, missing, or role-changed actors fail closed.
- Use the established MariaDB authoritative locking reads, consume the locked current values, and fail closed on exact snapshot-conflict errors. Cover transaction-time races.
- Update only lifecycle fields: status `REVOKED`, revocationReason, revokedAt. Never rewrite immutable recipient/achievement/issuer/credential snapshot JSON.
- The first successful revocation creates exactly one `badge.revoked` audit in the same transaction. Audit context must contain only safe issuance/public/class identifiers plus reason length/category, not recipient data or the reason text.
- Repeated revocation is idempotent: no second update/audit and returns `alreadyRevoked: true` without changing the original reason/time.
- Active, persisted-expired, and effectively expired credentials remain revocable.
- The Server Action must accept only `FormData`, independently authenticate, validate only ID/reason, delegate, revalidate authenticated/public/relevant class paths, then redirect with `notice=revoked|existing`.
- Unauthenticated and unauthorized callers receive safe behavior without existence disclosure.

## Required tests/evidence

- Write named failing validation/authorization, transactional, idempotency, action, audit rollback, and concurrency tests first; record RED evidence.
- Unit coverage: every denial has no update/audit; locked actor/issuance/class ownership reads; exact update/audit payloads; immutable snapshots; already-revoked no-op; expired revocation; action authentication, validation, delegation, revalidation, redirect, and safe error behavior.
- Real MariaDB coverage: successful atomic update+audit, audit-trigger rollback, concurrent/repeated revocation serializes to one audit, actor suspension/role/ownership races fail closed, and snapshot-conflict handling.
- Run focused suites, Phase 4/5 issuance regressions, Docker MariaDB integration, format, lint, typecheck, full tests, audit, and configured production build.
- Write `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-4-report.md` with requirement mapping, changed files, RED/GREEN evidence, exact checks/counts, assumptions, and concerns.
- Return only status, one-line verification summary, and concerns.
