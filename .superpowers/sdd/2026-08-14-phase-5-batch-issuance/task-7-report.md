# Task 7 Report — Final Verification and Acceptance

## Outcome

Phase 5 batch issuance passed the complete local quality gate, real MariaDB integration suite, Docker Compose deployment/persistence smoke test, and in-app Browser acceptance at desktop and 390×844. No Phase 6 verification/sharing/revocation, recipient notification, signing, or certification feature was added.

## Fresh Quality Gate

All commands were run from the repository root on 2026-08-14.

- `npm run format` — exit 0; all matched files use Prettier style.
- `npm run lint` — exit 0; zero warnings (`--max-warnings=0`).
- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 44 files and 293 tests passed after the expired-preview review fix.
- `npm audit` — exit 0; 0 vulnerabilities. The sandboxed request could not resolve the registry, so the approved network-capable rerun supplied the authoritative result.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` — exit 0; Next.js 16.3 production build compiled and emitted all Phase 5 dynamic routes.

## MariaDB and Docker Evidence

- `npm run test:integration:docker` with the documented disposable Compose configuration — exit 0; 2 files and 11 real MariaDB tests passed (8 batch commit, 3 individual issuance).
- `docker compose up --build -d --wait` with disposable smoke secrets — exit 0; web and migrate images rebuilt, MariaDB and web became healthy.
- Migration container: 7 migrations found; no pending migrations.
- `GET http://127.0.0.1:3000/api/health` — HTTP 200, `Cache-Control: no-store`, expected service JSON.
- Relevant migrate/web logs contained no application or migration error after the accepted run.
- Named-volume persistence: counts were `3` issuance batches and `4` badge issuances before MariaDB restart and remained `3|4` after restart; DB/web returned healthy and health returned HTTP 200.

## Browser Acceptance

Browser path: Codex in-app Browser (available and required); no Playwright fallback. The target flow was `Faculty class Issued page -> CSV/XLSX inspect and mapping -> stored validation preview -> explicit partial-valid confirmation -> atomic commit -> batch result and credential links`.

### Faculty CSV workflow

Disposable Faculty-owned data was used. The six-row CSV produced exactly:

- 1 `READY`
- 1 `ALREADY_ISSUED`
- 1 `DUPLICATE_IN_FILE`
- 1 `NOT_ACTIVELY_ENROLLED`
- 1 `STUDENT_NOT_FOUND`
- 1 `EMAIL_MISMATCH`

Student Number auto-mapping, optional Email mapping, mandatory stored preview, validation report download, exact counts, disabled commit before confirmation, and explicit `Issue Only 1 Ready Credential` confirmation were verified. Commit redirected to the committed result and displayed 1 issued, 1 already issued, 4 invalid, and 6 total with links for the existing and newly created credentials.

Database evidence matched the UI: the batch was `COMMITTED` with counts `6/1/1/4/1`; one identifier/count-only `badge.batch_committed` audit and one individual `badge.issued` audit were present. The created credential had a non-sequential public ID. The rendered result intentionally exposes no replay mutation control, so an actual second submission of that same batch cannot be initiated through approved visible UI. The authenticated Server Action boundary is directly covered by `redirects a repeated commit with the existing notice`; the real MariaDB test `returns the persisted result on repeat commit without duplicate writes` invokes the same `commitBatchPreview` service twice and verifies the second result has `alreadyCommitted: true` with no duplicate credential/audit writes. The concurrent same-batch integration test additionally proves one fresh and one existing result. Browser re-upload of the same recipient tuple classified it `ALREADY_ISSUED` and disabled a zero-ready commit. This is the exact supported idempotency path without inventing a replay control or issuing a synthetic internal Next action request outside the UI.

### XLSX and idempotency workflow

The same mixed rows were uploaded as XLSX after commit. Inspection/mapping succeeded and preview classified 0 ready, 2 already issued, and 4 invalid. The UI rendered `Issue 0 Credentials` disabled, demonstrating tuple-level idempotency and zero-ready protection.

### Administrator and denial boundaries

- Administrator class view displayed batch history but neither the individual issuance panel nor the batch wizard.
- Administrator could open the role-scoped result and download its report; there was no mutation control.
- A direct unauthenticated report request returned HTTP 403 with only `{"error":"Forbidden"}`, `Cache-Control: private, no-store`, and no `Content-Disposition` or protected row payload.
- A second active Faculty account was unavailable for a safe live non-owner check. Named automated route/service tests cover non-owner Faculty safe denial before protected response bodies and attachment headers.

### Responsive, accessibility, and console checks

- Desktop preview/result: correct page identity/title, meaningful DOM, aligned table headers/cells, no framework overlay, and clean result-tab console.
- 390×844 wizard preview and result: `innerWidth=390`, document scroll width `375`, no horizontal overflow. Preview and result header rows are hidden and each row stacks as a 331px labeled grid; student number, supplied email, disposition, message, and credential fields remain readable. Controls were 42–46px tall (above WCAG 2.2's 24px minimum), inputs/selects filled the available 346px width, and the disabled zero-ready button was 46px tall.
- Form fields have visible labels; preview/result table roles and column headers are exposed. Disabled/pending/confirmation states are covered in browser interaction and component tests. The Browser surface did not advance focus from `body` with its synthetic Tab command, so keyboard focus styling is supported by the existing focus-token CSS and automated tests but could not be independently captured with this Browser capability.
- A transient React error occurred only when the shared browser session changed from Faculty to Administrator between preview and submit. Investigation showed the stored batch remained `READY`; reload rendered the Administrator identity and read-only UI. After explicit Administrator sign-out and immediate Faculty reauthentication, the same workflow committed normally. This was cross-session browser-test interference, not an application defect. A fresh result tab recorded zero console warnings/errors.

Independent review also identified that elapsed `READY` previews were presented as Ready in history. A red-green correction now projects elapsed ready records as `EXPIRED` in authorized detail/history reads without rewriting the append-oriented stored record; two named service regressions cover both projections.

## Documentation and Files Changed in Task 7

- Modified `README.md` to document Phase 5 batch routes, role boundaries, workflow, accepted formats, 2 MiB/5,000-row limits, 30-minute preview expiry, partial-valid commit, and remaining scope.
- Created `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/phase5-browser-mixed.csv` with fictitious acceptance data.
- Modified `src/modules/issuance/services/batch-preview-service.ts` and its test to project elapsed ready previews as expired in authorized reads.
- Created this report.
- `final-review.md` is produced by the final independent review.

## Requirements Traceability

- **FR-011 / acceptance 7–8:** CSV/XLSX mapping, stored preview, all required dispositions, explicit partial-valid confirmation, zero-ready denial, atomic commit, and MariaDB rollback/concurrency tests.
- **FR-012 / acceptance 9:** immutable issuance records and difficult-to-guess public IDs created through the Phase 4 transaction primitive; created/existing credential links verified. The public verification page itself remains Phase 6.
- **FR-015:** issued credential snapshot/export foundation remains intact and build-tested; public JSON/JSON-LD verification output remains Phase 6.
- **FR-020:** preview, individual issuance, and batch commit audits verified with private identifier/count-only batch context.
- **FR-021:** Faculty-owned and Administrator read-only batch history/result retrieval verified; safe non-owner tests pass.
- **FR-022:** validation/result CSV, CSV/XLSX instructional templates, and issuance exports remain protected and downloadable.
- **Acceptance 15:** 293 automated tests plus 11 real MariaDB tests cover authorization, parsing, preview, commit, rollback, concurrency, routes/actions, and UI role boundaries.

## Remaining Work

- Phase 6: public verification page, current status/revocation presentation, JSON/JSON-LD public representation, and sharing.
- Later/P1: recipient email notification, cryptographic signing, wallet/API interoperability, and conformance testing.
- The product is not claimed to be Open Badges certified.
