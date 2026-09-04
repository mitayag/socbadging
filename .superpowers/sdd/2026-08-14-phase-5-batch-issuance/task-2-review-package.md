# Task 2 Review Package

Review against `task-2-brief.md`, `AGENTS.md`, `REQUIREMENTS.md`, approved Phase 5 design, Task 1 contracts, and existing roster parser/CSV conventions.

## Implementation Files

- `src/modules/issuance/services/batch-validation.ts`
- `src/modules/issuance/services/batch-validation.test.ts`
- `src/modules/issuance/services/batch-report.ts`
- `src/modules/issuance/services/batch-report.test.ts`

## Evidence

- `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/task-2-report.md`

Inspect real CSV/XLSX bounds and MIME behavior, mapping/index collision, source row numbering, normalization and bounded private input, disposition precedence, duplicate semantics, authoritative lookup assumptions, count reconciliation with Task 1, message privacy, canonical fingerprint completeness/stability, server-only boundaries, exact CSV bytes/headers/formula hardening, regression strength, and scope discipline. Report separate spec and quality verdicts with Critical/Important/Minor exact-line findings. Write `task-2-review.md`; do not edit implementation.
