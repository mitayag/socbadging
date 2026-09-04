# Task 4 Brief — Authorized Issuance Queries, Filters, Detail, and CSV

## Context

Implement only the Phase 4 read/query and CSV domain layer. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 4 design/plan, Prisma schema, issuance types, existing pagination/query conventions, authorization policies, and roster CSV utilities/tests. Do not add routes, actions, pages, components, or navigation.

## Files

- Create `src/modules/issuance/services/issuance-query-service.ts`
- Create `src/modules/issuance/services/issuance-query-service.test.ts`
- Create `src/modules/issuance/services/issuance-csv.ts`
- Create `src/modules/issuance/services/issuance-csv.test.ts`
- Modify a small reusable CSV/query helper only if necessary and document it.

## Required Interfaces

- `listIssuances(actor, filters)` with 20-row pagination, total/page metadata, deterministic ordering, search, status/class/badge filters, and role scope.
- `getIssuanceDetail(actor, issuanceId)` with authorization-safe ownership behavior and parsed historical snapshots.
- `listIssueOptions(actor, classId)` containing only eligible active badge templates and active enrollments for an owned active class.
- `buildIssuanceCsv(rows): Uint8Array` with UTF-8 BOM, CRLF, exact headers/order, quoting, and spreadsheet-formula protection.

Use explicit runtime-validated return types; do not leak unparsed `Prisma.JsonValue` to UI/export callers.

## Authorization

- Administrator list/detail reads have no Faculty-owner restriction and remain read-only.
- Faculty list queries must include `class.ownerUserId = actor.id` in the database `where` clause.
- Faculty class-scoped queries/options require ownership and active class status.
- Unauthorized detail must not leak whether another Faculty member’s issuance exists; use the project’s safe not-found pattern.
- Private recipient email may appear only in an authorized detail/export result, never in ordinary list rows.
- All server-side role/scope predicates require named tests.

## Search, Filters, and Options

- Search covers recipient snapshot display name/student number and achievement snapshot badge/class identity fields using database-compatible predicates or safe bounded post-processing consistent with pagination correctness.
- Preserve status/class/badge filters and normalized page input.
- Options exclude archived badges, removed enrollments, cross-class records, and ineligible data; use deterministic human-friendly ordering.

## CSV

- Define and test literal header order according to the Phase 4 design/requirements.
- BOM-prefixed UTF-8 and CRLF rows.
- Proper CSV quotes/escaping.
- Prefix formula-dangerous cells beginning with `=`, `+`, `-`, or `@` (including leading whitespace cases if existing convention requires it).
- Round-trip through the existing parser.
- Include private email only because export route will be authorized; do not include full credential/snapshot JSON.

## TDD Tests

Prove RED, then cover Administrator versus Faculty Prisma scopes, owned class option scope, safe unauthorized detail, archived/removed exclusion, search/filter/pagination preservation, runtime JSON parsing/failure behavior, exact CSV headers/order, Unicode names, email inclusion, quoting, BOM/CRLF, and formula safety.

## Verification

- Focused RED then GREEN
- Scoped formatting
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Production build

## Report

Write `task-4-report.md` in this SDD directory with exact files, RED/GREEN evidence, authorization/query/runtime-validation/CSV decisions, commands/results, and concerns. Git commits are unavailable. Return only status, one-line verification summary, and concerns.
