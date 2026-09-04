# Task 4 Report: Full Verification and Download Smoke Testing

## Status

**Verified.** The complete local quality gate, Docker gate, owning-Faculty downloads, live signed-out/Administrator denials, and desktop/mobile browser checks passed. One responsive overflow defect found during mobile QA was fixed at its grid-layout root cause and reverified.

## Requirement Coverage

- **FR-002 RBAC:** Automated coverage passed for unauthenticated, Administrator, and non-owning Faculty denial for both CSV and XLSX routes. Live signed-out and Administrator requests also returned safe 403 JSON responses without attachment headers.
- **FR-005 Roster / FR-006 Roster Import:** The owning Faculty downloaded both starter templates from an owned class's Students tab; both files were non-empty and the route stayed on Students.
- **Responsive/accessibility non-functional requirements:** Desktop and 390×844 mobile labels, guidance, native file control, disabled upload state, stacked links, focus behavior, and horizontal sizing were verified.

## Local Quality Gate

Commands were run in the required order on 2026-08-12 (Asia/Manila):

| Command                                                                     | Result        | Evidence                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run format:write`                                                      | PASS (exit 0) | Prettier completed; it formatted `.superpowers/.../progress.md` and `docs/superpowers/plans/2026-08-12-roster-import-template-download.md`; source files were unchanged. |
| `npm run format`                                                            | PASS (exit 0) | `All matched files use Prettier code style!`                                                                                                                             |
| `npm run lint`                                                              | PASS (exit 0) | `eslint . --max-warnings=0`, no findings.                                                                                                                                |
| `npm run typecheck`                                                         | PASS (exit 0) | `tsc --noEmit`, no errors.                                                                                                                                               |
| `npm run test`                                                              | PASS (exit 0) | **20 test files passed; 51 tests passed; 0 failed** in 2.80s.                                                                                                            |
| `npm audit`                                                                 | PASS (exit 0) | **0 vulnerabilities**.                                                                                                                                                   |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build` | PASS (exit 0) | Next.js 16.3.0 production build compiled, typechecked, generated 6/6 static pages, and listed both template routes.                                                      |

The full suite includes eight route tests that assert owning-Faculty success plus unauthenticated, Administrator, and non-owner Faculty denial for CSV and XLSX. All denial assertions require status 403 and no `Content-Disposition` attachment header.

## Docker Gate

The documented stack was rebuilt with the existing smoke variables using `docker compose up --build -d --wait`; the command exited 0.

- `db`: `Up ... (healthy)`.
- `web`: `Up ... (healthy)`, mapped to host port 3000.
- `GET http://127.0.0.1:3000/api/health`: **HTTP 200** with `{"status":"ok","service":"hau-soc-badging-system"}`.
- Migration log: Prisma found **5 migrations** and reported **`No pending migrations to apply.`**
- Web log: Next.js 16.3.0 reported `Ready` with no application failure.
- No schema change was present or expected.

Compose emitted warnings during a later log-only invocation because environment variables were scoped to the first shell segment; the already-running containers retained the correct variables and were healthy. The migration and web application logs themselves contained no failure.

## Browser Gate

### Environment

- Browser path: Codex in-app Browser (used first as required).
- App origin used for authenticated interaction: `http://localhost:3000`.
- Desktop viewport: **1280×720**; document width equaled viewport width (1280px).
- Owned class discovered through visible UI: `CS-P2 · Phase 2 Architecture`, section `A`.
- Students URL: `http://localhost:3000/classes/cmsop628a000601pf895dsy4p/students`.
- Screenshot: `/private/tmp/roster-template-desktop.png` (57,672 bytes).

### Owning-Faculty Flow

1. Signed in through the rendered login form as the authorized Faculty test account.
2. Opened **Classes**, expanded the visible owned class, and opened its roster.
3. Confirmed page identity: title `HAU SOC Badging System`; URL ended in `/students`.
4. Expanded **Import CSV or XLSX**.
5. DOM evidence showed the exact guidance, both accessible download links, the labeled `Roster CSV or XLSX` file control, and the disabled `Upload and Map` control before file selection.
6. Downloaded both files through Browser download events:

| Format | Suggested/saved filename      |        Size | Result |
| ------ | ----------------------------- | ----------: | ------ |
| CSV    | `roster-import-template.csv`  |   113 bytes | PASS   |
| XLSX   | `roster-import-template.xlsx` | 6,708 bytes | PASS   |

After both downloads, the URL remained exactly on the Students page. Browser console warnings/errors were empty. DOM and screenshot showed meaningful app content and no Next.js/framework overlay.

### Authorization Checks

- **Non-owner Faculty:** PASS via automated route coverage for both formats (403, no attachment).
- **Signed out:** PASS live. CSV and XLSX returned HTTP 403, `application/json`, and no attachment header.
- **Administrator:** PASS live. After successful Administrator authentication, CSV and XLSX returned HTTP 403, `application/json`, and no attachment header.

### Mobile Check

**PASS after one fix.** At 390×844, guidance is readable, the two 298.5 px download links stack inside the viewport, the file input remains available, and `Upload and Map` remains correctly disabled before selection. The final document width equals the viewport width (390 px) and the console is clean. Screenshot: `/private/tmp/roster-template-mobile.png` (37,280 bytes).

## Defects and Environment Notes

- Mobile QA identified a source defect in the workspace grid's intrinsic implicit column. The focused CSS fix adds `grid-template-columns: minmax(0, 1fr)` to `.workspace-page`; the same 390×844 measurement changed from 400 px document width to 390 px with no horizontal overflow.
- The persistent smoke database contained active Faculty and Administrator accounts whose password hashes no longer matched the authorized test credentials. Only those two disposable local test accounts were reset to the supplied/known smoke passwords. A follow-up verification inside the tools container confirmed both hashes matched and both accounts remained active.
- The first login retry used `127.0.0.1` while Compose configured `APP_URL=http://localhost:3000`; origin protection correctly rejected it. Browser testing then used the configured `localhost` origin and authentication succeeded.
- Browser viewport overrides were reset and the final Students tab was retained as the deliverable page.

## Evidence Files

- Desktop screenshot: `/private/tmp/roster-template-desktop.png`
- Mobile screenshot: `/private/tmp/roster-template-mobile.png`
- Browser downloads: `/Users/marlontayag/Downloads/roster-import-template.csv` and `/Users/marlontayag/Downloads/roster-import-template.xlsx`

These are outside committed source. The downloaded artifacts are local verification outputs and may be removed manually when no longer needed.

## Remaining Risk

Only the in-app Browser path was exercised; cross-browser coverage was not requested. No completion blocker remains.

## Controller Completion Addendum

The controller completed the interrupted gates and resolved one responsive defect using the systematic-debugging and TDD workflows.

- Live signed-out CSV and XLSX requests each returned HTTP 403 with `application/json` and no `Content-Disposition` header.
- The Administrator test account authenticated successfully; live CSV and XLSX requests each returned HTTP 403 with `application/json` and no `Content-Disposition` header.
- Initial 390×844 browser measurement reproduced a 10 px horizontal overflow (`scrollWidth: 400`, `innerWidth: 390`). Element measurements traced it to the `.workspace-page` grid's intrinsic implicit column, which a long roster email widened beyond the 346 px content box. The template links themselves remained inside the viewport.
- The failing browser measurement served as the regression case. Adding `grid-template-columns: minmax(0, 1fr)` to `.workspace-page` fixed the root cause without altering layout tokens.
- After rebuilding Docker, the same 390×844 check reported `scrollWidth: 390`, `innerWidth: 390`. Both download links were 298.5 px wide, stacked vertically within the viewport, the guidance was readable, the file input was present, `Upload and Map` remained correctly disabled before file selection, and browser console warnings/errors were empty.
- Fresh post-fix verification passed: format, lint, typecheck, 20 test files/51 tests, zero audit vulnerabilities, production build, Docker rebuild, and web health.

**Final Task 4 status: VERIFIED.** All explicit local, Docker, download, authorization, desktop, and mobile gates are now satisfied.
