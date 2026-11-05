# Administrator Dashboard Layout Improvements — Report

**Date:** 3 November 2026  
**Status:** COMPLETE  
**Scope:** Local development only  
**Deployment:** Not performed; no commit, push, or merge

## Summary

Improved the Administrator dashboard layout without changing data sources, authorization,
credential detail behavior, or the Faculty/Student dashboards. This report supersedes the
KPI row and dashboard recent-table layout details in `DASHBOARD-RESPONSIVE-REPORT.md`.

- All eight Administrator KPI cards now fit on one row at 1440px and wider.
- Trend and Quick Actions render at the same height, and the trend chart fills its panel.
- Recent Badge Issuances and Recent Activities use compact, scrollable tables with five
  rows per page, sticky headers, Previous/Next pagination, page/total/record counts, and
  View All navigation.
- The dashboard uses server-side pagination through the existing dashboard service.

## Requirement mapping

| Requirement             | Implementation                                                                 |
| ----------------------- | ------------------------------------------------------------------------------ |
| FR-002 RBAC             | Dashboard stays behind `requireRole(actor, ["ADMIN", "FACULTY"])`.             |
| FR-021 Search/Filter    | Existing dashboard data sources preserved; pagination added.                   |
| Application Shell       | Existing light theme, navy headings, borders, radii, and typography preserved. |
| Administrator dashboard | Eight KPIs in one row on wide desktops; equal-height trend/actions panels.     |
| Recent records          | Five-row server-side pages with sticky headers and scrollable viewports.       |

## Changes

### KPI cards

- Added `dashboard-stat-grid` to the Administrator/Faculty summary.
- Breakpoints:
  - 8 columns at 1440px and wider;
  - 4 columns from 1024px to 1439px;
  - 2 columns from 481px to 1023px;
  - 1 column at 480px and below.
- Cards remain equal-width grid items and stretch to equal row height.
- Existing status colors and values are unchanged.

### Trend and Quick Actions

- Preserved the approximately 2/3 + 1/3 split.
- Both panels stretch to the same row height.
- The trend panel is a flex column; the chart fills the remaining vertical space and
  grows with the panel while retaining the existing 14-day data and behavior.
- All four Quick Action buttons remain intact.
- The panels stack vertically below 820px.

### Recent Badge Issuances

- Kept the card full width and the View All link.
- Server-side pagination at five records per page with deterministic newest-first sorting
  (`issuedAt DESC, id DESC`).
- Added page/total-page/record-count metadata and Previous/Next controls.
- Added a `360px` vertically scrollable viewport with sticky column headers and horizontal
  scrolling on narrow screens.
- Preserved credential links and status badges.

### Recent Activities

- Replaced the activity list with a compact table (Activity, Details, When).
- Server-side pagination at five records per page with newest-first sorting
  (`createdAt DESC, id DESC`).
- Added page/total-page/record-count metadata and Previous/Next controls.
- Sticky headers, scrollable viewport, and horizontal scrolling on narrow screens.
- Preserved the View All Activity link, activity labels/descriptions/timestamps, and
  Administrator/Faculty scoping.

## Files changed

- `src/app/dashboard/page.tsx`
- `src/app/dashboard/page.test.tsx`
- `src/components/dashboard/stat-cards.tsx`
- `src/components/dashboard/issuance-trend.tsx`
- `src/components/dashboard/quick-actions.tsx`
- `src/components/dashboard/recent-issuances.tsx`
- `src/components/dashboard/recent-activities.tsx`
- `src/components/dashboard/record-pagination.tsx` (new)
- `src/modules/dashboard/types.ts`
- `src/modules/dashboard/services/dashboard-service.ts`
- `src/modules/dashboard/services/dashboard-service.integration.test.ts`
- `src/app/globals.css`
- `e2e/dashboard-layout.spec.ts`
- `e2e/dashboard-and-user-menu.spec.ts`
- `e2e/global-setup.ts` (two additional disposable audit fixtures for pagination coverage)
- `docs/screenshots/after-{admin,faculty,student}-{1920,1440,1280,1024,768,390}.png`

## Verification

| Check                        | Result                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| Format                       | PASS                                                         |
| Lint                         | PASS                                                         |
| Typecheck                    | PASS                                                         |
| Unit tests                   | PASS — 115 files, 834 tests                                  |
| Integration tests            | PASS — 19 files, 126 tests                                   |
| Production build             | PASS                                                         |
| Dashboard Playwright specs   | PASS — 5 passed, 1 skipped (desktop/mobile dashboard matrix) |
| Full suite, desktop isolated | PASS — 24 passed                                             |
| Full suite, mobile isolated  | PASS — 23 passed, 1 skipped                                  |
| Live local smoke test        | PASS                                                         |

Playwright verified:

- 8 KPI columns at 1920px and 1440px, 4 at 1280px and 1024px, 2 at 768px, and 1 at
  390px;
- identical Trend and Quick Actions panel heights;
- no page-level horizontal overflow at any width;
- five rows in each recent table, sticky headers, `360px` scroll viewports;
- Previous/Next pagination on both tables, including URL state preservation;
- no regression to the Faculty or Student dashboards.

The combined desktop+mobile Playwright invocation again hit the previously documented
shared fixed-window rate-limit limitation in two mobile tests. Both failing tests passed
when run alone, and both projects pass fully when run in separate invocations.

## Screenshots

- `docs/screenshots/after-admin-1920.png`
- `docs/screenshots/after-admin-1440.png`
- `docs/screenshots/after-admin-1280.png`
- `docs/screenshots/after-admin-1024.png`
- `docs/screenshots/after-admin-768.png`
- `docs/screenshots/after-admin-390.png`
- Matching `after-faculty-*` and `after-student-*` captures are retained for regression.

## Outstanding issues

- The combined Playwright suite remains sensitive to shared fixed-window rate limits when
  both projects run in one invocation; this is a pre-existing harness issue, not a
  dashboard regression.
- The recent-record tables intentionally use horizontal scrolling on narrow screens
  instead of stacked cards, per this task's requirements.
- The trend chart remains horizontally scrollable at narrow widths (existing behavior).
- Screenshots use disposable E2E fixture data.

## Acceptance

| Criterion                                             | Result |
| ----------------------------------------------------- | ------ |
| Eight KPI cards on one row on a wide desktop          | PASS   |
| Trend and Quick Actions equal height                  | PASS   |
| Five records per page with working pagination         | PASS   |
| Scrollable record-table viewports with sticky headers | PASS   |
| No horizontal page overflow across tested widths      | PASS   |
| Faculty and Student dashboards unchanged              | PASS   |
