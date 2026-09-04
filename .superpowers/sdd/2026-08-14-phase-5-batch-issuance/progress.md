# SDD ledger — plan: docs/superpowers/plans/2026-08-14-phase-5-batch-issuance.md

Baseline: Git/worktree/commit tooling is unavailable because this workspace is not a Git repository. Reviews use exact task briefs, reports, direct file lists, and workspace inspection.

Task 1: fix round 1/5 (2 addressed, 0 open — summary row length and disposition counts reconciled)
Task 1: complete (review clean)

- Added `IssuanceBatch` schema, forward MariaDB migration, restrictive historical relations, runtime contracts, and stored-row parsing.
- Verification: migration deployed; 14 focused tests, 153 full tests, format, lint, typecheck, and production build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 2: fix round 1/5 (4 addressed, 0 open — case normalization, blank headers, server-only boundary, regressions)
Task 2: complete (review clean)

- Added bounded CSV/XLSX inspection, mapping, pure row classification, canonical fingerprinting, and formula-safe batch reports.
- Verification: 35 focused/regression tests, 183 full tests, format, lint, typecheck, and production build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 3: fix round 1/5 (3 addressed, 0 open — payload bounds, set-query fidelity, persistence assertions)
Task 3: complete (review clean)

- Added Faculty-authorized set-based preview creation, transaction-time account/class/badge validation, atomic private-safe preview audit, and role-scoped detail/history retrieval.
- Verification: 18 focused tests, 201 full tests, format, lint, typecheck, and production build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 4: complete (review clean)

- Added atomic batch commit, reusable transaction issuance primitive, immutable stored-result finalization, audit records, bounded collision/retry behavior, and MariaDB locking/concurrency coverage.
- Verification: focused suites, 11 real MariaDB integration tests, full tests, format, lint, typecheck, and build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 5: complete (review clean)

- Added protected inspect/preview/template/report routes and commit action with streaming size limits, active ownership checks, safe denial responses, and private no-store downloads.
- Verification: focused route/action/template suites, full tests, format, lint, typecheck, and build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 6: complete (review clean)

- Added Faculty batch wizard, role-scoped history/results, Administrator read-only presentation, accessible tables, stale-request protection, and responsive modern-light styling.
- Verification: focused UI suites, 291 full tests, format, lint, typecheck, and build passed.
- Independent review after remediation: specification APPROVED; code quality APPROVED.

Task 7: complete (final review clean)

- Fresh final gate: format, lint, typecheck, 291 tests, audit with zero vulnerabilities, and production build passed.
- Real MariaDB suite: 11 tests passed. Compose rebuild/migrations/health and named-volume persistence passed.
- In-app Browser acceptance covered mixed CSV/XLSX preview, partial-valid commit, audits, reports, credential links, Administrator read-only access, denial privacy, desktop, and 390×844 layout.
- Final independent review: specification APPROVED; code quality APPROVED; no Critical, Important, or Minor findings.
