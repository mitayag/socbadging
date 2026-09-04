# Task 4 Independent Review Package

Review Task 4 only against `task-4-brief.md`, the approved Phase 6 design/plan, `AGENTS.md`, `REQUIREMENTS.md`, installed Next.js 16 Server Actions/Data Security documentation, and existing Phase 4/5 locking patterns.

## Exact scope

- `src/modules/issuance/services/revocation-service.ts`
- `src/modules/issuance/services/revocation-service.test.ts`
- `src/modules/issuance/services/revocation-service.integration.test.ts`
- `src/app/issued/[issuanceId]/revocation-actions.ts`
- `src/app/issued/[issuanceId]/revocation-actions.test.ts`
- `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-4-report.md`

## Required independent checks

1. Review specification compliance and code quality separately.
2. Verify all input validation and that every denial causes no update/audit or existence disclosure.
3. Verify transaction-time authoritative actor, issuance, and class ownership locking; Admin-any and current Faculty-owner-only policy; suspended/deleted/role/ownership races fail closed.
4. Verify exact MariaDB snapshot-conflict handling and no overbroad error swallowing.
5. Verify only lifecycle fields mutate, immutable snapshots remain untouched, and first success writes exactly one atomic safe audit.
6. Verify repeated revocation is idempotent and preserves original reason/time/audit; expired credentials remain revocable.
7. Verify the action reauthenticates, accepts only FormData data, safely delegates/revalidates/redirects, and cannot rely on UI authorization.
8. Verify integration tests genuinely exercise rollback, concurrency, race authorization, public projection, and fresh migrations rather than mocks.
9. Run focused tests/typecheck and any independent MariaDB probes needed. Report Critical/Important/Minor findings with exact file/line evidence.

Return separate `SPEC COMPLIANCE` and `CODE QUALITY` verdicts. Do not edit files.
