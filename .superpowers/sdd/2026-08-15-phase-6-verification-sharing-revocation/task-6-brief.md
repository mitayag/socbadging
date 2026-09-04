# Task 6 Brief — Full Verification, Docker, Browser Acceptance, and Traceability

Implement only Task 6 from `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` against the approved Phase 6 spec.

## Scope

- Run the complete quality gate: format, lint, typecheck, full tests, `npm audit`, and configured production build. Fix and rerun all failures.
- Run the full real-MariaDB integration suite, rebuild Compose images, apply and verify migrations, check healthy DB/web and `/api/health`, inspect relevant logs, and prove persistence across a MariaDB restart.
- Use the in-app Browser first for anonymous acceptance of active, expired, and revoked public credentials; privacy projection; JSON-LD view/download; copy/native-share fallback and social/email links; safe rate-limit denial; page identity; console/overlay cleanliness.
- Use the in-app Browser for authenticated owning-Faculty and Administrator revocation/settings acceptance, plus non-owner/unauthorized denial, preserved history, exactly-one audit, idempotent repeat behavior, and immediate public lifecycle status.
- Verify desktop and 390x844 responsive/accessibility behavior: badge prominence, labels, keyboard focus, live feedback, confirmation/pending states, touch targets, reduced motion where observable, wrapping, and no horizontal overflow.
- Update `README.md` for Phase 6 behavior and `.env.example` only if a non-secret Phase 6 environment setting remains.
- Produce `task-6-report.md` with exact commands, counts, screenshots/evidence locations, requirement mapping, assumptions, limitations, and remaining Phase 7/8/student portal/SMTP work. Never claim Open Badges certification.

## Constraints

- Read `AGENTS.md`, `REQUIREMENTS.md`, the Phase 6 spec/plan, and relevant Next.js 16 docs before edits.
- Preserve the modern light design and all server authorization/privacy/audit boundaries.
- Do not add Phase 7/8, student portal, SMTP notifications, signing, wallets, or certification work.
- Use systematic debugging and strict regression tests for any discovered defect.
- Do not declare completion unless every required gate and acceptance check passes.
