# Task 3 Brief — Authorized Preview Creation and Retrieval

## Required Reading

Read `AGENTS.md`, `REQUIREMENTS.md`, approved Phase 5 design, Task 1 contracts, Task 2 validation interfaces, Prisma schema, existing authorization policies and class/badge/issuance query services, and this brief completely. Strict TDD. Do not implement batch commit, routes/actions, templates/reports, or UI.

## Files

- Create `src/modules/issuance/services/batch-preview-service.ts`
- Create `src/modules/issuance/services/batch-preview-service.test.ts`

## Required Interfaces

- `createBatchPreview(actor, { classId, badgeTemplateId, sourceFilename, mapping, rows }): Promise<BatchPreviewSummary>`
- `getBatchDetail(actor, batchId): Promise<BatchDetail>`
- `listClassBatches(actor, classId): Promise<BatchHistoryItem[]>`
- Export safe domain errors `BatchNotFoundError` and `BatchUnavailableError` as needed for later route translation.

Define an explicit `BatchHistoryItem` type/schema if Task 1 does not already provide it. Ordinary history must not contain row JSON or supplied email.

## Preview Authorization

- Require an actor and exact `FACULTY` role before preview database reads.
- Inside the preview transaction, load the database User by actor ID with `role=FACULTY`, `status=ACTIVE`; reject stale suspended/changed sessions before class/badge/student reads.
- Load an active class owned by that Faculty.
- Load an active badge owned by that Faculty and associated with the exact class.
- Treat missing/inaccessible/cross-class records with safe authorization/not-found behavior consistent with existing services.
- Validate the source filename, mapping, row array, row count, and mapped content again server-side using Task 2 functions. Never trust client counts/dispositions/student IDs.

## Set-Based Classification

Perform no per-row database reads. From the unique normalized student-number keys, issue bounded set-based queries for:

1. known Students with ID/student number/email;
2. active class enrollments for the selected class;
3. existing class/badge issuances for the matched student IDs.

Build canonical lookup maps/sets matching Task 2’s case-insensitive student-number semantics. Then call Task 2 classification and fingerprint functions. Tests must assert a single call for each set-based read and no query waterfall.

## Persistence and Audit

Create the `IssuanceBatch` and one `badge.batch_previewed` audit entry inside the same Prisma transaction:

- status `READY`
- 30-minute expiry calculated once from a single `createdAt/now` reference
- normalized mapping, validated classified rows, fingerprint, exact counts, issuedCount zero
- safe bounded original source filename

Audit context contains exactly `classId`, `badgeTemplateId`, `batchId`, `totalRows`, `readyCount`, `alreadyIssuedCount`, `invalidCount`. It must not contain source filename, email, mapping, rows, or snapshot JSON. Audit failure rolls back preview creation.

## Authorized Retrieval

- `getBatchDetail`: authenticated Administrator can read any batch; Faculty database query must include `class.ownerUserId = actor.id`. Missing and inaccessible Faculty results throw identical `BatchNotFoundError` without a preliminary unrestricted existence read.
- `listClassBatches`: authenticate both roles. Faculty query includes owner scope; Administrator has read-only global access scoped to the requested class. Use deterministic `createdAt DESC, id DESC` order and a bounded list (use the established 20-row page or an explicit maximum).
- Parse mapping/rows JSON with Task 1 runtime schemas before returning. Convert Date fields to ISO strings. Reconcile counts through `batchDetailSchema`.
- History projection excludes `rowsJson`, `mappingJson`, emails, and other private row data.
- Invalid stored snapshots fail safely rather than reaching UI.

## TDD Coverage

Write tests before service. Cover:

- Administrator, unauthenticated/null, non-owner, suspended, role-changed, inactive class, archived/cross-class/cross-owner badge denial with no preview/audit write;
- validation of filename/mapping/rows and canonical Task 2 calls;
- exactly one student/enrollment/existing-issuance set query each;
- every classification count persisted;
- exact 30-minute expiry and fingerprint;
- exact private-free audit context and transaction rollback on audit failure;
- Faculty versus Administrator detail/list database scopes;
- safe not-found equivalence;
- deterministic history order/limit and privacy projection;
- malformed stored mapping/rows/counts rejected safely.

## Verification

Run focused RED/GREEN, format, lint, typecheck, full tests, and production build.

## Report

Write `task-3-report.md` in this SDD workspace with exact files, RED/GREEN, authorization/set-query/transaction/retrieval decisions, commands/results, concerns. Return only status, one-line verification summary, concerns. Git commits unavailable.
