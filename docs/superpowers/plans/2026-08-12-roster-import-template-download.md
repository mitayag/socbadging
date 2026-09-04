# Roster Import Template Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owning Faculty member download import-ready CSV and XLSX student roster templates from the class roster import panel.

**Architecture:** A server-only template generator owns one canonical header/example schema and emits either CSV or XLSX bytes. Two class-scoped Next.js route handlers authenticate the requester, enforce the Faculty role and existing class-ownership policy, then return attachment responses; the existing import wizard presents accessible links and keeps all import state client-side.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 6, ExcelJS, Vitest, Testing Library, Docker Compose

## Global Constraints

- Map work to FR-002, FR-004, FR-005, and FR-006.
- Only the owning Faculty member may download either template; UI visibility is not authorization.
- Both formats use `Student Number`, `First Name`, `Last Name`, `Email` in that exact order.
- Both formats include one fictional example row and no real student data.
- XLSX contains values only: no formulas, macros, external links, or embedded objects.
- The existing preview-before-commit import workflow must remain unchanged.
- No database migration or audit event is required because template download reads no roster data and changes no state.
- Preserve Title Case labels, the modern light design tokens, responsive wrapping, and visible keyboard focus.
- Follow strict test-driven development and run every required verification before claiming completion.

---

## File Structure

- `package.json` and `package-lock.json` — add the server-side ExcelJS workbook writer.
- `src/modules/rosters/services/roster-template.ts` — canonical headers/example row and CSV/XLSX generation.
- `src/modules/rosters/services/roster-template.test.ts` — generator compatibility and safety tests.
- `src/app/api/classes/[classId]/roster/import/template.csv/route.ts` — protected CSV attachment response.
- `src/app/api/classes/[classId]/roster/import/template.xlsx/route.ts` — protected XLSX attachment response.
- `src/app/api/classes/[classId]/roster/import/template-routes.test.ts` — authentication, role, ownership, MIME type, and filename tests for both routes.
- `src/components/rosters/import-wizard.tsx` — instruction block and download links.
- `src/components/rosters/import-wizard.test.tsx` — accessible class-scoped link coverage.
- `src/app/globals.css` — responsive light-surface template-help layout.

### Task 1: Generate Import-Compatible CSV and XLSX Templates

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/rosters/services/roster-template.ts`
- Create: `src/modules/rosters/services/roster-template.test.ts`

**Interfaces:**

- Produces: `ROSTER_TEMPLATE_HEADERS: readonly ["Student Number", "First Name", "Last Name", "Email"]`.
- Produces: `buildRosterCsvTemplate(): Uint8Array`.
- Produces: `buildRosterXlsxTemplate(): Promise<Uint8Array>`.
- Consumes: existing `quoteCsv` and `parseRosterFile` utilities.

- [ ] **Step 1: Install the maintained workbook writer**

Run:

```bash
npm install exceljs
```

Expected: `exceljs` is recorded in dependencies and the lockfile resolves without install errors.

- [ ] **Step 2: Write failing generator compatibility tests**

Create tests that call the wished-for APIs, wrap each output in a `File`, and feed it through the real importer:

```ts
const expectedHeaders = ["Student Number", "First Name", "Last Name", "Email"];

it("builds a CSV template accepted by the roster parser", async () => {
  const bytes = buildRosterCsvTemplate();
  const parsed = await parseRosterFile(new File([bytes], "roster-import-template.csv"));
  expect(parsed.headers).toEqual(expectedHeaders);
  expect(parsed.rows).toEqual([["2026-00001", "Juan", "Dela Cruz", "juan.delacruz@example.edu"]]);
});

it("builds an XLSX template accepted by the roster parser", async () => {
  const bytes = await buildRosterXlsxTemplate();
  const parsed = await parseRosterFile(new File([bytes], "roster-import-template.xlsx"));
  expect(parsed.headers).toEqual(expectedHeaders);
  expect(parsed.rows).toEqual([["2026-00001", "Juan", "Dela Cruz", "juan.delacruz@example.edu"]]);
});
```

Add an ExcelJS read-back assertion proving worksheet cells are plain values, row 1 is frozen, and the workbook contains no formula values.

- [ ] **Step 3: Run the generator test and verify RED**

Run:

```bash
npm test -- src/modules/rosters/services/roster-template.test.ts
```

Expected: FAIL because `roster-template.ts` does not exist.

- [ ] **Step 4: Implement the shared generator**

Create a server-only module with the exact constants and functions. CSV output begins with `\uFEFF`, uses `quoteCsv`, joins rows with `\r\n`, and returns `new TextEncoder().encode(csv)`. XLSX uses one worksheet named `Students`, adds the header/example rows as values, freezes the first row, applies bold navy header text on an accent surface, sets widths of approximately 20/20/24/34, and returns `new Uint8Array(await workbook.xlsx.writeBuffer())`.

- [ ] **Step 5: Run the generator tests and verify GREEN**

Run:

```bash
npm test -- src/modules/rosters/services/roster-template.test.ts
```

Expected: both formats parse through the existing importer and all generator tests pass.

### Task 2: Add Protected Class-Scoped Download Routes

**Files:**

- Create: `src/app/api/classes/[classId]/roster/import/template.csv/route.ts`
- Create: `src/app/api/classes/[classId]/roster/import/template.xlsx/route.ts`
- Create: `src/app/api/classes/[classId]/roster/import/template-routes.test.ts`

**Interfaces:**

- Consumes: `getCurrentActor()`, `requireRole(actor, "FACULTY")`, `getClassWorkspace(actor, classId)`, and both generator functions.
- Produces: two `GET(request, { params })` handlers returning attachments or safe JSON errors.

- [ ] **Step 1: Write failing route authorization and response tests**

Mock only current-actor lookup and class-workspace persistence. Exercise the real authorization policy and real generators. For each format, assert:

```ts
expect(response.status).toBe(200);
expect(response.headers.get("content-disposition")).toBe(
  'attachment; filename="roster-import-template.csv"',
);
expect(response.headers.get("content-type")).toContain("text/csv");
expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
```

Use the corresponding XLSX filename/MIME type. Add unauthenticated, Administrator, and non-owner cases that assert a non-success status and no generated attachment header.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
npm test -- 'src/app/api/classes/[classId]/roster/import/template-routes.test.ts'
```

Expected: FAIL because both route modules are missing.

- [ ] **Step 3: Implement both route handlers**

The CSV handler follows this sequence:

```ts
const actor = requireRole(await getCurrentActor(), "FACULTY");
const classId = (await params).classId;
await getClassWorkspace(actor, classId);
const body = buildRosterCsvTemplate();
return new NextResponse(body, {
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="roster-import-template.csv"',
    "Cache-Control": "private, no-store",
  },
});
```

The XLSX handler uses the same authorization sequence and returns `await buildRosterXlsxTemplate()` with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `attachment; filename="roster-import-template.xlsx"`.

Catch failures and return `{ error: "Forbidden" }` with status `403`, matching the repository's protected download pattern and avoiding ownership disclosure.

- [ ] **Step 4: Run route tests and verify GREEN**

Run:

```bash
npm test -- 'src/app/api/classes/[classId]/roster/import/template-routes.test.ts'
```

Expected: owning Faculty succeeds for both formats; all denial cases pass.

### Task 3: Present Both Template Downloads in the Import Wizard

**Files:**

- Modify: `src/components/rosters/import-wizard.tsx`
- Create: `src/components/rosters/import-wizard.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: existing `ImportWizard({ classId, commitAction })` props.
- Produces: links to `/api/classes/${classId}/roster/import/template.csv` and `/api/classes/${classId}/roster/import/template.xlsx`.

- [ ] **Step 1: Write the failing accessible rendering test**

Render `ImportWizard` with `classId="class-123"` and assert:

```ts
expect(screen.getByRole("link", { name: "Download CSV Template" })).toHaveAttribute(
  "href",
  "/api/classes/class-123/roster/import/template.csv",
);
expect(screen.getByRole("link", { name: "Download XLSX Template" })).toHaveAttribute(
  "href",
  "/api/classes/class-123/roster/import/template.xlsx",
);
expect(screen.getByText(/replace the example row with your students/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/components/rosters/import-wizard.test.tsx
```

Expected: FAIL because the links and guidance are absent.

- [ ] **Step 3: Add the instruction block and links**

Place a `.template-downloads` block above the file input. Include the approved sentence and two anchor elements using existing `secondary-button export-link` classes. Do not add `target="_blank"` or mutate the wizard's file, mapping, preview, or error state.

- [ ] **Step 4: Add responsive modern-light styling**

Use the existing accent-surface and border tokens. The block uses grid spacing, the actions use flex wrapping, and links remain full-width only at the existing mobile breakpoint. Preserve visible `:focus-visible` behavior.

- [ ] **Step 5: Run component and existing roster tests**

Run:

```bash
npm test -- src/components/rosters/import-wizard.test.tsx src/modules/rosters
```

Expected: new UI coverage and all existing roster import/authorization tests pass.

### Task 4: Full Verification and Download Smoke Testing

**Files:**

- Modify only if verification exposes a defect: files listed in Tasks 1–3.

**Interfaces:**

- Consumes: completed generators, routes, and UI.
- Produces: completion evidence for FR-002, FR-004, FR-005, and FR-006.

- [ ] **Step 1: Run the complete local quality gate**

Run:

```bash
npm run format:write
npm run format
npm run lint
npm run typecheck
npm run test
npm audit
DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build
```

Expected: every command exits 0 with no test failures, type errors, lint warnings, audit vulnerabilities, or build errors.

- [ ] **Step 2: Rebuild and smoke-test Docker**

Run the documented Docker Compose environment with `docker compose up --build -d --wait`, then verify `docker compose ps`, `GET /api/health`, migration logs, and web logs.

Expected: database and web services are healthy, migrations remain current, and no application errors appear.

- [ ] **Step 3: Perform browser download QA as owning Faculty**

At desktop width, sign in with an active Faculty test account, open an owned class's Students tab, expand **Import CSV or XLSX**, and download both links. Verify the filenames are `roster-import-template.csv` and `roster-import-template.xlsx`, both files are non-empty, the page remains on the Students tab, and there are no console/framework errors.

- [ ] **Step 4: Perform authorization smoke checks**

Request both download URLs while signed out and while signed in as Administrator. Verify neither response returns a downloadable template. Use a second Faculty account or automated route test fixture to confirm a non-owner is also denied.

- [ ] **Step 5: Perform mobile responsive QA**

At a 390×844 viewport, verify the guidance is readable, both download buttons wrap without horizontal overflow, keyboard focus remains visible, and the existing upload/preview controls remain usable.

- [ ] **Step 6: Report exact changes and evidence**

List every created/modified file, the installed dependency, all verification results, browser-tested download filenames/sizes, requirements satisfied, and any remaining limitation. Do not claim completion unless every gate passes.
