# Task 5 Brief: Protected Batch Boundaries

Implement Task 5 from `docs/superpowers/plans/2026-08-14-phase-5-batch-issuance.md` exactly, using TDD.

Read completely before changes: `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 5 design and plan, and relevant Next.js 16 route/action/data-security documentation in `node_modules/next/dist/docs/`.

## Scope

- Create the inspect, preview, CSV template, XLSX template, and authorized report Route Handlers listed in Task 5.
- Create the batch commit Server Action listed in Task 5.
- Create the batch template service and all named route/action/template tests.
- Keep boundaries thin and delegate business authorization to existing Phase 5 services.

## Required behavior

- Authenticate every boundary independently and validate all path, form, JSON, mapping, and file input.
- Inspection/preview/templates are active Faculty-only and class-owner-scoped; Administrator mutation attempts are denied.
- Report reads follow the existing service rule: owning Faculty or Administrator read-only.
- Inspection accepts bounded multipart `file`, validated class ID, and badge ID.
- Preview returns only `BatchPreviewSummary`, never uncontrolled/private database records.
- CSV/XLSX templates use `Student Number`, `Email`; fictitious safe examples; exact private/no-store download headers; no state mutation.
- Report is BOM CSV, private/no-store, with a safe filename derived from validated/stored identifiers. Denials/errors must not expose protected body or attachment headers.
- Commit action accepts only a strict batch ID, calls only `commitBatchPreview`, revalidates relevant paths, and redirects to the result with `notice=committed|existing`.
- Do not implement Task 6 UI or Phase 6 features.

## Verification and handoff

Run focused tests, format, lint, typecheck, full unit tests, and configured production build. Write exact evidence and changed files to `task-5-report.md` in this SDD directory. Do not claim completion with any failing check. Request an independent spec/code-quality review before final handoff.
