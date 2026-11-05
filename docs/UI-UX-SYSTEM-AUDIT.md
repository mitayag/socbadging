# HAU SOC Badging System — UI/UX System Audit

**Date:** 3 November 2026  
**Scope:** Local repository inspection and rendered-application review  
**Environment:** Local development only

## 1. Method

The audit covered every `page.tsx`, `layout.tsx`, `loading.tsx`, and `error.tsx` under
`src/app`, the shared components under `src/components`, the role-specific layouts, and the
read/write services used by those pages. Pages were also checked at desktop, tablet, and mobile
widths through Playwright where applicable.

Classification legend:

- **A — Management Table:** record collections that benefit from search, filters, sorting,
  pagination, sticky headers, scrolling, counts, states, and permission-based actions.
- **B — Dashboard View:** KPI cards, charts, quick actions, and compact recent-record tables.
- **C — Form / Configuration:** create/edit/settings flows that must remain forms.
- **D — Badge Gallery:** image-oriented badge collections with grid/list presentation.
- **E — Detail / Verification:** a single record, history, activation, recovery, or public
  verification view.
- **Public/Auth:** unauthenticated or session-establishment pages.

Status legend:

- **Implemented** — standardized table or layout implemented and verified.
- **Audited** — reviewed; existing layout is appropriate, no change required.
- **Already compliant** — table/gallery already met the target; only consistency notes remain.
- **Deferred** — table conversion would be beneficial but is intentionally postponed.
- **Requires further review** — data/UX issue documented; not a layout blocker.

## 2. Route inventory

| Route                          | User Role         | Current Layout                          | Recommended Layout                             | Missing Functionality                                                              | Priority | Class / Status                |
| ------------------------------ | ----------------- | --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | ----------------------------- |
| `/`                            | Public            | Redirect to `/login`                    | Redirect                                       | None                                                                               | Low      | Public/Auth — Audited         |
| `/login`                       | Public            | Centered authentication form            | Preserve                                       | None                                                                               | Low      | Public/Auth — Audited         |
| `/dashboard`                   | Admin, Faculty    | KPI cards, trend, quick actions, tables | Preserve dashboard; compact recent tables      | None                                                                               | High     | B — Audited/Already compliant |
| `/dashboard/activity`          | Admin, Faculty    | Paginated activity list                 | Compact standardized history table             | Table view, page-size control, count, filters                                      | Medium   | B/E — Deferred                |
| `/faculty`                     | Admin             | Shared management table                 | Shared data table                              | None — create/edit/reset/status/delete retained                                    | High     | A — Implemented               |
| `/students`                    | Admin             | Shared management table                 | Shared data table                              | None — create/edit/delete/invite/status retained                                   | High     | A — Implemented               |
| `/classes`                     | Admin, Faculty    | Stacked expandable class cards          | Searchable/sortable/paginated table            | Table, sorting, page-size control, total/page count, sticky/scroll viewport        | High     | A — Implemented               |
| `/classes/[classId]/students`  | Admin, Faculty    | Stacked expandable roster cards         | Searchable/sortable/paginated table            | Table, sorting, page-size control, totals, sticky/scroll viewport                  | High     | A — Implemented               |
| `/classes/[classId]/badges`    | Admin, Faculty    | Badge gallery + create/edit forms       | Preserve gallery; forms remain forms           | Optional pagination for large template sets                                        | Medium   | D — Audited/Already compliant |
| `/classes/[classId]/issued`    | Admin, Faculty    | Issuance forms + issuance records       | Forms preserved; records in standardized table | Sorting/page-size/totals added; table view                                         | High     | A — Implemented               |
| `/classes/[classId]/settings`  | Admin, Faculty    | Read-only detail panel                  | Preserve detail layout                         | None                                                                               | Low      | E — Audited                   |
| `/issued`                      | Admin, Faculty    | Stacked issuance cards                  | Standardized issuance table                    | Search/filter existed; table, sorting, page sizes, counts, sticky/scroll added     | High     | A — Implemented               |
| `/issued/[issuanceId]`         | Admin, Faculty    | Credential detail + actions             | Preserve detail layout                         | None                                                                               | High     | E — Audited                   |
| `/issuance-batches/[batchId]`  | Admin, Faculty    | Batch result/history detail             | Preserve detail layout                         | None                                                                               | Medium   | E — Audited                   |
| `/notifications`               | Admin, Faculty    | Data table with filters/pagination      | Standardized delivery table                    | Page sizes, record count, sticky/scroll viewport added; newest-first fixed sorting | High     | A — Implemented               |
| `/notifications/[deliveryId]`  | Admin, Faculty    | Delivery history detail                 | Preserve detail layout                         | None                                                                               | Medium   | E — Audited                   |
| `/audit-logs`                  | Admin             | Standardized audit table                | Standardized audit table                       | Search/filter/date/sort/page-size/sticky/scroll/count implemented                  | High     | A — Implemented               |
| `/settings`                    | Admin             | Configuration forms                     | Preserve forms                                 | None                                                                               | Low      | C — Audited                   |
| `/profile`                     | Admin, Faculty    | Profile/detail form                     | Preserve profile layout                        | None                                                                               | Low      | C — Audited                   |
| `/account`                     | All authenticated | Account settings forms                  | Preserve forms                                 | None                                                                               | Low      | C — Audited                   |
| `/credentials/[publicId]`      | Public            | Public verification card                | Preserve verification layout                   | None                                                                               | High     | E — Audited                   |
| `/student`                     | Student           | Dashboard + complete badge wallet       | Preserve dashboard/gallery                     | None                                                                               | High     | B/D — Already compliant       |
| `/student/badges`              | Student           | Badge gallery with filters/grid/list    | Preserve gallery                               | None                                                                               | High     | D — Already compliant         |
| `/student/badges/[issuanceId]` | Student           | Credential detail, downloads, sharing   | Preserve detail layout                         | None                                                                               | High     | E — Audited                   |
| `/student/notifications`       | Student           | Paginated notification table            | Preserve personal history table                | Optional page-size/sort controls                                                   | Low      | E — Audited/Deferred          |
| `/student/profile`             | Student           | Identity detail                         | Preserve detail layout                         | None                                                                               | Low      | C — Audited                   |
| `/student/help`                | Student           | Help content                            | Preserve content                               | None                                                                               | Low      | E — Audited                   |
| `/student/activate/[token]`    | Public/Student    | Activation form                         | Preserve form                                  | None                                                                               | High     | C — Audited                   |
| `/student/recover`             | Public            | Recovery request form                   | Preserve form                                  | None                                                                               | Medium   | C — Audited                   |
| `/student/recover/[token]`     | Public            | Password reset form                     | Preserve form                                  | None                                                                               | Medium   | C — Audited                   |

## 3. API route appendix

These are not page layouts, but they back the audited modules and were checked for
authorization, scoping, and data shape:

- `/api/auth/login`, `/api/auth/logout`
- `/api/issued/export`, `/api/issued/[issuanceId]/credential`
- `/api/classes/[classId]/issued/export`
- `/api/classes/[classId]/issued/batch/inspect|preview|commit|template.csv|template.xlsx`
- `/api/classes/[classId]/roster/export|import/inspect|import/preview`
- `/api/credentials/[publicId]`, `/download`, `/image`, `/pdf`, `/qr`
- `/api/status-lists/[listId]`, `/api/issuers/hau-soc/keys/[keyId]`
- `/api/notifications/[deliveryId]/retry|resend`
- `/api/webhooks/brevo`, `/api/health`, `/api/media/[...key]`

No API route was converted to a table. Existing authorization and scoping were preserved.

## 4. Cross-cutting findings

- **Stacked card collections:** Faculty, Student Accounts, Audit Logs, Classes, Class Roster,
  and Issued Badges used or evolved from stacked `<details>` cards. They are now standardized
  tables or shared table sections.
- **Duplicate table implementations:** Faculty, Students, Audit Logs, and Notifications each
  had their own table markup/styles. `DataTable` and shared `.data-table` styles now provide
  the common structure; module-specific column renderers remain.
- **Inconsistent pagination:** Some tables used 20-row pages, some used 10, some had no page
  size. Standardized management tables now default to 5 with 10/25/50 options where the
  service supports it.
- **Missing loading states:** Audit Logs, Classes, Issued Badges, Notifications, Student
  Accounts, and class workspaces had no route-level loading skeleton. Loading files were
  added.
- **Missing error state:** There was no application-level error boundary outside Dashboard
  and Student. A shared root error state was added.
- **Mobile table behavior:** Several tables transformed into stacked cards on mobile. The
  standardized system now keeps semantic tables with contained horizontal scrolling and
  sticky headers.
- **Excessive width constraints:** Workspace tables now use the full available width. Narrow
  constraints remain only on forms, account settings, and detail pages where they improve
  readability.
- **Data hygiene:** The local app database contains 27 legacy issuance rows with empty `{}`
  snapshots. They are surfaced as “Credential data unavailable” rather than crashing the
  Issued Badges page. No records were deleted.
- **Deferred history views:** `/dashboard/activity` remains a paginated list; it is a
  low-traffic operational history and can be converted to the same table system in a follow-up.
- **Notification sorting:** Delivery history intentionally sorts newest-first. User-selectable
  sort controls are not yet exposed.

## 5. Defects discovered

| Defect                                                             | Status   | Notes                                                                                              |
| ------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `/issued` returned HTTP 500 for legacy `{}` snapshots              | Fixed    | Tolerant list projection + unavailable-row fallback + safe detail not-found + tests.               |
| Class row action labels said “Reopen” for active classes           | Fixed    | Action label/icon now derived from current status; dialog derives from target status.              |
| Roster row action labels said “Restore” for active enrollments     | Fixed    | Same status/target separation as class actions.                                                    |
| Notifications table had no standard scroll/sticky header/page size | Fixed    | Added `data-table-scroll`, sticky styles, page sizes, record count, shared pager.                  |
| No loading state for several management routes                     | Fixed    | Added loading skeletons for Audit Logs, Classes, Issued, Notifications, Students, class workspace. |
| No root error boundary outside Dashboard/Student                   | Fixed    | Added `src/app/error.tsx`.                                                                         |
| Duplicate table CSS/markup across modules                          | Improved | Shared `DataTable`, `RecordPagination`, and `.data-table` styles.                                  |
