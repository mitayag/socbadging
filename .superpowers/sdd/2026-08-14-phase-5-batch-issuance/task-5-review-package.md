# Task 5 Independent Review Package

Review the Task 5 implementation against:

- `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/task-5-brief.md`
- `docs/superpowers/specs/2026-08-14-phase-5-batch-issuance-design.md`
- `AGENTS.md`

Exact implementation/review files:

- `src/app/api/classes/[classId]/issued/batch/inspect/route.ts`
- `src/app/api/classes/[classId]/issued/batch/preview/route.ts`
- `src/app/api/classes/[classId]/issued/batch/template.csv/route.ts`
- `src/app/api/classes/[classId]/issued/batch/template.xlsx/route.ts`
- `src/app/api/issuance-batches/[batchId]/report/route.ts`
- `src/app/api/issuance-batches/batch-routes.test.ts`
- `src/app/classes/[classId]/issued/batch-actions.ts`
- `src/app/classes/[classId]/issued/batch-actions.test.ts`
- `src/modules/issuance/services/batch-template.ts`
- `src/modules/issuance/services/batch-template.test.ts`
- `src/modules/issuance/services/batch-preview-service.ts` (`authorizeBatchSelection` only)
- `src/modules/issuance/services/batch-preview-service.test.ts` (`authorizeBatchSelection` tests only)
- `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/task-5-report.md`

Return separate verdicts for spec compliance and code quality. List Critical, Important, and Minor findings with file/line evidence. Confirm that Task 6 UI was not implemented.
