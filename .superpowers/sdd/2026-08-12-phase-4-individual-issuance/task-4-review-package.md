# Task 4 Review Package

Review Task 4 against `task-4-brief.md`, `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 4 design/plan, Prisma schema, issuance snapshot types, and existing CSV utilities.

## Implementation files

- `src/modules/issuance/services/issuance-query-service.ts`
- `src/modules/issuance/services/issuance-query-service.test.ts`
- `src/modules/issuance/services/issuance-csv.ts`
- `src/modules/issuance/services/issuance-csv.test.ts`
- `src/modules/rosters/services/roster-validation.ts`

## Evidence

- `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-4-report.md`

Inspect actual Prisma/MariaDB JSON filter validity, owner scopes, safe not-found behavior, snapshot schema compatibility, pagination correctness, list privacy, export authorization assumptions, CSV exactness/formula hardening, and regressions to roster CSV behavior. Report separate spec and quality verdicts with Critical/Important/Minor findings and exact file/line refs. Write `task-4-review.md`.
