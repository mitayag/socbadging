# Task 3 Report: Present Both Downloads in the Import Wizard

## Status

Implemented. The roster import wizard now presents downloadable CSV and XLSX starter templates before the existing file input. This supports FR-006 without changing the upload, column-mapping, validation-preview, or commit flows.

## Files Changed

- `src/components/rosters/import-wizard.tsx`
- `src/components/rosters/import-wizard.test.tsx`
- `src/app/globals.css`

## TDD Evidence

### RED

Created `ImportWizard` component coverage before implementation. The test rendered with `classId="class-123"` and failed because the exact guidance and the two accessible template links were absent:

`TestingLibraryElementError: Unable to find an element with the text: Start with a template, replace the example row with your students, then upload the completed file.`

### GREEN

Added a `.template-downloads` block above the file input with the exact required guidance and two same-tab anchors:

- `Download CSV Template` → `/api/classes/class-123/roster/import/template.csv`
- `Download XLSX Template` → `/api/classes/class-123/roster/import/template.xlsx`

The anchors use the existing `secondary-button export-link` classes and introduce no download state or event handlers.

## Responsive and Accessibility Decisions

- The new light-surface block uses `--accent-surface`, `--border`, and `--radius-panel`.
- Its actions use a wrapping flex layout; at the existing 820px breakpoint, each link can take the full available width, preventing horizontal overflow.
- Native anchors retain accessible link names and the existing global focus behavior. Neither link uses `target="_blank"`.
- The existing labeled file input and all import states remain untouched.

## Verification Results

- RED: `npm test -- src/components/rosters/import-wizard.test.tsx` — failed as expected before implementation.
- GREEN: `npm test -- src/components/rosters/import-wizard.test.tsx` — 1 test passed.
- `npm test -- src/components/rosters/import-wizard.test.tsx src/modules/rosters` — 4 files, 8 tests passed.
- `npx prettier --check src/components/rosters/import-wizard.tsx src/components/rosters/import-wizard.test.tsx src/app/globals.css` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — source compilation and build TypeScript passed, but final page-data collection failed because `DATABASE_URL` is not set for `/api/auth/login`.

## Final-Review Fix Evidence

Addressed the final review's sole P2 finding with an interaction-level `ImportWizard` regression test using Testing Library and `user-event`. The test now:

- uploads a realistic CSV `File` and proves the selected file remains attached;
- mocks the real inspect boundary and verifies automatic mapping for reordered headers;
- confirms the commit action is absent before `Validate Preview`;
- intercepts and prevents native navigation for both CSV and XLSX template anchors while exercising the mapping state and again after a successful preview;
- verifies the exact preview request retains the filename, rows, and mapping state;
- confirms the selected file, validated row, preview ID, and `Commit 1 Students` gate remain intact after both template clicks; and
- confirms downloads do not introduce extra fetches or alter the import flow.

Final-fix verification:

- `npm test -- src/components/rosters/import-wizard.test.tsx` — 1 file, 2 tests passed.
- Focused roster and template-route tests — 5 files, 17 tests passed.
- Full `npm test` — 20 files, 52 tests passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- Task test-file Prettier formatting was applied and rechecked as part of final verification.

No production component or stylesheet change was needed for the review fix; the existing plain-anchor behavior preserves the wizard's React state correctly.

## Concerns

- The repository-wide `npm run format` remains non-green due to pre-existing formatting differences in `.superpowers/sdd/2026-08-12-roster-import-template-download/progress.md` and `docs/superpowers/plans/2026-08-12-roster-import-template-download.md`; they are outside this task's permitted files. All Task 3 files are formatted.
- Production build completion requires a valid build-time `DATABASE_URL`; this is environmental and unrelated to the template-download UI change.
