# Task 6 Independent Review

## Verdicts

- **Spec compliance: Changes requested.** The Server/Client boundary, Faculty/Admin presentation split, minimal wizard props, parallel page reads, partial-valid confirmation, role-scoped history/results, responsive stacking, and reduced-motion styling are present. However, the required zero-ready disabled commit state is absent, and the preview/result grids do not expose usable table headers or cell semantics.
- **Code quality: Changes requested.** The implementation is compact and typed, but asynchronous inspection/preview responses can restore stale state after the selected file or badge changes. The focused tests pass but omit the zero-ready state, the in-flight reset race, file-change reset, and table semantics.

## Critical Findings

None.

## Important Findings

### 1. Zero-ready previews omit the commit control instead of rendering the required disabled commit state

The Task 6 brief explicitly requires a “zero-ready disabled commit” state (`task-6-brief.md:19`), and the plan requires a test for it (`docs/superpowers/plans/2026-08-14-phase-5-batch-issuance.md:268`). In the implementation, `preview.readyCount === 0` renders only an error paragraph; the form and `CommitButton` exist solely in the nonzero branch (`src/components/issuance/batch-issuance-wizard.tsx:283-305`). This prevents the UI from demonstrating that commit is unavailable in that reviewed state and leaves the named acceptance behavior unimplemented. The wizard tests only construct `readyCount: 1` (`src/components/issuance/batch-issuance-wizard.test.tsx:58`) and therefore do not cover the required case.

### 2. Changing badge/file during an in-flight request can repopulate stale reviewed state

Badge/file changes call `resetReviewedState()` (`src/components/issuance/batch-issuance-wizard.tsx:167-170`, `185-188`), but neither selector is disabled while a request is pending, and the request has no abort token or request-version guard. Consequently, an older inspection can resolve after reset and call `setInspection(result)` (`src/components/issuance/batch-issuance-wizard.tsx:79-91`), or an older preview can resolve and call `setPreview(result)` (`src/components/issuance/batch-issuance-wizard.tsx:120-123`). The displayed selected badge/file can then disagree with the restored inspection/preview. Server commit binding remains safe because only the stored batch ID is submitted, but the mandatory “reset when file/badge changes” UX is violated and a user can unknowingly confirm a preview for the prior choice. The existing pending/reset test waits for the failed request before changing the badge (`src/components/issuance/batch-issuance-wizard.test.tsx:153-163`), so it does not exercise this race or file-change reset.

### 3. Preview and result grids lack accessible table headers/cell relationships

Both grids declare `role="table"`, but their children contain only `role="row"` plus plain `span`/`strong` elements (`src/components/issuance/batch-issuance-wizard.tsx:267-280`; `src/components/issuance/batch-result.tsx:48-72`). There is no header row, `role="columnheader"`, or `role="cell"`. The `data-label` text becomes visible only through CSS-generated `::before` content at the mobile breakpoint (`src/app/globals.css:1202-1213`), which does not establish table semantics and is not a reliable accessible name/relationship for assistive technology. This falls short of the brief’s semantic-label/accessibility requirement (`task-6-brief.md:21`) and the design requirement that controls/table presentation be accessible (`docs/superpowers/specs/2026-08-14-phase-5-batch-issuance-design.md:131`). The component tests assert content and links but never roles/headers (`src/components/issuance/batch-issuance-wizard.test.tsx:119-132`; `src/components/issuance/batch-result.test.tsx:48-60`).

## Minor Findings

### 1. The inferred Email header index is dead code

Inspection calculates `emailIndex` and then sets Email to the empty “Do Not Map” value regardless of whether the header exists (`src/components/issuance/batch-issuance-wizard.tsx:88-91`). The default itself matches the approved workflow, but the unused inference obscures intent and should be removed or used deliberately.

### 2. Task report overstates its focused test count

The report says the green focused/navigation run covered “5 files, 12 tests” and separately says the role gate had 2 tests (`task-6-report.md:34`), while the four named Task 6 component suites currently contain seven tests total and the fresh focused run below confirms 4 files/7 tests. If the 5-file/12-test statement refers to additional navigation tests, the exact command/files should be recorded to make the evidence auditable.

## Confirmed Compliant Areas

- The class Issued page remains a Server Component and begins workspace, issuance, option, and history reads together after actor resolution (`src/app/classes/[classId]/issued/page.tsx:52-62`).
- Only badge IDs/names are serialized into the Client wizard (`src/app/classes/[classId]/issued/page.tsx:100-105`), while batch result/history remain Server Component data.
- Administrator mutation controls are suppressed (`src/components/issuance/batch-issuance-section.tsx:16`), while authorized history/result presentation remains available.
- Partial-valid commits require an explicit checkbox and show the exact ready count (`src/components/issuance/batch-issuance-wizard.tsx:286-304`).
- Mobile rows stack with visible field labels and overflow wrapping (`src/app/globals.css:1191-1213`); reduced motion is respected (`src/app/globals.css:1220-1228`).
- No Phase 6 functionality was added in the reviewed Task 6 files.

## Verification Evidence

- `npm test -- src/components/issuance/batch-issuance-wizard.test.tsx src/components/issuance/batch-issuance-section.test.tsx src/components/issuance/batch-history.test.tsx src/components/issuance/batch-result.test.tsx` — **passed: 4 files, 7 tests**.
- `npm run typecheck` — **passed** (`tsc --noEmit`, exit 0).

## Task 7 Boundary

Task 7 browser/Docker acceptance was **not implemented or performed**. The SDD directory contains Task 6 artifacts only, with no Task 7 brief/report/evidence, and `task-6-report.md:44` explicitly records that Task 7 browser and Docker acceptance were intentionally not run. This review did not perform browser or Docker acceptance.

## Final Re-Review

### Verdicts

- **Spec compliance: Approved.** All Important findings from the initial review are resolved. The required zero-ready state now presents a disabled exact-count commit control; badge/file changes invalidate both in-flight inspection and preview responses; preview and result tables expose real column-header/cell roles; and desktop/mobile table presentation matches the Task 6 requirements.
- **Code quality: Approved.** Request-version handling is applied consistently to success, error, and pending cleanup paths; focused regression tests cover both stale-request directions and the zero-ready state; the dead Email-header inference is removed; and the report now records unambiguous commands and test counts.

### Critical Findings

None.

### Important Findings

None.

### Minor Findings

None.

### Resolution Evidence

- Zero-ready preview renders `Issue 0 Credentials` as a disabled button (`src/components/issuance/batch-issuance-wizard.tsx:308-314`), covered by the zero-ready test (`src/components/issuance/batch-issuance-wizard.test.tsx:245-304`).
- `requestVersion` is incremented by reset and captured by inspection/preview requests; stale success, error, and `finally` updates are ignored (`src/components/issuance/batch-issuance-wizard.tsx:54-65`, `71-100`, `108-136`). Tests cover changing the badge during inspection and changing the file during preview (`src/components/issuance/batch-issuance-wizard.test.tsx:174-202`, `204-243`).
- Preview and result grids now contain explicit `role="columnheader"` and `role="cell"` elements (`src/components/issuance/batch-issuance-wizard.tsx:276-305`; `src/components/issuance/batch-result.tsx:48-86`). Desktop headers are styled at `src/app/globals.css:996-1003`, and the redundant header row is hidden in the stacked mobile presentation at `src/app/globals.css:1210-1212`. Tests assert the header and cell roles (`src/components/issuance/batch-issuance-wizard.test.tsx:133-140`; `src/components/issuance/batch-result.test.tsx:61-68`).
- The unused `emailIndex` inference is gone; Email deliberately remains at the approved `Do Not Map` default (`src/components/issuance/batch-issuance-wizard.tsx:87-94`).
- Report evidence now distinguishes the original 5-file/12-test navigation run, 1-file/2-test role run, and 2-file/7-test review regression run (`task-6-report.md:34-37`), and records the updated full-suite total of 291 tests (`task-6-report.md:44`).

### Fresh Verification

- `npm test -- src/components/issuance/batch-issuance-wizard.test.tsx src/components/issuance/batch-issuance-section.test.tsx src/components/issuance/batch-history.test.tsx src/components/issuance/batch-result.test.tsx` — **passed: 4 files, 10 tests**.
- `npm run typecheck` — **passed** (`tsc --noEmit`, exit 0).

Task 7 browser/Docker acceptance remains outside Task 6 and was not implemented or performed during this re-review (`task-6-report.md:47`).
