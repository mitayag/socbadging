# Phase 5 Batch Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Faculty-only CSV/XLSX batch badge issuance with mandatory stored validation preview, atomic commit, immutable credentials, audit records, reports, and responsive result UI.

**Architecture:** Extend the Phase 4 issuance domain with an expiring `IssuanceBatch` aggregate. Inspection parses an upload without persistence, preview performs set-based authoritative classification and stores the immutable reviewed rows, and commit revalidates the stored preview inside a MariaDB transaction before creating credentials and audit records. Thin Next.js Route Handlers and Server Actions call server-only services; a small client wizard manages only upload/mapping/presentation state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, MariaDB 11.8, Zod, Vitest/Testing Library, Docker Compose, existing CSV/XLSX parser and modern-light CSS tokens.

## Global Constraints

- Read `AGENTS.md`, `REQUIREMENTS.md`, and `docs/superpowers/specs/2026-08-14-phase-5-batch-issuance-design.md` before each task.
- Read relevant installed Next.js guides under `node_modules/next/dist/docs/` before changing routes, actions, pages, forms, or caching.
- Map work to FR-011, FR-012, FR-015, FR-020, FR-021, FR-022 and acceptance criteria 7, 8, 9, 15.
- Batch preview is mandatory; commit accepts only the persisted preview ID and never client-supplied rows/counts/dispositions.
- Only active Faculty may preview/commit, only for active owned classes and active owned badge templates.
- Every new issuance and batch commit must write audit records atomically.
- Issued credential snapshots remain historical and are never silently rewritten.
- Recipient email remains private and never appears in audit contexts or public credential output.
- Partial-valid commit is approved: commit all reviewed `READY` rows atomically; exclude invalid and already-issued rows.
- Do not add email notification, public verification, sharing, revocation, signing, source-file persistence, queues, or certification claims.
- Preserve modern-light tokens, title-case labels, accessibility, and responsive behavior.
- Every schema change requires a forward Prisma migration.
- Git commits/worktrees are unavailable because this workspace is not a Git repository; use direct file review packages and reports.
- Run formatting, lint, typecheck, tests, production build, MariaDB integration, Docker smoke, and Browser QA before completion.

---

### Task 1: Batch Schema, Migration, and Contracts

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260814_phase_5_batch_issuance/migration.sql`
- Create: `src/modules/issuance/batch-types.ts`
- Test: `src/modules/issuance/batch-types.test.ts`

**Interfaces:**

- Produces Prisma `IssuanceBatch`, `IssuanceBatchStatus`, relations, indexes, and restrictive foreign keys.
- Produces `BatchRowDisposition`, `BatchPreviewRow`, `BatchMapping`, `BatchPreviewSummary`, `BatchCommitSummary`, `BatchDetail`, and `BatchReportRow` explicit TypeScript contracts.
- Later tasks consume JSON-safe row/result shapes; no consumer receives raw `Prisma.JsonValue`.

- [ ] **Step 1: Write failing contract tests**

Test exhaustive allowed dispositions (`READY`, `ALREADY_ISSUED`, `DUPLICATE_IN_FILE`, `STUDENT_NOT_FOUND`, `NOT_ACTIVELY_ENROLLED`, `EMAIL_MISMATCH`, `INVALID`), required row fields, nullable issuance/public identifiers, and summary count invariants using runtime schemas exported with the contracts.

- [ ] **Step 2: Verify RED**

Run `npm test -- src/modules/issuance/batch-types.test.ts`. Expect module-not-found failure.

- [ ] **Step 3: Add Prisma schema and forward migration**

Add `IssuanceBatchStatus { READY COMMITTED EXPIRED }` and `IssuanceBatch` fields from the approved design: IDs/relations, source filename, mapping JSON, rows JSON, SHA-256 fingerprint, total/ready/already-issued/invalid/issued counts, status, expires/committed/created/updated timestamps. Use `onDelete: Restrict`, batch history indexes, and adequate varchar lengths for indexed identifiers/digest.

- [ ] **Step 4: Add narrow contracts and runtime schemas**

Define exact serializable contracts and Zod schemas. Enforce positive source row numbers, normalized bounded identifiers, disposition-specific optional result identifiers, and non-negative count totals. Provide one parsing function that raises a safe `Invalid batch snapshot` error.

- [ ] **Step 5: Verify schema and tests**

Run Prisma format/generate, deploy migration to disposable MariaDB, focused tests, `npm run typecheck`, and `npm run lint`.

---

### Task 2: File Inspection, Mapping, Classification, Fingerprint, and CSV

**Files:**

- Create: `src/modules/issuance/services/batch-validation.ts`
- Create: `src/modules/issuance/services/batch-validation.test.ts`
- Create: `src/modules/issuance/services/batch-report.ts`
- Create: `src/modules/issuance/services/batch-report.test.ts`
- Modify: `src/modules/rosters/services/import-parser.ts` only if a generic bounded parser extraction is required

**Interfaces:**

- Produces `inspectBatchFile(file): Promise<{ headers: string[]; rows: string[][] }>` with existing size/type/row limits.
- Produces `normalizeBatchMapping`, `mapBatchRows`, `classifyBatchRows(input)`, `fingerprintBatchPreview(input): string`, and `buildBatchReportCsv(rows): Uint8Array`.
- Classification consumes set-based maps/sets supplied by the caller; it performs no database access.

- [ ] **Step 1: Write parser and mapping tests**

Cover CSV/XLSX, unsupported extension, oversized/empty/no-header input, required Student Number mapping, optional `Do Not Map` email, out-of-range/tampered column indexes, whitespace/case normalization, maximum row count, and preservation of one-based source row numbers.

- [ ] **Step 2: Write classification tests**

Cover every disposition and precedence: malformed/empty number, first-row-wins duplicate, unknown student, inactive/missing enrollment, optional normalized email mismatch, existing tuple, and ready row. Assert exact counts and safe human-readable messages.

- [ ] **Step 3: Write fingerprint and CSV tests**

Assert canonical fingerprint stability, changes for badge/class/mapping/source/row changes, literal SHA-256 hex shape, exact report headers/order, BOM, CRLF, Unicode, quotes/commas, formula protection including leading whitespace, and parser round-trip.

- [ ] **Step 4: Verify RED**

Run both focused test files and confirm missing-module failures.

- [ ] **Step 5: Implement pure bounded services**

Reuse the existing hardened parser where possible. Keep database authorization out of these modules. Canonicalize fingerprint input with explicit stable key/row ordering; do not hash `JSON.stringify` of uncontrolled object key order.

- [ ] **Step 6: Verify GREEN**

Run focused tests, roster parser/validation regression tests, format, lint, and typecheck.

---

### Task 3: Authorized Preview Creation and Retrieval

**Files:**

- Create: `src/modules/issuance/services/batch-preview-service.ts`
- Create: `src/modules/issuance/services/batch-preview-service.test.ts`

**Interfaces:**

- Produces `createBatchPreview(actor, { classId, badgeTemplateId, sourceFilename, mapping, rows }): Promise<BatchPreviewSummary>`.
- Produces `getBatchDetail(actor, batchId): Promise<BatchDetail>` and `listClassBatches(actor, classId)` for Faculty-owned or Administrator read-only history.
- Consumes Task 2 pure mapping/classification/fingerprint functions.

- [ ] **Step 1: Write authorization and set-based query tests**

Assert Administrator/unauthenticated/suspended/role-changed/non-owner denial before preview creation; active owned class and badge validation; cross-class/archived badge rejection; and one set-based query each for students, active enrollments, and existing issuances rather than per-row reads.

- [ ] **Step 2: Write preview persistence/audit tests**

Assert 30-minute expiry, stored normalized mapping/rows/fingerprint/counts, `READY` status, and one `badge.batch_previewed` audit entry in the same transaction. Audit context must contain only batch/class/badge IDs and counts, never filename row payload or email.

- [ ] **Step 3: Write retrieval-scope tests**

Assert Faculty queries include class owner scope, Administrator reads have no owner filter, inaccessible Faculty gets the same safe not-found result as a missing batch, and all JSON is runtime parsed before return.

- [ ] **Step 4: Verify RED**

Run the focused test and confirm the service is missing.

- [ ] **Step 5: Implement preview service**

Require `FACULTY` before preview database work, load active DB actor/class/badge, perform set-based reads, classify rows, and create batch plus audit transactionally. Add safe `BatchNotFoundError` and `BatchUnavailableError` domain errors.

- [ ] **Step 6: Verify GREEN**

Run focused tests, lint, typecheck, and full tests.

---

### Task 4: Atomic Batch Commit and MariaDB Concurrency

**Files:**

- Create: `src/modules/issuance/services/batch-commit-service.ts`
- Create: `src/modules/issuance/services/batch-commit-service.test.ts`
- Create: `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- Modify: `src/modules/issuance/services/issuance-service.ts` only to extract/reuse a transaction-client issuance primitive without weakening individual issuance
- Modify: `src/modules/issuance/services/issuance-service.test.ts` for extraction regressions

**Interfaces:**

- Produces `commitBatchPreview(actor, batchId): Promise<BatchCommitSummary>`.
- Consumes a reusable `issueBadgeInTransaction(tx, validatedContext)` primitive that always creates immutable snapshots and an individual `badge.issued` audit entry.
- Repeat commit returns the persisted summary with `alreadyCommitted: true`.

- [ ] **Step 1: Write mandatory-preview and state tests**

Cover missing/inaccessible batch, expired preview, committed repeat, fingerprint mismatch, zero-ready preview, Administrator/unauthenticated denial, and transaction-loaded Faculty/class/badge revalidation before recipient reads/writes.

- [ ] **Step 2: Write partial-valid and idempotency tests**

Use a mixed stored preview. Assert only `READY` rows are considered, invalid rows remain unchanged, preview-time `ALREADY_ISSUED` rows are returned, newly existing tuples become already-issued, and all-ready rows produce one credential plus one `badge.issued` audit each.

- [ ] **Step 3: Write batch finalization tests**

Assert batch rows receive issuance/public IDs, counts update exactly, status becomes `COMMITTED`, committed time is set, and one identifier/count-only `badge.batch_committed` audit record is written.

- [ ] **Step 4: Write rollback and collision tests**

Assert any snapshot, issuance, individual audit, batch update, or batch audit failure rolls back the whole transaction; narrowly retry public-ID conflicts; propagate unrelated constraints; and handle tuple conflicts only through a fresh visibility boundary compatible with MariaDB repeatable-read.

- [ ] **Step 5: Verify RED**

Run focused commit tests and confirm failure before implementation.

- [ ] **Step 6: Implement transactional primitive and batch commit**

Keep a single authoritative transaction for the valid set. If a concurrency retry requires leaving a failed transaction, retry the complete bounded batch from a fresh transaction using stored preview idempotency; never partially commit the set.

- [ ] **Step 7: Add MariaDB integration tests**

Through the existing Compose integration profile, prove multi-row rollback on forced audit failure, successful batch state/audit counts, repeat commit idempotency, and deterministic concurrent tuple recovery. Use bounded synchronization hooks active only under `NODE_ENV=test`.

- [ ] **Step 8: Verify GREEN**

Run focused unit tests, individual issuance regressions, Docker MariaDB integration, lint, typecheck, and full tests.

---

### Task 5: Protected Inspection, Preview, Report, Templates, and Commit Boundaries

**Files:**

- Create: `src/app/api/classes/[classId]/issued/batch/inspect/route.ts`
- Create: `src/app/api/classes/[classId]/issued/batch/preview/route.ts`
- Create: `src/app/api/classes/[classId]/issued/batch/template.csv/route.ts`
- Create: `src/app/api/classes/[classId]/issued/batch/template.xlsx/route.ts`
- Create: `src/app/api/issuance-batches/[batchId]/report/route.ts`
- Create: `src/app/api/issuance-batches/batch-routes.test.ts`
- Create: `src/app/classes/[classId]/issued/batch-actions.ts`
- Create: `src/app/classes/[classId]/issued/batch-actions.test.ts`
- Create: `src/modules/issuance/services/batch-template.ts`
- Create: `src/modules/issuance/services/batch-template.test.ts`

**Interfaces:**

- Inspection route accepts bounded multipart `file` plus validated path class ID and form badge ID.
- Preview route accepts JSON source filename, badge ID, mapping, and parsed rows, then returns only the authorized `BatchPreviewSummary`.
- Report route returns authorized BOM CSV with `text/csv; charset=utf-8`, `private, no-store`, and a filename derived from validated/stored safe identifiers.
- Commit action calls only `commitBatchPreview`, revalidates class/global/batch/issued paths, and redirects to `/issuance-batches/{batchId}?notice=committed|existing`.

- [ ] **Step 1: Write template artifact tests**

Assert CSV/XLSX headers `Student Number`, `Email`; example rows are obviously fictitious; formulas are safe; filenames/MIME/disposition/no-store headers are exact; and downloads do not mutate preview state.

- [ ] **Step 2: Write protected route tests**

For inspect, preview, report, and templates, cover owner Faculty success plus unauthenticated, Administrator mutation denial, non-owner Faculty safe denial, malformed IDs/payloads/files, and error translation without protected body or attachment headers.

- [ ] **Step 3: Write action tests**

Cover unauthenticated/Administrator denial before service call, strict batch-ID validation, exact service delegation, revalidation, and safe redirect for committed/repeated results.

- [ ] **Step 4: Verify RED**

Run focused route/action/template tests and confirm missing modules/routes.

- [ ] **Step 5: Implement thin Next.js boundaries**

Follow installed Next.js 16 route/action documentation. Authenticate each entry point independently, validate all client input, and delegate authorization/business logic to server-only domain services.

- [ ] **Step 6: Verify GREEN**

Run focused tests, lint, typecheck, full tests, and production build.

---

### Task 6: Batch Wizard, History, and Result UI

**Files:**

- Create: `src/components/issuance/batch-issuance-wizard.tsx`
- Create: `src/components/issuance/batch-issuance-wizard.test.tsx`
- Create: `src/components/issuance/batch-history.tsx`
- Create: `src/components/issuance/batch-history.test.tsx`
- Create: `src/components/issuance/batch-result.tsx`
- Create: `src/components/issuance/batch-result.test.tsx`
- Create: `src/app/issuance-batches/[batchId]/page.tsx`
- Modify: `src/app/classes/[classId]/issued/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Wizard consumes `classId`, active `badgeOptions`, protected endpoint/template URLs, and commit action; it never receives private server records beyond preview rows returned by the route.
- History consumes authorized batch summaries and links to results/reports.
- Result consumes only runtime-validated `BatchDetail` historical data.

- [ ] **Step 1: Write wizard-state tests**

Cover choose/upload, disabled initial actions, badge/file selection, inspection pending/error, required Student Number mapping, optional Email/Do Not Map, preview request, mixed dispositions/counts, report link, zero-ready disabled commit, partial-valid confirmation, exact commit count, and reset-on-file/badge change.

- [ ] **Step 2: Write role/history/result tests**

Assert Faculty sees wizard, Administrator never sees mutation controls, history/result remains role-scoped, result renders counts/dispositions/credential links/report, and repeated-commit notice is clear.

- [ ] **Step 3: Verify RED**

Run focused component tests and confirm missing UI.

- [ ] **Step 4: Implement server/client boundaries**

Keep pages as Server Components. Start independent workspace/options/list/history reads together after actor resolution. Limit the Client Component to file, mapping, preview, and pending UI state; pass minimal serialized props.

- [ ] **Step 5: Implement modern-light responsive styling**

Use existing panels, form fields, status colors, focus tokens, and no nested dashboard cards. Desktop preview uses aligned columns; under the existing mobile breakpoint each row stacks with visible field labels and no viewport overflow. Add reduced-motion-safe pending feedback.

- [ ] **Step 6: Verify GREEN**

Run focused UI tests, navigation/page regressions, format, lint, typecheck, full tests, and production build.

---

### Task 7: Full Verification, Docker, Browser Acceptance, and Traceability

**Files:**

- Modify: `README.md` for batch templates/workflow/limits/Compose tests only as required
- Modify: `.env.example` or `compose.yaml` only if a new non-secret batch limit/test setting is introduced
- Create: `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/` task evidence during execution

**Interfaces:**

- Validates the complete Phase 5 system without adding new features.

- [ ] **Step 1: Run fresh complete quality gate**

Run sequentially: repository formatting, lint, typecheck, all tests, `npm audit`, and configured production build. Record exact counts and exit codes; fix and rerun every failure.

- [ ] **Step 2: Run MariaDB and Docker acceptance**

Run the Compose integration suite, rebuild the application image, apply all migrations, verify migrate success, healthy DB/web, HTTP 200 health endpoint, persistent storage, and clean migration/web logs.

- [ ] **Step 3: Perform Faculty Browser acceptance**

Using disposable local data, upload a mixed CSV/XLSX containing ready, already-issued, duplicate-in-file, unknown/not-enrolled, and email-mismatch rows. Verify mapping, mandatory preview, exact classifications/counts, report download, explicit partial-valid confirmation, atomic commit result, credential links, and repeat-commit idempotency. Confirm no framework overlay or console errors.

- [ ] **Step 4: Perform Administrator and negative acceptance**

Verify Administrator can inspect history/result/report but sees no preview/commit controls. Verify non-owner Faculty denial with live account if available and automated evidence otherwise. Confirm denial responses contain no row payload or attachment header.

- [ ] **Step 5: Verify responsive/accessibility behavior**

At desktop and 390×844 (when the browser surface supports resizing), verify labels, keyboard focus, pending state, stacked preview rows, readable messages, touch targets, and no horizontal overflow. Record any browser-tool limitation explicitly rather than substituting an unapproved surface.

- [ ] **Step 6: Final independent review and requirements audit**

Review exact Phase 5 files against the approved spec. Map evidence to FR-011, FR-012, FR-015, FR-020, FR-021, FR-022 and acceptance criteria 7, 8, 9, 15. List Phase 6 verification/sharing/revocation and P1 notification as remaining. Do not call the product certified.

## Plan Self-Review

- Every approved design section maps to Tasks 1–7.
- Schema and every protected boundary have migrations/authorization tests.
- Preview creation and batch commit each have explicit audit and privacy tests.
- Atomic multi-row rollback and MariaDB concurrency receive real integration coverage.
- Type names and service signatures are consistent across task boundaries.
- No task adds Phase 6/P1 features or accepts client rows during commit.
- No placeholders or deferred implementation instructions remain.
