# Task 1 Review: Roster Import Template Download

## Verdicts

- **Specification verdict: BLOCKED.** The implementation satisfies the generator requirements by source inspection and focused execution, but it fails the stated zero-vulnerability completion gate. `npm audit --json` reports two moderate production vulnerabilities: direct `exceljs@4.4.0` is affected through `uuid@8.3.2` (GHSA-w5hq-g745-h8pq). The report's `DONE_WITH_CONCERNS` status correctly identifies this; it is load-bearing rather than an informational warning when the final audit must pass.
- **Code-quality verdict: PASS WITH A REQUIRED DEPENDENCY REMEDIATION.** The production module is small, typed, server-only, and limited to the requested generators. CSV and XLSX behavior is direct, readable, and covered by meaningful parse/read-back tests. No unrelated application code, routes, or UI were added.

## What Was Verified

- `ROSTER_TEMPLATE_HEADERS` is the exact readonly ordered tuple required by the brief.
- The CSV generator uses the existing `quoteCsv`, joins the header and fictional student with CRLF, prefixes a UTF-8 BOM, and returns `TextEncoder` bytes.
- The XLSX generator creates exactly one `Students` worksheet, freezes its first row, writes plain string values, applies bold `#163A63` text on `#EAF2FF`, and uses the requested 20/20/24/34 widths. A newly created ExcelJS workbook does not introduce formulas, macros, external links, or embedded objects.
- The focused suite passes: `npm test -- src/modules/rosters/services/roster-template.test.ts` (1 file, 3 tests). It parses both generated files through the real `parseRosterFile` and reloads the XLSX to verify one sheet, row-1 freezing, plain values, and no formula values.
- `npm run typecheck` passes.
- Strict TDD sequence cannot be independently reconstructed because the review package reports no Git metadata. The provided RED/GREEN evidence is internally consistent: the test was reportedly added first and failed on the absent module before the implementation was created.

## Findings (severity-ranked)

### P0 — ExcelJS leaves the dependency audit failing

**Evidence.** `package.json` adds production dependency `exceljs@^4.4.0`; its lockfile dependency is `uuid@^8.3.0`, resolved as `uuid@8.3.2`. Fresh `npm audit --json` reports two moderate findings, with the underlying advisory applying to `uuid <11.1.1`. The completion gate requires the dependency audit to pass, so this task cannot be accepted until this is resolved.

**Narrowest safe fix.** Retain the required `exceljs@4.4.0`, and add a scoped npm override that resolves only ExcelJS's transitive UUID to the minimum fixed version:

```json
"overrides": {
  "exceljs": {
    "uuid": "11.1.1"
  }
}
```

Regenerate the lockfile with `npm install`, then run the focused test, the full prescribed validation set, and `npm audit --json`. This is compatible with the code ExcelJS uses here: its only `uuid` import is `const { v4: uuidv4 } = require("uuid")`, and UUID 11 exposes `v4` through its CommonJS export on the project's supported Node 22 runtime. Do not use the audit-proposed downgrade to `exceljs@3.4.0` without separate compatibility testing; it is a major-version regression and is broader risk than the scoped override.

### P2 — Workbook presentation settings are unguarded by read-back tests

**Evidence.** The XLSX test reads back freeze panes, values, formulas, and sheet count, but does not assert the required header fill/font or column widths. The implementation currently sets them correctly, so this is a regression-detection gap, not a current specification failure.

**Fix.** Extend the existing ExcelJS read-back test to assert the four widths and row-1 bold/font/fill ARGB values. This keeps all workbook requirements executable rather than depending on manual inspection.

## Required Revalidation After the P0 Fix

Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --json`, and `npm run build`; document any environment-only blocker with its precise command output. Re-run the focused generator test after adding the style assertions.
