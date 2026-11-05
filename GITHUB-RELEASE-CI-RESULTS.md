# GitHub Release CI Results

**Release:** `v0.5.0-rc.1`  
**Candidate commit:** `1d622a043aa3f4923c2ccaee0db27513cc62168c`  
**Branch:** `release/v0.5.0-rc.1`  
**PR:** https://github.com/mitayag/socbadging/pull/1

## 1. GitHub Actions results

| Run         | Trigger      | Workflow | Result  | Duration | URL                                                            |
| ----------- | ------------ | -------- | ------- | -------- | -------------------------------------------------------------- |
| 41962514211 | push         | Quality  | SUCCESS | 3m 52s   | https://github.com/mitayag/socbadging/actions/runs/41962514211 |
| 41962535755 | pull_request | Quality  | SUCCESS | 2m 56s   | https://github.com/mitayag/socbadging/actions/runs/41962535755 |

Both quality jobs completed successfully. No failed GitHub check was reported for the candidate
commit.

A documentation-only commit is added after the candidate commit; it triggers the same Quality
workflow on the same PR.

## 2. Current CI workflow contents

`.github/workflows/quality.yml` runs on Node.js 22:

1. `npm ci`
2. `npm run db:generate`
3. `npm run format`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test`
7. `npm run build`

## 3. Local release validation

| Gate                      | Result                         |
| ------------------------- | ------------------------------ |
| Format                    | PASS                           |
| Lint                      | PASS                           |
| Typecheck                 | PASS                           |
| Unit tests                | 115 files / 859 tests PASS     |
| Integration tests         | 20 files / 148 tests PASS      |
| Playwright desktop+mobile | 57 passed, 1 skipped by design |
| Production build          | PASS                           |
| Production Compose config | PASS                           |
| Secret scan               | PASS                           |
| `npm audit --omit=dev`    | 0 vulnerabilities              |

Integration and E2E used separate disposable databases:

- integration: `badging_test`
- E2E: `badging_e2e`

The integration suite passed after the full E2E run without resetting the integration database,
confirming fixture isolation.

## 4. Missing or future CI checks

The current GitHub workflow does **not** run:

- MariaDB integration tests,
- Playwright desktop/mobile suites,
- container image build/smoke tests,
- migration deployment against disposable databases,
- secret scanning in CI,
- dependency audit gates.

These passed locally and are recommended for a follow-up CI workflow change. Their absence is a
release-process gap, not a candidate-code failure.

## 5. CI verdict

**GitHub Actions: PASS.**  
**Local release validation: PASS.**  
**CI coverage gap: integration/E2E/secret-scan automation remains pending.**
