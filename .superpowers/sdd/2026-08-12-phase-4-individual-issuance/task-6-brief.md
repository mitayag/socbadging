# Task 6 Brief — Individual Issuance and Records UI

## Context and Skills

Build only the Phase 4 UI on the completed services/actions/routes. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved design/plan, current application shell/navigation/class pages, design tokens, Task 4 view models, and Task 5 routes/actions. Apply the React/Next.js best-practices skill: keep server data fetching parallel, minimize client props, authenticate actions, and avoid unnecessary client components/effects. Follow the frontend-testing/debugging skill for component-level preparation; full rendered Browser QA is Task 7. Do not implement batch issuance, public verification, revocation, or sharing.

## Files

- Create `src/app/classes/[classId]/issued/page.tsx`
- Create `src/app/issued/page.tsx`
- Create `src/app/issued/[issuanceId]/page.tsx`
- Create `src/components/issuance/issue-badge-form.tsx`
- Create `src/components/issuance/issue-badge-form.test.tsx`
- Create `src/components/issuance/issuance-list.tsx`
- Create `src/components/issuance/issuance-list.test.tsx`
- Modify `src/app/classes/[classId]/students/page.tsx`
- Modify `src/app/classes/[classId]/badges/page.tsx`
- Modify `src/components/layout/navigation.ts`
- Modify `src/components/layout/navigation.test.ts`
- Modify `src/app/globals.css`
- Modify another small reusable presentation helper only if necessary and document it.

## UI Behavior

- Class-scoped Issued page loads the class workspace, issue options, and class issuance list with independent work started in parallel after actor resolution.
- Render the issue form only for Faculty; Administrator must never see issuance controls.
- Form consumes only active badge/student options plus classId and the server action.
- Empty badge or roster states disable issuance and explain the next action.
- Selecting badge/student updates a clear confirmation summary; submit label is `Issue Badge` and pending state is accessible.
- Show safe `issued`/`existing` notices from the query string.
- Global list and class list expose filters, pagination, detail links, and their appropriate protected CSV export URL.
- Detail uses only snapshotted data from `getIssuanceDetail`: artwork, achievement, recipient, issuer, class, issued/expiry dates, status, IDs, an unsigned/Open Badges 3.0-aligned (not certified) notice, and credential JSON download.

## Navigation and Design

- Enable `Issued Badges` for Administrator and Faculty in shared navigation.
- Add consistent class tabs: Students, Badges, Issued, Settings, with correct active state.
- Preserve the modern light tokens, current HAU SOC logo layout, high-visibility focus/caret behavior, status colors, and responsive sidebar/top nav.
- Use existing panels/tables/lists; avoid nested dashboard cards.
- Mobile: stack filters/actions, retain readable list content, no horizontal viewport overflow, and keep touch targets accessible.
- Labels use title case per the established user preference.

## TDD Tests

Prove RED then cover:

- Faculty badge/student selectors, confirmation summary, and submit;
- Administrator/no-form behavior at page or presentation boundary;
- empty badge/roster disabled states with actionable copy;
- selector changes update summary;
- issuance list status, public ID, recipient, badge, date, detail/export links, empty state, pagination;
- `Issued Badges` enabled for both roles;
- class tabs and active state on Students, Badges, Issued, Settings surfaces;
- snapshot-only detail and non-certification wording where practical.

## Verification

- Focused component/navigation tests RED then GREEN
- Scoped formatting
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Production build

## Report

Write `task-6-report.md` in this SDD directory with exact files, RED/GREEN evidence, server/client/data-fetch/design decisions, commands/results, and concerns. Git commits are unavailable. Return only status, one-line verification summary, and concerns.
