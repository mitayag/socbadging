# Task 3 Brief: Present Both Downloads in the Import Wizard

## Context

Protected CSV and XLSX routes now exist at the class-scoped URLs below. Add their presentation to the existing `ImportWizard` without changing upload, mapping, preview, validation, or commit behavior. Follow `AGENTS.md`, the modern light tokens, Title Case, React best practices, and strict TDD.

## Files

- Modify `src/components/rosters/import-wizard.tsx`
- Create `src/components/rosters/import-wizard.test.tsx`
- Modify `src/app/globals.css`

## Required Behavior

1. Write the component test first and verify RED because the links/guidance are absent.
2. Render `ImportWizard` with `classId="class-123"` and assert accessible links:
   - `Download CSV Template` → `/api/classes/class-123/roster/import/template.csv`
   - `Download XLSX Template` → `/api/classes/class-123/roster/import/template.xlsx`
3. Assert the exact guidance sentence is visible: `Start with a template, replace the example row with your students, then upload the completed file.`
4. Place a `.template-downloads` light-surface block above the current file input.
5. Use existing `secondary-button export-link` classes on both anchors. Do not use `target="_blank"` and do not add client state or event handlers for downloads.
6. Style with existing `--accent-surface`, `--border`, and radius tokens. Use grid spacing and flex-wrapped `.template-download-actions`. At the existing mobile breakpoint, links may occupy full width; no horizontal overflow.
7. Preserve visible global focus behavior and every current import wizard behavior.
8. Run the new component test and existing roster/module tests, lint, and typecheck to green.

## Report

Write the full report to `.superpowers/sdd/2026-08-12-roster-import-template-download/task-3-report.md`. Include status, files changed, RED/GREEN evidence, responsive/accessibility decisions, test results, and concerns. Return only status, a one-line test summary, and concerns. Git commits are unavailable.
