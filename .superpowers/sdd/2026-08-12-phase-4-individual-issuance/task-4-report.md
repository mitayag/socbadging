# Task 4 Report — Authorized Issuance Queries, Filters, Detail, and CSV

## Scope

Implemented only the Phase 4 issuance read/query and CSV domain layer. No routes, actions, pages, components, or navigation were added.

### Files created

- `src/modules/issuance/services/issuance-query-service.ts`
- `src/modules/issuance/services/issuance-query-service.test.ts`
- `src/modules/issuance/services/issuance-csv.ts`
- `src/modules/issuance/services/issuance-csv.test.ts`

### Small reusable helper updated

- `src/modules/rosters/services/roster-validation.ts`
  - Extended the existing spreadsheet-formula guard to catch a formula marker after leading whitespace. The existing CSV quoting and escaping helper is reused by issuance export.

## RED / GREEN evidence

### RED

Ran before production modules existed:

```text
npm test -- src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/issuance-csv.test.ts
```

Result: failed as expected because `./issuance-query-service` and `./issuance-csv` could not be resolved.

### GREEN

After the minimal domain implementation:

```text
npm test -- src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/issuance-csv.test.ts
```

Result: 2 files passed, 17 tests passed.

### Review remediation

Added named tests for the email-bearing export boundary without changing production code:

- unauthenticated export rejects before an issuance database query;
- Administrator export has no Faculty owner predicate and retains recipient email in the authorized export result.

The focused suite now passes 2 files and 19 tests.

## Authorization and query decisions

- `listIssuances` requires authentication. Faculty queries embed `class.ownerUserId = actor.id` in the Prisma `where` clause; Administrator queries do not receive an owner predicate.
- The list applies normalized page input, 20-row pagination, count-backed page metadata, and stable `issuedAt DESC, id DESC` ordering.
- Search uses MariaDB-compatible Prisma JSON path predicates over historical recipient display-name/student-number and achievement name/class course-code/title snapshots. Status, class, and badge filters are composed with the role scope.
- `getIssuanceDetail` uses the same Faculty ownership predicate in its database lookup. A missing or inaccessible record raises the same `IssuanceNotFoundError`, avoiding existence disclosure.
- `listIssueOptions` is Faculty-only and first requires an owned, active class. It selects only active owned badge templates and active enrollments with deterministic human-friendly ordering.
- Ordinary list rows intentionally omit recipient email. A separate authorized export query returns it only for CSV construction.

## Runtime validation and CSV decisions

- Recipient, achievement, issuer, and credential JSON snapshots are parsed with narrow Zod schemas before being returned. Malformed historical JSON fails safely instead of reaching UI or export callers as `Prisma.JsonValue`.
- CSV has the literal approved header order, a UTF-8 BOM, CRLF separators, proper quoting/escaping, and no credential or snapshot JSON.
- Export uses the shared formula sanitizer and now also prefixes cells whose first non-whitespace character is `=`, `+`, `-`, or `@`.
- Tests round-trip Unicode and recipient email through the existing CSV parser.

## Verification

| Command                                                                     | Result                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused Task 4 tests                                                        | Passed: 2 files, 19 tests                                                                                                                               |
| `npm run typecheck`                                                         | Passed                                                                                                                                                  |
| `npm run lint`                                                              | Passed                                                                                                                                                  |
| `npm test`                                                                  | Passed: 25 files, 107 tests                                                                                                                             |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build` | Passed                                                                                                                                                  |
| `npm run format`                                                            | Blocked by pre-existing unrelated formatting in `task-1-review-package.md` and `task-2-brief.md`; Task 4 source/test files were formatted individually. |

## Requirements mapping

- **FR-021:** authorized issuance search, status/class/badge filtering, deterministic pagination, and detail lookup.
- **FR-022:** authorized issuance CSV row construction with required headers and spreadsheet-safety.
- **Security/privacy integrity rules:** server-side Faculty ownership scope, authorization-safe detail lookup, historical snapshot parsing, and recipient email excluded from ordinary list rows.

## Concerns

- The repository-wide formatting gate currently fails only because two existing Phase 4 SDD markdown artifacts are not Prettier-formatted. They were intentionally not changed because they are outside Task 4.
- Git commit/branch operations remain unavailable because the supplied workspace is not a Git repository.
