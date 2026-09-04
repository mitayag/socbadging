# Task 1 Brief: Generate Import-Compatible CSV and XLSX Templates

## Context

The HAU SOC Badging System already imports CSV and XLSX rosters. This task adds the server-only generators that later protected routes will download. Follow `AGENTS.md` and strict TDD. Do not work on routes or UI.

## Files

- Modify `package.json`
- Modify `package-lock.json`
- Create `src/modules/rosters/services/roster-template.ts`
- Create `src/modules/rosters/services/roster-template.test.ts`

## Required Interfaces

- `ROSTER_TEMPLATE_HEADERS: readonly ["Student Number", "First Name", "Last Name", "Email"]`
- `buildRosterCsvTemplate(): Uint8Array`
- `buildRosterXlsxTemplate(): Promise<Uint8Array>`

Use the existing `quoteCsv` and `parseRosterFile` utilities.

## Requirements

1. Install `exceljs` as a production dependency with `npm install exceljs`.
2. Write generator tests before production code and run them to verify failure.
3. Both formats must parse through the real `parseRosterFile` function to these exact values:
   - headers: `Student Number`, `First Name`, `Last Name`, `Email`
   - example: `2026-00001`, `Juan`, `Dela Cruz`, `juan.delacruz@example.edu`
4. Add an ExcelJS read-back assertion proving row 1 is frozen, cells are plain values, and no cell contains a formula value.
5. CSV begins with the UTF-8 byte-order mark, uses `quoteCsv`, joins rows with CRLF, and returns `TextEncoder` bytes.
6. XLSX has one `Students` worksheet, freezes row 1, uses bold navy header text on an accent surface, sets readable widths near 20/20/24/34, contains no formulas/macros/external links/embedded objects, and returns `Uint8Array` bytes.
7. Keep the module server-only and focused.
8. Run the focused tests to green and self-review.

## Report

Write the full report to `.superpowers/sdd/2026-08-12-roster-import-template-download/task-1-report.md`. Include status (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`), files changed, RED/GREEN evidence, test results, and concerns. Return only the status, a one-line test summary, and concerns to the controller. Git commits are unavailable in this workspace.
