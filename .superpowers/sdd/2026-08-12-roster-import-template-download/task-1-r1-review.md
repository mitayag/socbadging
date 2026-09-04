# Task 1 Fix Round 1 Re-Review: Roster Import Template Download

## Verdict

**RESOLVED.** Both findings from `task-1-review.md` are fully remediated, with the focused generator behavior preserved.

## Scope Verified

### P0 — ExcelJS dependency audit

- `package.json` contains the narrow override `exceljs.uuid = 11.1.1` while retaining the required production dependency `exceljs@^4.4.0`.
- `package-lock.json` resolves the hoisted `uuid` package to `11.1.1`; `npm ls exceljs uuid --all` reports `exceljs@4.4.0 overridden -> uuid@11.1.1 overridden`.
- A live `npm audit --json` completed successfully with **0 vulnerabilities** (0 info, low, moderate, high, and critical).

**Finding status: resolved.** The prior vulnerable UUID resolution is no longer present, and the override remains appropriately scoped to ExcelJS.

### P2 — XLSX presentation read-back coverage

- `roster-template.test.ts` reloads the generated workbook with ExcelJS and asserts the exact ordered widths `[20, 20, 24, 34]`.
- It iterates over each row-1 cell and asserts `bold: true`, header font color `FF163A63`, and solid foreground fill `FFEAF2FF`.
- Existing assertions remain in place for parser compatibility, a single `Students` sheet, frozen row 1, plain string values, and absence of formulas.
- `npm test -- src/modules/rosters/services/roster-template.test.ts` passes: **1 file, 3 tests**. `npm run typecheck` also passes.

**Finding status: resolved.** The required workbook presentation settings are now executable read-back assertions without weakening existing behavior checks.

## Regression Assessment

No regression was observed within the requested scope. The scoped dependency change leaves ExcelJS at 4.4.0, and all focused generator tests plus type checking pass.
