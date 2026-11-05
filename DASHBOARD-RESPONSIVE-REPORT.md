# Dashboard and Responsive Layout Report

**Implementation status:** LOCAL IMPLEMENTATION COMPLETE  
**Final acceptance:** CONDITIONAL PASS (2 November 2026)  
**Deployment:** Not performed  
**Production:** Not modified

## Final acceptance results

### Scope and method

- Reviewed all 18 after screenshots: Admin, Faculty, and Student at 1920, 1440, 1280,
  1024, 768, and 390px.
- Exercised KPI cards, charts, quick actions, tables, activity history, student search,
  filters, sorting, pagination, grid/list views, downloads, QR codes, sharing, and
  revoked/expired presentation.
- Ran format, lint, typecheck, unit tests, integration tests on a clean disposable
  database, the production build, the combined Playwright suite twice, project-isolated
  Playwright runs, and eight targeted repetitions of the mobile Phase 8 batch test.

### Visual review

- KPI cards form a balanced 4×2 grid at 1024px and wider, and a 2×2 grid below 1024px.
  Card widths are equal and aligned.
- Content uses the full workspace at 1920px and 1440px with 24–32px outer padding. No
  excessive horizontal whitespace remains.
- The trend and quick-actions panels share equal height and top alignment. Recent
  issuances occupy the full content width. Activity history is compact and links to the
  paginated `/dashboard/activity` page.
- Tables remain readable at desktop widths and convert to labelled stacked rows on
  mobile. Student wallet cards step from four columns at 1920px to one column at 390px.
- No page-level horizontal overflow was found at any of the six widths.
- Minor observation: the 14-day trend chart keeps a `520px` minimum width and scrolls
  horizontally inside its panel at 1024px (and, because each bar has a 26px minimum, at
  390px). This is contained scrolling, not page overflow, and is not an acceptance
  blocker.

### Student functional verification

- The seeded student account showed 13 earned badges (10 active, 2 expired, 1 revoked).
  All badges belonged to the authenticated student record; the dashboard and wallet
  paginated consistently (12 on page 1, 1 on page 2).
- Ownership isolation is preserved: selection uses `StudentAccount.studentId`, the
  same-email integration test passes, and another student's credential returns 404.
- Search, status filters, sorting, grid/list switching, and pagination were verified with
  a temporary local Playwright acceptance spec on desktop and mobile (4 tests passed).
  The temporary spec was removed after the run.
- Downloads (JSON-LD, badge image, PDF), QR image/download, sharing links, copy-link, and
  the sharing-disabled state are covered by the existing suite and pass.
- Revoked and expired badges are labelled consistently on cards and detail pages, and the
  public verification page distinguishes revoked, expired, tampered, and legacy
  credentials.

### Mobile batch-upload failure investigation

The originally reported mobile Phase 8 batch-upload failure did not reproduce. The exact
test passed in eight consecutive isolated repetitions (16/16 executions across desktop
and mobile).

The intermittent mobile failures observed during acceptance are caused by the E2E
harness, not by the dashboard changes. The rate limiter is intentionally process-global
and uses fixed 60-second windows:

- **Login policy:** 10 attempts per 60 seconds, keyed by the anonymous client and email.
  The combined desktop+mobile suite performs 13 Administrator logins. When enough of them
  fall in one fixed window, the next login returns 429; the login form displays its
  generic "Invalid email or password" message.
- **Public HTML policy:** 60 requests per 60 seconds per credential. The desktop and
  mobile runs of the Phase 6 rate-limit test reuse the same rate-limit credential, so the
  mobile run can start with an exhausted bucket and receive 429 on its first request.

Evidence:

- Combined run 2 failed only the mobile Phase 6 rate-limit test (expected 200, received 429) and the mobile Phase 8 Administrator login (429 reported as invalid credentials).
- Both failing tests pass when run alone on a fresh server and window.
- The desktop and mobile projects each pass fully when run in separate invocations with a
  fresh server and database reset.
- `rate_limit_buckets` confirms per-policy, per-window accumulation across tests.

Recommended follow-up before using the combined suite as a hard release gate: reset the
`rate_limit_buckets` table before each Playwright project (or give each project an
isolated rate-limit key/window), or run the projects in separate invocations.

### Playwright results

| Run                                    | Result                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| Combined suite, run 1                  | 47 passed, 1 skipped                                          |
| Combined suite, run 2                  | 42 passed, 2 failed, 3 did not run, 1 skipped (rate limiting) |
| Desktop project, isolated              | 24 passed                                                     |
| Mobile project, isolated               | 23 passed, 1 skipped                                          |
| Phase 8 batch test, 8 isolated repeats | 16 passed (8 desktop, 8 mobile)                               |
| Responsive screenshot matrix           | PASS — captured Admin, Faculty, and Student at all 6 widths   |

The two combined-run-2 failures were re-run alone and passed. The dashboard layout matrix
and all dashboard/user-menu tests passed in every run.

### Static verification

| Check                        | Result                      |
| ---------------------------- | --------------------------- |
| Format                       | PASS                        |
| Lint                         | PASS                        |
| Typecheck                    | PASS                        |
| Unit tests                   | PASS — 115 files, 828 tests |
| Integration tests (clean DB) | PASS — 19 files, 125 tests  |
| Production build             | PASS                        |

### Recommendation

**CONDITIONAL PASS.**

Admin, Faculty, and Student dashboard visual acceptance passes, and the responsive layout
changes did not regress existing product functionality. The only unresolved issue is E2E
harness nondeterminism caused by shared fixed-window rate-limit state across Playwright
projects. It is not a product, authorization, or layout regression. Resolve test isolation
(or run the projects separately) before treating the combined suite as a hard release
gate.

## Implementation audit

- `.workspace-page` capped content at `1120px`, leaving large unused space on wide monitors.
- `.main-content` used up to `68px` padding, further narrowing content.
- KPI cards auto-fit unpredictably, producing uneven rows and narrow cards.
- The chart/quick-actions split used `align-items: start`, leaving mismatched panel heights.
- Recent activities used up to eight tall rows without a full-history destination.
- Student gallery cards used a horizontal layout that became cramped at 4–5 columns.
- Student wallet had search/filter/pagination but no sorting or grid/list toggle.
- Student dashboard showed only recent badges instead of the complete earned collection.

## Implementation changes

### Student dashboard

- `/student` now shows all earned badges with summary cards.
- Added shared `StudentBadgeCollection` with search, status filter, sort, grid/list view,
  pagination, and empty state.
- `/student/badges` uses the same collection.
- Student gallery uses responsive vertical cards; list view remains horizontal.
- Credential details, downloads, public verification, and sharing remain unchanged.

### Student ownership

- Credential selection continues to use `StudentAccount.studentId`.
- Added integration coverage proving a different Student record with the same email does
  not expose credentials.
- Existing signed credential and public verification behavior is preserved.

### Dashboard layout

- Removed the 1120px workspace cap.
- Reduced desktop outer padding to 24–32px.
- Set KPI grid to four columns at ≥1024px and two columns below.
- Added a Faculty “Issued (14 days)” KPI so Faculty and Admin both form a balanced 4×2
  summary row.
- Changed dashboard split to a 2/3 + 1/3 grid with equal-height panels.
- Recent issuances remain full-width with a bounded record limit and View All.
- Activity history is limited to five items and links to `/dashboard/activity` with
  pagination.
- Preserved the existing sidebar, branding, light theme, and Logout-in-user-menu behavior.

## Screenshots

After screenshots are available at:

- `docs/screenshots/after-admin-{1920,1440,1280,1024,768,390}.png`
- `docs/screenshots/after-faculty-{1920,1440,1280,1024,768,390}.png`
- `docs/screenshots/after-student-{1920,1440,1280,1024,768,390}.png`

The Playwright width matrix asserts:

- no horizontal page overflow at any tested width;
- four KPI columns at 1024px and wider;
- two KPI columns below 1024px.

**Before-image caveat:** the earlier before screenshots used the same filenames as the
full E2E suite, and later E2E runs overwrote them. The pre-change audit findings are
documented above, and the complete after-width matrix is retained. A formal before/after
archive should be captured from a clean baseline before future redesigns.

## Outstanding issues

- The combined Playwright suite is nondeterministic because rate-limit buckets persist
  across the desktop and mobile projects within the same fixed window. This is a test
  harness issue; the affected tests pass in isolation.
- Screenshots reflect disposable E2E fixture data, not production data.
- The 14-day trend chart scrolls inside its panel below approximately 1100px.
- No deployment, commit, push, or merge was performed.
