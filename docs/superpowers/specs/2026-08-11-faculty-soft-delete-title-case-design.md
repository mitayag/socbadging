# Faculty Soft Delete and Title Case Design

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Requirements:** FR-002, FR-003, FR-020; accessibility and modern-light UI requirements from Sections 9–11

## Goal

Allow an Administrator to remove a faculty account from normal use without destroying related institutional records, and standardize user-facing interface labels and controls to Title Case.

## Scope

This change includes faculty soft deletion, deleted-account filtering and inspection, session invalidation, login prevention, an audit record, authorization tests, and a UI copy pass for headings, field labels, navigation labels, disclosure titles, buttons, and short control captions.

It does not physically delete users, classes, rosters, badge templates, issued credentials, or audit records. It does not add a restore workflow. Descriptive prose, help text, validation messages, notices, and full sentences remain sentence case. It does not change Classes, Students, Badges, or Badge Issuance behavior.

## Chosen Approach

Use a dedicated `DELETED` value in `UserStatus` rather than hard deletion or reusing `SUSPENDED`.

- Hard deletion risks foreign-key failures and loss of historical ownership and audit context.
- Suspension is temporary access control and should remain distinct from administrative deletion.
- A dedicated state is explicit, reversible at the data layer, and preserves institutional records.

## Data Model and Migration

Extend `UserStatus` from `ACTIVE | SUSPENDED` to `ACTIVE | SUSPENDED | DELETED`. Add nullable `users.deleted_at` (`DateTime?`) to record when deletion occurred. The append-oriented audit entry supplies the deleting Administrator and event timestamp, avoiding a second self-referential user relation solely for attribution.

The Prisma schema change must have a checked-in MariaDB migration. Existing rows retain their current status and a null `deleted_at`.

## Faculty Deletion Flow

An Administrator initiates deletion from the Faculty Management screen and must use an explicit confirmation control. The server action authenticates the current session and delegates to a faculty service method. The service enforces the `ADMIN` role before any mutation and accepts only a target whose role is `FACULTY` and whose status is not already `DELETED`.

One database transaction will:

1. Set the target user status to `DELETED`.
2. Set `deleted_at` to the current timestamp.
3. Increment the target's session version and remove outstanding sessions and password-reset tokens so existing access ends immediately.
4. Append a `faculty.deleted` audit record with the Administrator actor, faculty target, previous status, and deletion context.

No related domain record is deleted or rewritten. If the target does not exist, is not Faculty, or is already deleted, the service returns a safe domain error and makes no partial change.

## Authentication and Authorization Behavior

Only `ACTIVE` users may authenticate or continue an authenticated session. Existing authentication checks must therefore reject `DELETED` users in the same security boundary that rejects suspended users.

The following faculty-management operations reject deleted targets:

- editing faculty details;
- activating or suspending access;
- resetting faculty access.

Deletion is Administrator-only on the server. UI visibility is not treated as authorization. Automated tests must prove that Faculty actors cannot delete accounts and that deleted users cannot authenticate or reuse prior sessions.

## Faculty Management UI

Normal Faculty Management results show `ACTIVE` and `SUSPENDED` accounts. The status filter gains a `DELETED` option so Administrators can inspect deleted faculty records. Deleted rows display a clear red `Deleted` status and deletion timestamp, while edit, reset, activate, suspend, and delete controls are unavailable.

Active and suspended faculty rows include a destructive `Delete Faculty` disclosure or confirmation area. The final action is labeled `Confirm Delete Faculty` and explains that access will be disabled while related classes and historical records remain preserved.

No restore button is included in this change. Adding restoration later requires a separately designed workflow and audit action.

## Title Case Copy Rules

Apply Title Case to short user-interface labels across the current application:

- page and section headings;
- navigation and tab labels;
- form field labels;
- disclosure summaries;
- buttons and short action links;
- filter labels and option display names;
- short table/card captions and status display names.

Preserve conventional casing for acronyms and technical tokens, including `CSV`, `XLSX`, `URL`, `ID`, and email. Keep articles, conjunctions, and short prepositions lowercase when internal to a label unless they begin or end it. Examples include `Manage Departments`, `Create Faculty Account`, `Employee ID`, and `Import CSV or XLSX`.

Do not Title Case paragraphs, help text, notices, validation errors, empty-state sentences, or other complete sentences. This keeps the interface readable and avoids mechanical capitalization of prose.

## Component Boundaries

- `faculty-service` owns deletion rules, the transaction, and audit creation.
- the faculty server action authenticates the actor, parses the target ID, invokes the service, and revalidates/redirects.
- the Faculty Management page owns filtering and presentation.
- a small reusable deletion confirmation component may own confirmation UI state; it must not contain authorization logic.
- authentication/session repositories continue to decide whether a stored user is eligible for access based on `ACTIVE` status.

These boundaries follow existing service/action/page patterns and avoid unrelated refactoring.

## Error Handling

Authorization failures remain server-side errors and must not mutate data. Invalid, missing, non-Faculty, or already-deleted targets produce a safe user-facing notice without exposing database details. Transaction failure rolls back status, session invalidation, and audit insertion together.

## Testing and Verification

Implementation follows test-driven development. Tests must cover:

- Faculty actors are denied before database mutation.
- An Administrator can soft-delete an active or suspended Faculty user.
- Deletion sets `DELETED` and `deleted_at`, invalidates sessions/reset tokens, and records `faculty.deleted` atomically.
- Non-Faculty, missing, and already-deleted targets are rejected.
- Deleted targets cannot be edited, activated, suspended, or reset.
- Deleted users cannot log in or continue an existing session.
- Faculty list filtering supports `DELETED` while normal views exclude deleted accounts.
- The deletion confirmation and key Title Case labels render correctly.

Before claiming completion, run formatting checks, lint, TypeScript type checking, all automated tests, the production build, database migration validation, a Docker smoke test, and browser-based desktop/mobile checks of Faculty Management and authentication behavior.

## Assumptions

- “Delete” means removal from active administration and access, not irreversible record destruction.
- The audit log is the authoritative record of who performed deletion; `deleted_at` is the convenient lifecycle timestamp on the user record.
- Deleted faculty remain owners of their existing domain records so historical attribution is intact.
- Restoration is intentionally excluded until its authorization, conflict, and audit semantics are designed.
