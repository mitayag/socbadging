# Task 6 Brief: Batch Wizard, History, and Result UI

Implement Task 6 from `docs/superpowers/plans/2026-08-14-phase-5-batch-issuance.md` exactly, using TDD.

Read completely before changes: `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 5 design and plan, relevant Next.js 16 docs, and the React best-practices guidance. Preserve the established modern-light design and reusable component patterns.

## Scope

- Create the batch issuance wizard, batch history, batch result, their named tests, and the batch result page.
- Integrate the wizard/history into the existing class issuance page.
- Add only the responsive/accessibility CSS required by Task 6.
- Do not add email, public verification, social sharing, revocation, signing, queues, or Phase 6 functionality.

## Required behavior

- Pages remain Server Components; begin independent authorized reads together after actor resolution.
- Pass minimal serialized data into the Client wizard.
- Faculty sees mutation controls only for authorized active owned classes/badges. Administrator receives read-only history/result only and never wizard/commit controls.
- Wizard states cover file choice, badge choice, inspection, header mapping, mandatory preview, all dispositions/counts, preview report download, zero-ready disabled commit, explicit partial-valid confirmation, exact commit count, reset when file/badge changes, pending and safe error states.
- History/result remain role-scoped and link to results, reports, and issued credentials where available.
- Use title-case labels, visible focus, semantic labels/statuses, accessible pending feedback, and existing modern-light tokens.
- Desktop preview uses aligned columns. At the existing mobile breakpoint, rows stack with visible field labels and no horizontal overflow; respect reduced motion.
- Avoid data waterfalls and excessive client serialization per the React/Next.js guidance.

## Verification and handoff

Run focused component/page tests, navigation regressions, format, lint, typecheck, full tests, and configured production build. Write exact evidence and changed files to `task-6-report.md` in this SDD directory. Obtain an independent spec/code-quality review and fix all findings before handoff. Browser acceptance is reserved for Task 7.
