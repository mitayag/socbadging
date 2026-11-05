# GitHub Release File Inventory

**Release:** `v0.5.0-rc.1`  
**Branch:** `release/v0.5.0-rc.1`  
**Candidate commit:** `1d622a043aa3f4923c2ccaee0db27513cc62168c`  
**Base:** `main`  
**Generated:** 5 November 2026

## Summary

- Total changed files: **333**
- Added: **210**
- Modified: **123**
- Deleted: **0**
- Diff: **31,665 insertions / 1,829 deletions**

## Inclusion and exclusion

Included: application source, Prisma migrations, unit/integration/E2E tests, production Compose and deployment templates, operational scripts, and approved documentation.

Excluded: `.env`, private signing keys, local Playwright signer fixtures, `storage/` backups/manifests, `docs/screenshots/`, `test-results/`, `playwright-report/`, `.next/`, `node_modules/`, and TypeScript build cache.

## Category summary

| Category                    | Files |
| --------------------------- | ----: |
| `Root documentation/config` |    60 |
| `deploy`                    |     6 |
| `docs/`                     |     3 |
| `docs/conformance`          |     1 |
| `docs/email`                |     7 |
| `docs/operations`           |     7 |
| `docs/reviews`              |     1 |
| `docs/runbooks`             |     1 |
| `docs/security`             |     1 |
| `docs/student-portal`       |    16 |
| `e2e`                       |    13 |
| `prisma`                    |     8 |
| `scripts`                   |    11 |
| `src/`                      |     3 |
| `src/app`                   |    71 |
| `src/components`            |    43 |
| `src/config`                |     2 |
| `src/modules`               |    74 |
| `src/platform`              |     3 |
| `src/test`                  |     2 |

## Key release artifacts

- `compose.production.yaml`
- `Dockerfile`
- `prisma/schema.prisma`
- `deploy/production.env.example`
- `deploy/secrets/README.md`
- `deploy/docker-entrypoint-secrets.sh`
- `src/config/env.ts`
- `src/modules/notifications/services/recipient-policy.ts`
- `src/modules/notifications/services/recipient-suppression-core.ts`
- `src/modules/verification/services/status-list-publication.ts`
- `scripts/backup-signing-key.sh`
- `scripts/production-healthcheck.sh`
- `scripts/brevo-readiness.ts`
- `scripts/arm-controlled-acceptance.ts`

## Complete inventory

### Added

- `.env.brevo.example`
- `AUDIT-LOGS-ENHANCEMENT-REPORT.md`
- `DASHBOARD-LAYOUT-IMPROVEMENTS-REPORT.md`
- `DASHBOARD-RESPONSIVE-REPORT.md`
- `DASHBOARD-RESPONSIVE-TODO.md`
- `FACULTY-MANAGEMENT-REDESIGN-REPORT.md`
- `STAGE4-IMPLEMENTATION-REPORT.md`
- `STAGE4-PRODUCTION-READINESS.md`
- `STAGE4-TEST-RESULTS.md`
- `STAGE4-TODO.md`
- `STAGE5A-CHANGE-INVENTORY.md`
- `STAGE5A-RELEASE-STABILIZATION-REPORT.md`
- `STAGE5A-REMAINING-RISKS.md`
- `STAGE5A-TEST-RESULTS.md`
- `STAGE5B-BACKUP-RESTORE-REPORT.md`
- `STAGE5B-DATABASE-INTEGRITY-REPORT.md`
- `STAGE5B-LEGACY-CREDENTIAL-RECONCILIATION.md`
- `STAGE5B-MIGRATION-VALIDATION.md`
- `STAGE5B-REMAINING-RISKS.md`
- `STAGE5B-TEST-RESULTS.md`
- `STAGE5C-BREVO-DNS-VALIDATION.md`
- `STAGE5C-DELIVERY-ACCEPTANCE.md`
- `STAGE5C-EMAIL-READINESS-REPORT.md`
- `STAGE5C-REMAINING-RISKS.md`
- `STAGE5C-SIGNING-KEY-LIFECYCLE.md`
- `STAGE5C-TEST-RESULTS.md`
- `STAGE5C-WEBHOOK-SECURITY-REPORT.md`
- `STAGE5C1-RECIPIENT-SUPPRESSION-REPORT.md`
- `STAGE5C1-REMAINING-RISKS.md`
- `STAGE5C1-REMEDIATION-REPORT.md`
- `STAGE5C1-STATUS-LIST-REPAIR.md`
- `STAGE5C1-TEST-RESULTS.md`
- `STAGE5D-BACKUP-RECOVERY.md`
- `STAGE5D-DOCKER-PRODUCTION.md`
- `STAGE5D-ENVIRONMENT-CHECKLIST.md`
- `STAGE5D-INFRASTRUCTURE-READINESS.md`
- `STAGE5D-NGINX-PROXY-MANAGER.md`
- `STAGE5D-REMAINING-RISKS.md`
- `STAGE5D-SECURITY-REVIEW.md`
- `STAGE5D-TEST-RESULTS.md`
- `STAGE5E1-BREVO-ACCEPTANCE-PLAN.md`
- `STAGE5E1-DATA-READINESS.md`
- `STAGE5E1-FINAL-READINESS-REPORT.md`
- `STAGE5E1-RECIPIENT-POLICY.md`
- `STAGE5E1-RELEASE-CANDIDATE.md`
- `STAGE5E1-REMAINING-RISKS.md`
- `STAGE5E1-SECURITY-REVIEW.md`
- `STAGE5E1-SIGNING-ACCEPTANCE.md`
- `STAGE5E1-TEST-RESULTS.md`
- `STUDENT-MANAGEMENT-AND-ISSUED-BADGES-REPORT.md`
- `STUDENT-PASSWORD-RESET-REPORT.md`
- `compose.production.yaml`
- `deploy/docker-entrypoint-secrets.sh`
- `deploy/monitoring/README.md`
- `deploy/nginx-proxy-manager/advanced.conf.example`
- `deploy/production.env.example`
- `deploy/secrets/README.md`
- `deploy/staging.override.yaml`
- `docs/UI-UX-IMPLEMENTATION-REPORT.md`
- `docs/UI-UX-SYSTEM-AUDIT.md`
- `docs/conformance/status-list-architecture.md`
- `docs/email/BREVO-CONFIGURATION.md`
- `docs/email/BREVO-INTEGRATION-TEST-REPORT.md`
- `docs/email/BREVO-SMTP-ACCEPTANCE-CHECKLIST.md`
- `docs/email/BREVO-SMTP-ACCEPTANCE-REPORT.md`
- `docs/email/BREVO-SMTP-EAUTH-REMEDIATION-REPORT.md`
- `docs/email/BREVO-SMTP-LIVE-ACCEPTANCE-REPORT.md`
- `docs/email/BREVO-SMTP-ONE-ATTEMPT-SAFETY-REPORT.md`
- `docs/operations/database-migrations.md`
- `docs/operations/dependency-security.md`
- `docs/operations/email-delivery-operations.md`
- `docs/operations/recipient-suppression.md`
- `docs/reviews/STUDENT-BADGE-ACCESS-NOTIFICATION-AUDIT.md`
- `docs/student-portal/ACADEMIC-ACCEPTANCE.md`
- `docs/student-portal/ARCHITECTURE.md`
- `docs/student-portal/BADGE-SHARING.md`
- `docs/student-portal/EMAIL-INFRASTRUCTURE.md`
- `docs/student-portal/FINAL-READINESS.md`
- `docs/student-portal/IMPLEMENTATION-PLAN.md`
- `docs/student-portal/SECURITY-REVIEW.md`
- `docs/student-portal/STAGE1-REPORT.md`
- `docs/student-portal/STAGE2-REPORT.md`
- `docs/student-portal/STAGE3-ACADEMIC-ACCEPTANCE.md`
- `docs/student-portal/STAGE3-GIT-READINESS.md`
- `docs/student-portal/STAGE3-SECURITY-REVIEW.md`
- `docs/student-portal/STAGE3-STABILIZATION-REPORT.md`
- `docs/student-portal/STAGE3-TODO.md`
- `docs/student-portal/STUDENT-ACCESS-EMAIL-DIAGNOSTIC.md`
- `docs/student-portal/TODO.md`
- `e2e/audit-logs.spec.ts`
- `e2e/dashboard-and-user-menu.spec.ts`
- `e2e/dashboard-layout.spec.ts`
- `e2e/db.ts`
- `e2e/management-tables.spec.ts`
- `e2e/password-reset.spec.ts`
- `e2e/student-management.spec.ts`
- `e2e/student-portal.spec.ts`
- `e2e/test-base.ts`
- `prisma/migrations/20261101180000_student_portal/migration.sql`
- `prisma/migrations/20261102120000_email_delivery_channel/migration.sql`
- `prisma/migrations/20261102140000_smtp_submission_attempts/migration.sql`
- `prisma/migrations/20261102170000_stage4_delivery_events/migration.sql`
- `prisma/migrations/20261103090000_faculty_inactive_status/migration.sql`
- `prisma/migrations/20261103170000_user_must_change_password/migration.sql`
- `prisma/migrations/20261104120000_recipient_suppression/migration.sql`
- `scripts/arm-controlled-acceptance.ts`
- `scripts/backup-signing-key.sh`
- `scripts/bootstrap-local-signing.ts`
- `scripts/brevo-readiness.ts`
- `scripts/production-healthcheck.sh`
- `scripts/repair-status-list.ts`
- `scripts/simulate-brevo-webhook.ts`
- `scripts/verify-status-list-external.ts`
- `scripts/worker-healthcheck.mjs`
- `src/app/account/actions.test.ts`
- `src/app/account/actions.ts`
- `src/app/account/page.test.tsx`
- `src/app/account/page.tsx`
- `src/app/api/credentials/[publicId]/image/route.ts`
- `src/app/api/credentials/[publicId]/pdf/route.ts`
- `src/app/api/credentials/[publicId]/qr/route.ts`
- `src/app/api/webhooks/brevo/route.test.ts`
- `src/app/api/webhooks/brevo/route.ts`
- `src/app/audit-logs/loading.tsx`
- `src/app/classes/[classId]/loading.tsx`
- `src/app/classes/loading.tsx`
- `src/app/dashboard/activity/page.tsx`
- `src/app/dashboard/error.tsx`
- `src/app/dashboard/loading.tsx`
- `src/app/error.tsx`
- `src/app/faculty/loading.tsx`
- `src/app/issued/[issuanceId]/resend-actions.ts`
- `src/app/issued/loading.tsx`
- `src/app/notifications/[deliveryId]/page.tsx`
- `src/app/notifications/loading.tsx`
- `src/app/profile/page.test.tsx`
- `src/app/student/activate/[token]/actions.ts`
- `src/app/student/activate/[token]/page.tsx`
- `src/app/student/badges/[issuanceId]/page.tsx`
- `src/app/student/badges/page.tsx`
- `src/app/student/change-password/actions.ts`
- `src/app/student/change-password/page.tsx`
- `src/app/student/error.tsx`
- `src/app/student/help/page.tsx`
- `src/app/student/loading.tsx`
- `src/app/student/notifications/page.tsx`
- `src/app/student/page.tsx`
- `src/app/student/profile/page.tsx`
- `src/app/student/recover/[token]/page.tsx`
- `src/app/student/recover/actions.ts`
- `src/app/student/recover/page.tsx`
- `src/app/students/actions.ts`
- `src/app/students/loading.tsx`
- `src/app/students/page.tsx`
- `src/app/students/password-actions.ts`
- `src/components/classes/class-row-actions.tsx`
- `src/components/dashboard/issuance-trend.tsx`
- `src/components/dashboard/quick-actions.tsx`
- `src/components/dashboard/recent-activities.tsx`
- `src/components/dashboard/recent-issuances.tsx`
- `src/components/dashboard/record-pagination.tsx`
- `src/components/dashboard/stat-cards.tsx`
- `src/components/faculty/faculty-row-actions.tsx`
- `src/components/issuance/resend-issuance-notification-form.tsx`
- `src/components/layout/mobile-navigation.tsx`
- `src/components/layout/user-menu.test.tsx`
- `src/components/layout/user-menu.tsx`
- `src/components/notifications/resend-notification-form.tsx`
- `src/components/notifications/suppressed-recipient-list.tsx`
- `src/components/notifications/unsuppress-recipient-form.tsx`
- `src/components/rosters/roster-row-actions.tsx`
- `src/components/student/student-badge-card.tsx`
- `src/components/student/student-badge-collection.tsx`
- `src/components/student/student-credential-detail.tsx`
- `src/components/student/student-password-reset-dialog.tsx`
- `src/components/student/student-row-actions.tsx`
- `src/components/student/student-stat-cards.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/ui/record-pagination.tsx`
- `src/modules/dashboard/services/dashboard-service.integration.test.ts`
- `src/modules/dashboard/services/dashboard-service.test.ts`
- `src/modules/dashboard/services/dashboard-service.ts`
- `src/modules/dashboard/types.ts`
- `src/modules/identity/services/account-service.test.ts`
- `src/modules/identity/services/account-service.ts`
- `src/modules/notifications/services/bounce-event-contract.test.ts`
- `src/modules/notifications/services/bounce-event-contract.ts`
- `src/modules/notifications/services/brevo-webhook-adapter.test.ts`
- `src/modules/notifications/services/brevo-webhook-adapter.ts`
- `src/modules/notifications/services/controlled-acceptance-service.integration.test.ts`
- `src/modules/notifications/services/controlled-acceptance-service.test.ts`
- `src/modules/notifications/services/controlled-acceptance-service.ts`
- `src/modules/notifications/services/notification-delivery-event-service.integration.test.ts`
- `src/modules/notifications/services/notification-delivery-event-service.ts`
- `src/modules/notifications/services/notification-resend-service.integration.test.ts`
- `src/modules/notifications/services/notification-resend-service.ts`
- `src/modules/notifications/services/recipient-policy.ts`
- `src/modules/notifications/services/recipient-suppression-core.ts`
- `src/modules/notifications/services/recipient-suppression-service.integration.test.ts`
- `src/modules/notifications/services/recipient-suppression-service.ts`
- `src/modules/notifications/templates/student-account-email.ts`
- `src/modules/student/services/student-account-service.integration.test.ts`
- `src/modules/student/services/student-account-service.ts`
- `src/modules/student/services/student-email-service.test.ts`
- `src/modules/student/services/student-email-service.ts`
- `src/modules/student/services/student-portal-service.integration.test.ts`
- `src/modules/student/services/student-portal-service.ts`
- `src/modules/student/types.ts`
- `src/modules/verification/services/credential-pdf.ts`
- `src/modules/verification/services/status-list-publication.ts`

### Modified

- `.env.example`
- `.gitignore`
- `Dockerfile`
- `README.md`
- `compose.yaml`
- `docs/TRACEABILITY.md`
- `docs/operations/backup-restore-runbook.md`
- `docs/operations/known-limitations.md`
- `docs/operations/production-runbook.md`
- `docs/runbooks/open-badges-key-lifecycle.md`
- `docs/security/threat-model.md`
- `e2e/global-setup.ts`
- `e2e/phase6-regression.spec.ts`
- `e2e/phase7-notifications-hardening.spec.ts`
- `e2e/phase8-open-badges-conformance.spec.ts`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `prisma/schema.prisma`
- `scripts/backup.sh`
- `scripts/restore.sh`
- `src/app/api/auth/login/route.test.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/issuance-batches/batch-routes.test.ts`
- `src/app/api/issued/issuance-routes.test.ts`
- `src/app/api/status-lists/status-list-route.test.ts`
- `src/app/audit-logs/page.test.tsx`
- `src/app/audit-logs/page.tsx`
- `src/app/classes/[classId]/badges/page.tsx`
- `src/app/classes/[classId]/issued/actions.test.ts`
- `src/app/classes/[classId]/issued/actions.ts`
- `src/app/classes/[classId]/issued/page.tsx`
- `src/app/classes/[classId]/settings/page.tsx`
- `src/app/classes/[classId]/students/actions.ts`
- `src/app/classes/[classId]/students/page.tsx`
- `src/app/classes/actions.ts`
- `src/app/classes/page.tsx`
- `src/app/credentials/[publicId]/page.test.tsx`
- `src/app/credentials/[publicId]/page.tsx`
- `src/app/dashboard/page.test.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/faculty/actions.ts`
- `src/app/faculty/page.tsx`
- `src/app/globals.css`
- `src/app/issuance-batches/[batchId]/page.tsx`
- `src/app/issued/[issuanceId]/page.tsx`
- `src/app/issued/page.tsx`
- `src/app/notifications/actions.ts`
- `src/app/notifications/page.test.tsx`
- `src/app/notifications/page.tsx`
- `src/app/profile/page.tsx`
- `src/components/audit/audit-log-list.test.tsx`
- `src/components/audit/audit-log-list.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/auth/sign-out-button.tsx`
- `src/components/issuance/credential-detail.tsx`
- `src/components/issuance/issuance-list.test.tsx`
- `src/components/issuance/issuance-list.tsx`
- `src/components/layout/app-shell.test.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/navigation.test.ts`
- `src/components/layout/navigation.ts`
- `src/components/layout/sidebar-content.tsx`
- `src/components/notifications/notification-list.test.tsx`
- `src/components/notifications/notification-list.tsx`
- `src/components/notifications/retry-notification-form.test.tsx`
- `src/components/notifications/retry-notification-form.tsx`
- `src/components/verification/public-credential.tsx`
- `src/components/verification/share-controls.test.tsx`
- `src/components/verification/share-controls.tsx`
- `src/config/env.test.ts`
- `src/config/env.ts`
- `src/modules/audit/services/audit-log-service.test.ts`
- `src/modules/audit/services/audit-log-service.ts`
- `src/modules/badges/services/badge-service.ts`
- `src/modules/classes/services/class-service.ts`
- `src/modules/departments/services/department-service.ts`
- `src/modules/faculty/services/faculty-service.test.ts`
- `src/modules/faculty/services/faculty-service.ts`
- `src/modules/identity/policies/authorization.ts`
- `src/modules/identity/repositories/prisma-authentication-repository.ts`
- `src/modules/identity/services/authenticate.ts`
- `src/modules/identity/services/current-actor.ts`
- `src/modules/identity/types.ts`
- `src/modules/issuance/services/batch-commit-service.ts`
- `src/modules/issuance/services/batch-preview-service.ts`
- `src/modules/issuance/services/issuance-query-service.test.ts`
- `src/modules/issuance/services/issuance-query-service.ts`
- `src/modules/issuance/services/issuance-service.test.ts`
- `src/modules/issuance/services/issuance-service.ts`
- `src/modules/issuance/services/replacement-service.ts`
- `src/modules/issuance/services/revocation-service.ts`
- `src/modules/issuance/services/signed-issuance-service.test.ts`
- `src/modules/issuance/services/signed-issuance-service.ts`
- `src/modules/notifications/services/delivery-worker.test.ts`
- `src/modules/notifications/services/delivery-worker.ts`
- `src/modules/notifications/services/notification-outbox.test.ts`
- `src/modules/notifications/services/notification-outbox.ts`
- `src/modules/notifications/services/notification-query-service.integration.test.ts`
- `src/modules/notifications/services/notification-query-service.test.ts`
- `src/modules/notifications/services/notification-query-service.ts`
- `src/modules/notifications/services/notification-retry-service.test.ts`
- `src/modules/notifications/services/notification-retry-service.ts`
- `src/modules/notifications/services/retry-policy.test.ts`
- `src/modules/notifications/services/retry-policy.ts`
- `src/modules/notifications/services/smtp-client.ts`
- `src/modules/notifications/templates/email-templates.test.ts`
- `src/modules/notifications/templates/issued-email.ts`
- `src/modules/notifications/templates/template-utils.ts`
- `src/modules/notifications/types.ts`
- `src/modules/rosters/services/roster-service.ts`
- `src/modules/settings/services/system-settings-service.ts`
- `src/modules/signing/key-service.ts`
- `src/modules/verification/services/status-list-service.integration.test.ts`
- `src/modules/verification/services/status-list-service.ts`
- `src/platform/security/public-rate-limit.ts`
- `src/platform/security/shared-rate-limit.test.ts`
- `src/platform/security/shared-rate-limit.ts`
- `src/proxy.test.ts`
- `src/proxy.ts`
- `src/test/integration-setup.ts`
- `src/test/setup.ts`
- `src/worker.ts`
