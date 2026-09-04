# Task 7 Brief: Final Verification and Acceptance

Execute Task 7 from `docs/superpowers/plans/2026-08-14-phase-5-batch-issuance.md`. This is verification and defect correction only; do not add Phase 6 or notification features.

Read completely: `AGENTS.md`, `REQUIREMENTS.md`, approved Phase 5 design/plan, the verification-before-completion skill, frontend-testing guidance, and Browser skill before browser actions.

## Required evidence

1. Fresh sequential format, lint, typecheck, full tests, npm audit, configured production build. Record commands, exit codes, and exact counts.
2. Fresh MariaDB integration suite; Docker Compose rebuild/migrations/health; HTTP 200 health endpoint; clean relevant logs; persistence check.
3. Browser acceptance with disposable local data for Faculty mixed CSV and XLSX rows across READY, ALREADY_ISSUED, DUPLICATE_IN_FILE, STUDENT_NOT_FOUND/NOT_ACTIVELY_ENROLLED, and EMAIL_MISMATCH. Verify mapping, mandatory preview, counts/dispositions, report download, partial-valid confirmation, atomic commit result, credential links, repeat-commit idempotency, no overlay/console errors.
4. Administrator read-only history/result/report and absence of mutation controls. Non-owner Faculty safe denial through live data if practical plus automated evidence. Denials expose no private rows or attachment headers.
5. Desktop and 390x844 QA: labels, keyboard focus, pending state, stacked rows, touch targets, no horizontal overflow, console health. Use the in-app Browser per its skill; do not substitute standalone Playwright unless explicitly permitted after a Browser failure.
6. Final exact-file independent review and requirements audit mapping FR-011, FR-012, FR-015, FR-020, FR-021, FR-022 and acceptance criteria 7, 8, 9, 15. List Phase 6 verification/sharing/revocation and later notification work as remaining. Never claim Open Badges certification.

Fix all defects found, rerun affected and full checks, and obtain final independent review with no unresolved Critical/Important findings before handoff.

Update README only where required for workflow/limits/tests. Write `task-7-report.md`, supporting private browser handoff/evidence as appropriate, and `final-review.md` in this SDD directory. Do not store real credentials or secrets.
