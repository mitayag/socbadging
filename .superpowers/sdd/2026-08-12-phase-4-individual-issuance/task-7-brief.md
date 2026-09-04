# Task 7 Brief — Phase 4 Integration, Docker, and Acceptance Preparation

## Context

Perform the non-browser portion of final Phase 4 acceptance. Read `AGENTS.md`, `REQUIREMENTS.md`, approved design/plan, all task reports/reviews, README, environment/Compose configuration, and package scripts. Do not add features. The controller will perform in-app Browser QA and final broad review separately.

## Work

- Fix the two known Prettier failures in SDD Markdown so repository-wide formatting can pass; these are documentation-only mechanical edits.
- Ensure README documents issuer variables, issuance routes, Docker MariaDB integration command, credentials/bootstrap workflow, and the explicit unsigned/not-certified Open Badges status without secrets.
- Run the complete fresh gate sequentially: `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit`, configured production build.
- Run the Docker-network MariaDB integration suite.
- Rebuild/start the production-like Compose topology, apply migrations, verify migrate exits successfully, DB/web healthy, and `/api/health` returns HTTP 200.
- Prepare browser acceptance data safely. Prefer existing seed/bootstrap data; if data is missing, create disposable local-only Faculty/class/student/badge records through existing supported seed/UI flows. Do not commit real credentials. Record exact local test accounts from configured local seed/environment only in the private task report, not README/source.
- Do not perform browser automation; record the exact ready URLs, account roles, class ID, badge/student state, and any credentials in `task-7-browser-handoff.md` for controller use. This handoff is local SDD evidence and must not contain real production secrets.
- Inspect Docker logs for migration/web errors.

## Verification Rules

- Every claimed pass requires fresh command output and exit 0.
- If any gate fails, fix in-scope errors and rerun the complete affected gate.
- Do not call Phase 4 complete; browser QA, historical immutability, and final broad review remain controller work.

## Report

Write `task-7-report.md` with exact files changed, full commands/exits/test counts/audit result/Docker health and migration evidence, requirement mapping, and remaining browser work. Write `task-7-browser-handoff.md` with local acceptance setup. Return only status, verification summary, browser readiness, and concerns.
