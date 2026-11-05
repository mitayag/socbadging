# Stage 5A Change Inventory

**Date:** 3 November 2026

**Repository:** local `main` working tree

**Uncommitted entries inspected:** 200 (112 tracked modifications, 88 untracked)

## Classification summary

| Category      | Entries | Primary purpose                                                                          |
| ------------- | ------: | ---------------------------------------------------------------------------------------- |
| Functional    |      32 | Server modules, services, API routes, and worker behavior                                |
| UI            |      62 | Pages, layouts, components, tables, dialogs, loading/error states, CSS                   |
| Security      |      11 | Authentication, authorization, proxy guards, audit, signing, and rate limits             |
| Testing       |      53 | Unit, integration, and Playwright coverage plus E2E fixtures                             |
| Configuration |      14 | Runtime env examples, Compose, package metadata, Prisma schema/migrations, local scripts |
| Documentation |      28 | README, runbooks, audits, implementation reports, and screenshots                        |
| **Total**     | **200** |                                                                                          |

> Classification is by primary intent. Many files span concerns. Untracked directories such as `docs/screenshots/` and `src/app/student/` represent multiple files but count as one Git status entry.

## Full inventory

### Functional

| Status    | Path                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Modified  | `src/modules/badges/services/badge-service.ts`                              |
| Modified  | `src/modules/classes/services/class-service.ts`                             |
| Untracked | `src/modules/dashboard/`                                                    |
| Modified  | `src/modules/departments/services/department-service.ts`                    |
| Modified  | `src/modules/faculty/services/faculty-service.ts`                           |
| Modified  | `src/modules/issuance/services/batch-commit-service.ts`                     |
| Modified  | `src/modules/issuance/services/batch-preview-service.ts`                    |
| Modified  | `src/modules/issuance/services/issuance-query-service.ts`                   |
| Modified  | `src/modules/issuance/services/issuance-service.ts`                         |
| Modified  | `src/modules/issuance/services/replacement-service.ts`                      |
| Modified  | `src/modules/issuance/services/revocation-service.ts`                       |
| Modified  | `src/modules/issuance/services/signed-issuance-service.ts`                  |
| Untracked | `src/modules/notifications/services/bounce-event-contract.ts`               |
| Untracked | `src/modules/notifications/services/brevo-webhook-adapter.ts`               |
| Untracked | `src/modules/notifications/services/controlled-acceptance-service.ts`       |
| Modified  | `src/modules/notifications/services/delivery-worker.ts`                     |
| Untracked | `src/modules/notifications/services/notification-delivery-event-service.ts` |
| Modified  | `src/modules/notifications/services/notification-outbox.ts`                 |
| Modified  | `src/modules/notifications/services/notification-query-service.ts`          |
| Untracked | `src/modules/notifications/services/notification-resend-service.ts`         |
| Modified  | `src/modules/notifications/services/notification-retry-service.ts`          |
| Modified  | `src/modules/notifications/services/retry-policy.ts`                        |
| Modified  | `src/modules/notifications/services/smtp-client.ts`                         |
| Modified  | `src/modules/notifications/templates/issued-email.ts`                       |
| Untracked | `src/modules/notifications/templates/student-account-email.ts`              |
| Modified  | `src/modules/notifications/templates/template-utils.ts`                     |
| Modified  | `src/modules/notifications/types.ts`                                        |
| Modified  | `src/modules/rosters/services/roster-service.ts`                            |
| Modified  | `src/modules/settings/services/system-settings-service.ts`                  |
| Untracked | `src/modules/student/`                                                      |
| Untracked | `src/modules/verification/services/credential-pdf.ts`                       |
| Modified  | `src/worker.ts`                                                             |

### UI

| Status    | Path                                                            |
| --------- | --------------------------------------------------------------- |
| Untracked | `src/app/account/`                                              |
| Modified  | `src/app/api/auth/login/route.ts`                               |
| Untracked | `src/app/api/credentials/[publicId]/image/`                     |
| Untracked | `src/app/api/credentials/[publicId]/pdf/`                       |
| Untracked | `src/app/api/credentials/[publicId]/qr/`                        |
| Untracked | `src/app/api/webhooks/`                                         |
| Untracked | `src/app/audit-logs/loading.tsx`                                |
| Modified  | `src/app/audit-logs/page.tsx`                                   |
| Modified  | `src/app/classes/[classId]/badges/page.tsx`                     |
| Modified  | `src/app/classes/[classId]/issued/actions.ts`                   |
| Modified  | `src/app/classes/[classId]/issued/page.tsx`                     |
| Untracked | `src/app/classes/[classId]/loading.tsx`                         |
| Modified  | `src/app/classes/[classId]/settings/page.tsx`                   |
| Modified  | `src/app/classes/[classId]/students/actions.ts`                 |
| Modified  | `src/app/classes/[classId]/students/page.tsx`                   |
| Modified  | `src/app/classes/actions.ts`                                    |
| Untracked | `src/app/classes/loading.tsx`                                   |
| Modified  | `src/app/classes/page.tsx`                                      |
| Modified  | `src/app/credentials/[publicId]/page.tsx`                       |
| Untracked | `src/app/dashboard/activity/`                                   |
| Untracked | `src/app/dashboard/error.tsx`                                   |
| Untracked | `src/app/dashboard/loading.tsx`                                 |
| Modified  | `src/app/dashboard/page.tsx`                                    |
| Untracked | `src/app/error.tsx`                                             |
| Modified  | `src/app/faculty/actions.ts`                                    |
| Untracked | `src/app/faculty/loading.tsx`                                   |
| Modified  | `src/app/faculty/page.tsx`                                      |
| Modified  | `src/app/globals.css`                                           |
| Modified  | `src/app/issuance-batches/[batchId]/page.tsx`                   |
| Modified  | `src/app/issued/[issuanceId]/page.tsx`                          |
| Untracked | `src/app/issued/[issuanceId]/resend-actions.ts`                 |
| Untracked | `src/app/issued/loading.tsx`                                    |
| Modified  | `src/app/issued/page.tsx`                                       |
| Untracked | `src/app/notifications/[deliveryId]/`                           |
| Modified  | `src/app/notifications/actions.ts`                              |
| Untracked | `src/app/notifications/loading.tsx`                             |
| Modified  | `src/app/notifications/page.tsx`                                |
| Modified  | `src/app/profile/page.tsx`                                      |
| Untracked | `src/app/student/`                                              |
| Untracked | `src/app/students/`                                             |
| Modified  | `src/components/audit/audit-log-list.tsx`                       |
| Modified  | `src/components/auth/login-form.tsx`                            |
| Modified  | `src/components/auth/sign-out-button.tsx`                       |
| Untracked | `src/components/classes/`                                       |
| Untracked | `src/components/dashboard/`                                     |
| Untracked | `src/components/faculty/faculty-row-actions.tsx`                |
| Modified  | `src/components/issuance/credential-detail.tsx`                 |
| Modified  | `src/components/issuance/issuance-list.tsx`                     |
| Untracked | `src/components/issuance/resend-issuance-notification-form.tsx` |
| Modified  | `src/components/layout/app-shell.tsx`                           |
| Untracked | `src/components/layout/mobile-navigation.tsx`                   |
| Modified  | `src/components/layout/navigation.ts`                           |
| Modified  | `src/components/layout/sidebar-content.tsx`                     |
| Untracked | `src/components/layout/user-menu.tsx`                           |
| Modified  | `src/components/notifications/notification-list.tsx`            |
| Untracked | `src/components/notifications/resend-notification-form.tsx`     |
| Modified  | `src/components/notifications/retry-notification-form.tsx`      |
| Untracked | `src/components/rosters/roster-row-actions.tsx`                 |
| Untracked | `src/components/student/`                                       |
| Untracked | `src/components/ui/`                                            |
| Modified  | `src/components/verification/public-credential.tsx`             |
| Modified  | `src/components/verification/share-controls.tsx`                |

### Security

| Status    | Path                                                                    |
| --------- | ----------------------------------------------------------------------- |
| Modified  | `src/modules/audit/services/audit-log-service.ts`                       |
| Modified  | `src/modules/identity/policies/authorization.ts`                        |
| Modified  | `src/modules/identity/repositories/prisma-authentication-repository.ts` |
| Untracked | `src/modules/identity/services/account-service.ts`                      |
| Modified  | `src/modules/identity/services/authenticate.ts`                         |
| Modified  | `src/modules/identity/services/current-actor.ts`                        |
| Modified  | `src/modules/identity/types.ts`                                         |
| Modified  | `src/modules/signing/key-service.ts`                                    |
| Modified  | `src/platform/security/public-rate-limit.ts`                            |
| Modified  | `src/platform/security/shared-rate-limit.ts`                            |
| Modified  | `src/proxy.ts`                                                          |

### Testing

| Status    | Path                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| Untracked | `e2e/audit-logs.spec.ts`                                                                     |
| Untracked | `e2e/dashboard-and-user-menu.spec.ts`                                                        |
| Untracked | `e2e/dashboard-layout.spec.ts`                                                               |
| Untracked | `e2e/db.ts`                                                                                  |
| Modified  | `e2e/global-setup.ts`                                                                        |
| Untracked | `e2e/management-tables.spec.ts`                                                              |
| Untracked | `e2e/password-reset.spec.ts`                                                                 |
| Modified  | `e2e/phase6-regression.spec.ts`                                                              |
| Modified  | `e2e/phase7-notifications-hardening.spec.ts`                                                 |
| Modified  | `e2e/phase8-open-badges-conformance.spec.ts`                                                 |
| Untracked | `e2e/student-management.spec.ts`                                                             |
| Untracked | `e2e/student-portal.spec.ts`                                                                 |
| Untracked | `e2e/test-base.ts`                                                                           |
| Modified  | `src/app/api/auth/login/route.test.ts`                                                       |
| Modified  | `src/app/api/issuance-batches/batch-routes.test.ts`                                          |
| Modified  | `src/app/api/issued/issuance-routes.test.ts`                                                 |
| Modified  | `src/app/audit-logs/page.test.tsx`                                                           |
| Modified  | `src/app/classes/[classId]/issued/actions.test.ts`                                           |
| Modified  | `src/app/credentials/[publicId]/page.test.tsx`                                               |
| Modified  | `src/app/dashboard/page.test.tsx`                                                            |
| Modified  | `src/app/notifications/page.test.tsx`                                                        |
| Untracked | `src/app/profile/page.test.tsx`                                                              |
| Modified  | `src/components/audit/audit-log-list.test.tsx`                                               |
| Modified  | `src/components/issuance/issuance-list.test.tsx`                                             |
| Modified  | `src/components/layout/app-shell.test.tsx`                                                   |
| Modified  | `src/components/layout/navigation.test.ts`                                                   |
| Untracked | `src/components/layout/user-menu.test.tsx`                                                   |
| Modified  | `src/components/notifications/notification-list.test.tsx`                                    |
| Modified  | `src/components/notifications/retry-notification-form.test.tsx`                              |
| Modified  | `src/components/verification/share-controls.test.tsx`                                        |
| Modified  | `src/config/env.test.ts`                                                                     |
| Modified  | `src/modules/audit/services/audit-log-service.test.ts`                                       |
| Modified  | `src/modules/faculty/services/faculty-service.test.ts`                                       |
| Untracked | `src/modules/identity/services/account-service.test.ts`                                      |
| Modified  | `src/modules/issuance/services/issuance-query-service.test.ts`                               |
| Modified  | `src/modules/issuance/services/issuance-service.test.ts`                                     |
| Modified  | `src/modules/issuance/services/signed-issuance-service.test.ts`                              |
| Untracked | `src/modules/notifications/services/bounce-event-contract.test.ts`                           |
| Untracked | `src/modules/notifications/services/brevo-webhook-adapter.test.ts`                           |
| Untracked | `src/modules/notifications/services/controlled-acceptance-service.integration.test.ts`       |
| Untracked | `src/modules/notifications/services/controlled-acceptance-service.test.ts`                   |
| Modified  | `src/modules/notifications/services/delivery-worker.test.ts`                                 |
| Untracked | `src/modules/notifications/services/notification-delivery-event-service.integration.test.ts` |
| Modified  | `src/modules/notifications/services/notification-outbox.test.ts`                             |
| Modified  | `src/modules/notifications/services/notification-query-service.integration.test.ts`          |
| Modified  | `src/modules/notifications/services/notification-query-service.test.ts`                      |
| Untracked | `src/modules/notifications/services/notification-resend-service.integration.test.ts`         |
| Modified  | `src/modules/notifications/services/notification-retry-service.test.ts`                      |
| Modified  | `src/modules/notifications/services/retry-policy.test.ts`                                    |
| Modified  | `src/modules/notifications/templates/email-templates.test.ts`                                |
| Modified  | `src/platform/security/shared-rate-limit.test.ts`                                            |
| Modified  | `src/proxy.test.ts`                                                                          |
| Modified  | `src/test/setup.ts`                                                                          |

### Configuration

| Status    | Path                                                          |
| --------- | ------------------------------------------------------------- |
| Modified  | `.env.example`                                                |
| Modified  | `compose.yaml`                                                |
| Modified  | `package-lock.json`                                           |
| Modified  | `package.json`                                                |
| Untracked | `prisma/migrations/20261101180000_student_portal/`            |
| Untracked | `prisma/migrations/20261102120000_email_delivery_channel/`    |
| Untracked | `prisma/migrations/20261102140000_smtp_submission_attempts/`  |
| Untracked | `prisma/migrations/20261102170000_stage4_delivery_events/`    |
| Untracked | `prisma/migrations/20261103090000_faculty_inactive_status/`   |
| Untracked | `prisma/migrations/20261103170000_user_must_change_password/` |
| Modified  | `prisma/schema.prisma`                                        |
| Untracked | `scripts/bootstrap-local-signing.ts`                          |
| Untracked | `scripts/simulate-brevo-webhook.ts`                           |
| Modified  | `src/config/env.ts`                                           |

### Documentation

| Status    | Path                                             |
| --------- | ------------------------------------------------ |
| Untracked | `AUDIT-LOGS-ENHANCEMENT-REPORT.md`               |
| Untracked | `DASHBOARD-LAYOUT-IMPROVEMENTS-REPORT.md`        |
| Untracked | `DASHBOARD-RESPONSIVE-REPORT.md`                 |
| Untracked | `DASHBOARD-RESPONSIVE-TODO.md`                   |
| Untracked | `FACULTY-MANAGEMENT-REDESIGN-REPORT.md`          |
| Modified  | `README.md`                                      |
| Untracked | `STAGE4-IMPLEMENTATION-REPORT.md`                |
| Untracked | `STAGE4-PRODUCTION-READINESS.md`                 |
| Untracked | `STAGE4-TEST-RESULTS.md`                         |
| Untracked | `STAGE4-TODO.md`                                 |
| Untracked | `STAGE5A-CHANGE-INVENTORY.md`                    |
| Untracked | `STAGE5A-RELEASE-STABILIZATION-REPORT.md`        |
| Untracked | `STAGE5A-REMAINING-RISKS.md`                     |
| Untracked | `STAGE5A-TEST-RESULTS.md`                        |
| Untracked | `STUDENT-MANAGEMENT-AND-ISSUED-BADGES-REPORT.md` |
| Untracked | `STUDENT-PASSWORD-RESET-REPORT.md`               |
| Modified  | `docs/TRACEABILITY.md`                           |
| Untracked | `docs/UI-UX-IMPLEMENTATION-REPORT.md`            |
| Untracked | `docs/UI-UX-SYSTEM-AUDIT.md`                     |
| Untracked | `docs/email/`                                    |
| Untracked | `docs/operations/dependency-security.md`         |
| Untracked | `docs/operations/email-delivery-operations.md`   |
| Modified  | `docs/operations/known-limitations.md`           |
| Untracked | `docs/reviews/`                                  |
| Modified  | `docs/runbooks/open-badges-key-lifecycle.md`     |
| Untracked | `docs/screenshots/`                              |
| Modified  | `docs/security/threat-model.md`                  |
| Untracked | `docs/student-portal/`                           |

## Generated or ignored artifacts (not part of the change set)

- `.env`, `.env.*` — ignored; `.env.example` is tracked/untracked with placeholders only.
- `.next/`, `node_modules/`, `test-results/`, `playwright-report/`, `coverage/` — ignored build/test output.
- `.playwright-e2e-fixture.json`, `.playwright-e2e-signer.json` — ignored disposable test credentials.
- `tsconfig.tsbuildinfo`, `*.log`, `.DS_Store`, `storage/*` — ignored generated/local state.
- `docs/screenshots/` — untracked documentation artifacts containing local/E2E fixture data; review/redact before any external release.

## Security scan summary

- No private keys, provider API keys, bearer tokens, or real credentials were found in tracked or untracked source files.
- `.env` is ignored and was not printed or committed. `.env.example` contains placeholders only.
- Several test files contain deliberately weak, test-only passwords. These are not production credentials but must remain confined to test fixtures.
- The local live student credential is not recorded in repository files; rotate local test credentials before shared use.
- `docs/screenshots/` may contain local test PII/fixture data; treat as internal and exclude from a production artifact unless sanitized.

## Accidental changes / incomplete implementations

- No unrelated feature work was found after path and diff review; the large change set is the cumulative Stage 4 + Stage 5 local work.
- Documentation drift exists: `docs/operations/known-limitations.md` still describes self-service email reset and bounce processing as future scope, while the local implementation now includes the former and Stage 4 includes webhook handling. Update before release.
- 27 legacy issuance rows with empty snapshot JSON remain in the local app database; they are surfaced as unavailable and are not modified or deleted. See the reconciliation proposal in `STAGE5A-REMAINING-RISKS.md`.
- Deferred UI enhancements (dashboard activity table, student notification page-size/sort, badge-gallery pagination, notification sort controls) are documented in `docs/UI-UX-SYSTEM-AUDIT.md` and `docs/UI-UX-IMPLEMENTATION-REPORT.md`.
