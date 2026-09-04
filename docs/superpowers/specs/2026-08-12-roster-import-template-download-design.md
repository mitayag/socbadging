# Roster Import Template Download Design

**Date:** 2026-08-12  
**Status:** Approved design, pending written-spec review  
**Requirements:** FR-002, FR-004, FR-005, FR-006; responsive and accessibility requirements from Sections 9–11

## Goal

Let Faculty download ready-to-use CSV and XLSX roster templates from an owned class, reducing formatting errors before roster import.

## Scope

Add two download actions inside the existing **Import CSV or XLSX** panel:

- **Download CSV Template**
- **Download XLSX Template**

Both templates contain these columns in this exact order:

1. `Student Number`
2. `First Name`
3. `Last Name`
4. `Email`

Each template includes one clearly fictional example row that Faculty may replace or remove. The XLSX version has a styled header row, a frozen header row, readable column widths, and no formulas or macros.

This change does not modify import preview, validation, duplicate detection, or commit behavior. It does not change the database schema and does not create an audit record because downloading an empty instructional template neither reads roster data nor changes system state.

## Architecture

Create one shared roster-template module that owns the canonical headers and produces CSV or XLSX bytes. The existing import mapper already recognizes the proposed header names, so downloaded files work without manual remapping unless Faculty edits the headers.

Expose two class-scoped route handlers:

- `GET /api/classes/[classId]/roster/import/template.csv`
- `GET /api/classes/[classId]/roster/import/template.xlsx`

Each route obtains the authenticated actor and calls the existing class-ownership authorization boundary before generating content. Only the owning Faculty member may download a template. Administrators and other Faculty receive the existing authorization-safe error response. UI visibility is not treated as authorization.

The CSV route returns UTF-8 content with a byte-order mark for spreadsheet compatibility, RFC 4180-style quoting, `text/csv; charset=utf-8`, and an attachment filename such as `roster-import-template.csv`.

The XLSX route returns a valid Office Open XML workbook with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `roster-import-template.xlsx`. Use a maintained workbook-writing library rather than hand-building ZIP/XML structures. The dependency is used only in the server-side template generator and must not enter the client bundle.

## Components and Responsibilities

- `roster-template.ts` owns headers, the fictional example row, CSV serialization, and XLSX workbook generation.
- Each route handler owns authentication, class ID extraction, authorization-safe HTTP responses, and download headers.
- `ImportWizard` owns presentation of the two download links and the short instruction text. It receives or derives the current `classId` but contains no authorization logic.
- Existing roster authorization and importer modules remain the authoritative ownership and file-validation boundaries.

## User Experience

Inside **Import CSV or XLSX**, show a small light-surface instruction block above the file picker:

> Start with a template, replace the example row with your students, then upload the completed file.

Place the CSV and XLSX download links side by side on wider screens and allow them to wrap vertically on mobile. Use the existing secondary-button styling and visible keyboard focus states. Keep all labels in the approved Title Case style.

Downloads open no new page and leave any current import state intact.

## Error Handling and Security

- Missing authentication returns the application's standard unauthenticated response.
- Administrators and non-owning Faculty are rejected server-side before template generation.
- Missing classes use the existing safe not-found behavior without leaking ownership information.
- Generated example data is fictional and contains no real student information.
- CSV cells pass through the existing spreadsheet-sanitization convention so example content cannot be interpreted as a formula.
- XLSX output contains values only, with no formulas, macros, external links, or embedded objects.

## Testing

Follow test-driven development. Automated tests must prove:

- the shared schema emits the exact four headers in the correct order;
- CSV output parses successfully through the existing roster parser;
- XLSX output parses successfully through the existing roster parser;
- content-disposition filenames and MIME types are correct;
- an owning Faculty actor can download each format;
- Administrators, unauthenticated requests, and non-owning Faculty cannot download either format;
- the import UI renders both accessible download links with the correct class-scoped URLs;
- existing preview-before-commit behavior remains unchanged.

Before completion, run formatting, lint, type checking, all automated tests, dependency audit, the production build, Docker smoke testing, and desktop/mobile browser checks. Browser QA must download both files and verify they are non-empty with the expected filenames while confirming no console or framework errors.

## Assumptions

- A single generic template serves every class; class scoping exists for authorization and contextual UX, not class-specific content.
- Both files include one fictional example row because it makes expected values clearer than an empty header-only file.
- Template downloads are not audit-worthy sensitive actions under FR-020 because they access no student data and change no state.
- Import limits remain 2 MiB and 5,000 data rows as currently implemented.
