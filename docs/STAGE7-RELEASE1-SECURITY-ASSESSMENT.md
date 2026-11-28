# Stage 7 Release 1 — Security Assessment

**Date:** 28 November 2026
**Scope:** course catalog, badge library, approvals/versions, shared class assignments, migration.

## 1. Authorization model

| Operation                                | ADMIN             | FACULTY          | STUDENT |
| ---------------------------------------- | ----------------- | ---------------- | ------- |
| Create/edit/archive course               | allow             | deny             | deny    |
| Map class to course (catalog)            | allow (any)       | n/a              | deny    |
| Map own class to course (class settings) | allow             | own classes      | deny    |
| Create badge definition/proposal         | allow             | allow            | deny    |
| Submit proposal                          | allow             | own proposal     | deny    |
| Approve/reject/publish/archive           | allow             | **deny**         | deny    |
| Browse approved library                  | allow             | allow            | deny    |
| View unapproved definition               | allow             | own only         | deny    |
| Assign approved badge                    | allow (any class) | own classes only | deny    |
| Edit/duplicate/archive shared template   | deny              | deny             | deny    |
| Issue credential                         | n/a               | own classes      | deny    |

Enforcement is server-side in `course-service`, `badge-library-service`, `class-badge-assignment-service`, and `badge-service`. UI hiding is not relied upon.

## 2. Verified controls

1. **Approval authority:** `reviewBadgeDefinition` calls `requireRole(actor, "ADMIN")` before any read/write; a faculty call throws `AuthorizationError` (unit test).
2. **Faculty immutability:** `reviseBadgeDefinition` blocks faculty when an approved version exists; `badge-service` blocks faculty mutation of any template with `sharedDefinitionVersionId` (unit test).
3. **Tenant/ownership isolation:** assignments and class badge views call `requireClassOwner` for faculty; list/read paths are role-scoped.
4. **Duplicate assignments:** unique `(classId, badgeDefinitionId)` plus a service check; conflicts are mapped to a friendly error.
5. **Approved-only assignment:** both the version and the definition must be `APPROVED`; archived classes/managed versions rejected.
6. **Course integrity:** assignment enforces course match when the class is mapped; archived courses cannot be newly mapped.
7. **Version immutability:** a new version is a new row; existing `BadgeIssuance` snapshots/signatures/public IDs are never updated.
8. **Archival restrictions:** archiving a definition or assignment stops new issuance by archiving the materialized template; historical credentials remain valid.
9. **Audit coverage:** every sensitive write creates an `AuditLog` row with actor and identifiers.
10. **Input validation:** Zod schemas bound string lengths, numbers and IDs; artwork passes the existing `validateBadgeImage` (PNG/JPEG/WebP, size-limited) before storage.

## 3. Data protection

- No secrets are read, logged or exposed by the new code.
- The migration script prints counts and identifiers only; it does not print database URLs, secrets or student PII.
- Public verification continues to omit recipient email; shared assignment does not add PII to public pages.
- Existing filesystem artwork keys are reused; traversal keys remain rejected by the storage helper.

## 4. Residual risks

| Risk                                                                                       | Mitigation / note                                                                            |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| No separate "badge approver" role                                                          | Administrators are the authorized approvers; documented decision, minimal privilege surface. |
| Duplicate detection is heuristic                                                           | Presented for review; never merged automatically.                                            |
| Direct database access can mutate history                                                  | Out of application scope; production DB access is restricted and audited operationally.      |
| Unmapped legacy classes can receive any approved badge                                     | Intentional backward compatibility; mapping a class to a course enforces the course match.   |
| Archived definitions may still have materialized templates if archived outside the service | All application paths archive through the service; direct SQL is an operational exception.   |

## 5. Verification

- Authorization unit tests: `course-service.test.ts`, `badge-library-service.test.ts`, `class-badge-assignment-service.test.ts`, `badge-authorization.test.ts`.
- Integration tests: shared assignment/issuance, cross-faculty denial, duplicate issuance idempotency, version/archival history preservation.
- Security regression suite included in the full unit test run.
