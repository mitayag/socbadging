# Dashboard and Responsive Layout TODO

**Status:** LOCAL IMPLEMENTATION COMPLETE  
**Known non-UI test flake:** Mobile Phase 8 batch-upload E2E test

## Audit

- [x] Inspect Admin/Faculty/Student dashboards.
- [x] Inspect shared AppShell, sidebar, topbar, user menu, and CSS breakpoints.
- [x] Identify fixed-width workspace and excessive main padding.
- [x] Identify KPI grid imbalance and activity-list height.
- [x] Identify narrow student badge gallery at desktop widths.

## Student dashboard

- [x] Show all earned badges across classes, issuers, and terms.
- [x] Add summary cards for total, active, expired, and revoked.
- [x] Add grid/list views.
- [x] Add search, status filter, sorting, and pagination.
- [x] Preserve badge detail, verification, downloads, and sharing.
- [x] Add meaningful empty states.
- [x] Preserve student ownership isolation.

## Student ownership

- [x] Confirm credentials are selected by `StudentAccount.studentId`, not email/display name.
- [x] Add integration test proving same-email records do not leak.
- [x] Preserve existing public verification.

## Responsive layout

- [x] Remove `workspace-page` 1120px cap.
- [x] Use 24–32px desktop outer padding.
- [x] Use 8px-based spacing.
- [x] Use 4-column KPI rows on wide desktop.
- [x] Add eighth Faculty KPI for balanced 4×2 layout.
- [x] Use 2-column KPI layout below 1000px.
- [x] Stretch chart and quick-actions panels in the split grid.
- [x] Make recent issuances full-width.
- [x] Compact activity history to five items with View All.
- [x] Add `/dashboard/activity` paginated operational history.
- [x] Make student gallery cards vertical and responsive.
- [x] Keep tables horizontally scrollable on small screens.
- [x] Preserve sidebar and user-menu Logout behavior.

## Visual verification

- [x] Capture Admin, Faculty, and Student screenshots at 1920, 1440, 1280, 1024, 768, and 390 widths.
- [x] Assert no horizontal overflow.
- [x] Assert 4 KPI columns at ≥1024px and 2 columns below.
- [x] Capture after-width matrix; before images were overwritten by later E2E runs and are documented as a retention caveat.

## Validation

- [x] Format.
- [x] Lint.
- [x] Typecheck.
- [x] Unit tests.
- [x] Integration tests.
- [x] Production build.
- [x] Responsive Playwright matrix.
- [x] Full Playwright regression suite (one mobile batch-upload flake passed standalone).
