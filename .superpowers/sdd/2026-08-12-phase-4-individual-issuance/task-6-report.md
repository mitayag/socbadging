# Task 6 Report — Individual Issuance and Records UI

## Scope and Requirement Mapping

Implemented the Phase 4 authenticated individual issuance UI only. This covers the Task 6 portions of FR-010 (Faculty individual issuance controls), FR-012 (displaying immutable issuance/public identifiers), FR-015 (authenticated credential JSON download and aligned-but-not-certified wording), FR-021 (issued-record search/filter/pagination UI), and FR-022 (protected CSV export links). No batch issuance, public verification, revocation, or sharing UI was added.

## Exact Files

Created:

- `src/app/classes/[classId]/issued/page.tsx`
- `src/app/classes/[classId]/settings/page.tsx`
- `src/app/issued/page.tsx`
- `src/app/issued/[issuanceId]/page.tsx`
- `src/app/globals.test.ts`
- `src/components/issuance/credential-detail.tsx`
- `src/components/issuance/credential-detail.test.tsx`
- `src/components/issuance/issue-badge-form.tsx`
- `src/components/issuance/issue-badge-form.test.tsx`
- `src/components/issuance/issue-badge-section.tsx`
- `src/components/issuance/issuance-list.tsx`
- `src/components/issuance/issuance-list.test.tsx`

Modified:

- `src/app/classes/[classId]/students/page.tsx`
- `src/app/classes/[classId]/badges/page.tsx`
- `src/components/layout/navigation.ts`
- `src/components/layout/navigation.test.ts`
- `src/components/layout/sidebar-content.tsx`
- `src/components/layout/sidebar-content.test.tsx`
- `src/app/globals.css`

`issue-badge-section.tsx` is the one small presentation helper added beyond the listed files. It makes the Faculty-only form boundary explicit and unit-testable; server-side authorization remains in the action and domain service.

## RED / GREEN Evidence

- RED: `npm test -- src/components/issuance/issue-badge-form.test.tsx src/components/issuance/issuance-list.test.tsx src/components/layout/navigation.test.ts` initially failed because both issuance components and the navigation/tab behavior did not exist.
- RED: the Administrator presentation-boundary test initially failed to resolve `issue-badge-section`, proving the missing boundary.
- RED: review regression tests failed first for unnamed filters, the incorrect Settings href, static Dashboard highlighting, missing status CSS, and the absent snapshot-detail presentation boundary. A pathname-null regression also failed against the existing app-shell test before the route guard was added.
- GREEN: the focused review suite now passes: 6 files, 12 tests. It covers accessible issuance filters, route-aware sidebar highlighting including null pathname safety, class Settings routing, distinct revoked/expired status CSS, and snapshot-only credential detail wording and JSON download.

## Server, Client, Data, and Design Decisions

- Pages remain Server Components. After actor resolution, the class-issued page starts workspace, list, and Faculty options reads concurrently. The global list and detail call only authorized domain services.
- `IssueBadgeForm` remains the only issuance client component. It receives only active options, `classId`, and the authenticated server action; local selection state derives the confirmation and `useFormStatus` provides an accessible pending label. The shared SidebarContent client boundary uses `usePathname` solely for current-route presentation, with a safe null fallback.
- The detail page reads only `getIssuanceDetail` snapshots for credential-critical fields through the separately tested `CredentialDetail` presentation component. It renders the snapshot artwork path, achievement, recipient, issuer, IDs, dates, status, and authenticated JSON route. It explicitly says the credential is unsigned and Open Badges 3.0-aligned, not certified.
- List props use the authorized snapshot-derived `IssuanceListRecord`; CSV and JSON links remain protected server routes. UI visibility is not relied on for authorization.
- Shared `getClassTabs` keeps Students, Badges, Issued, and Settings consistent, including the new minimal class-scoped read-only Settings surface. Styles use the existing light tokens, status colors (including distinct red revoked and amber expired states), focus/caret treatment, responsive filter/action stacking, and overflow-safe identifiers.

## Commands and Results

- Focused review tests: pass, 12 tests.
- Scoped Prettier check after formatting: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass, 32 files and 137 tests.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build`: pass.

## Concerns

- `npm run format` remains non-zero solely because unrelated concurrent-work artifacts are not formatted: `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-1-review-package.md` and `task-2-brief.md`. Task 6 files pass scoped Prettier checking.
- An unconfigured production build fails configuration collection because `DATABASE_URL` is required by the existing app; it passes with the standard local MariaDB URL above.
- Full rendered Browser QA, Docker smoke, role-specific acceptance, and responsive visual verification are intentionally deferred to Task 7.
