# Task 5 Review Package

Review Task 5 against `task-5-brief.md`, `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 4 design/plan, auth/session conventions, Task 3/4 service contracts, and current route/action conventions.

## Implementation files

- `src/app/classes/[classId]/issued/actions.ts`
- `src/app/classes/[classId]/issued/actions.test.ts`
- `src/app/api/classes/[classId]/issued/export/route.ts`
- `src/app/api/issued/export/route.ts`
- `src/app/api/issued/[issuanceId]/credential/route.ts`
- `src/app/api/issued/issuance-routes.test.ts`
- `src/modules/issuance/services/issuance-query-service.ts`

## Evidence

- `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-5-report.md`

Inspect server-side role/ownership enforcement, class-filter non-broadening, response status translation, malformed-input behavior, private email/credential privacy, filename safety, exact cache/MIME/disposition headers, redirect/revalidation safety, and whether tests cover each role/denial boundary without overmocking authorization. Report separate spec and quality verdicts with Critical/Important/Minor findings and exact file/line refs. Write `task-5-review.md`.
