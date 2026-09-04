# Phase 7 — Notifications and Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable issuance/revocation email notifications and complete the security, operations, accessibility, Docker, backup/restore, and traceability hardening required for Phase 7, while enforcing the shared two-line HAU SOC brand lockup.

**Architecture:** Issuance and revocation transactions create idempotent notification outbox rows in MariaDB. A separate provider-neutral SMTP worker claims and delivers jobs without blocking domain transactions; Administrator/Faculty UI reads privacy-safe projections. MariaDB also coordinates shared rate limits, while checked-in backup/restore utilities, security regression tests, E2E coverage, and runbooks close the production-hardening scope.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 6, Prisma 7.9, MariaDB 11.8, Node 22, Nodemailer SMTP, Mailpit, Docker Compose, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-phase-7-notifications-hardening-design.md`

## Global Constraints

- Read `AGENTS.md`, `REQUIREMENTS.md`, the approved spec, this plan, and relevant `node_modules/next/dist/docs/` guides before every task.
- Use strict RED/GREEN/REFACTOR TDD. Record the expected RED failure before production code.
- Never bypass server-side authorization or expose recipient email, SMTP configuration, internal identifiers, audit context, or raw snapshots publicly.
- Every schema change requires a checked-in forward migration and real MariaDB integration coverage.
- Issuance/revocation, their audit record, and their outbox row must be atomic.
- Issued credential snapshots remain immutable.
- Badge issuance/revocation success must not depend on SMTP availability.
- No secret or real credential enters source, fixtures, reports, logs, URLs, screenshots, or audit context.
- Preserve the modern light design tokens and mobile-first behavior.
- `HAU SOC` and `Badging System` are always separate text lines in every shared brand lockup.
- Do not claim Open Badges certification.
- The workspace is not a Git repository. Do not create fake commits; write per-task evidence reports under `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/` instead.
- Every task receives an independent exact-file spec/quality review before the next task begins.
- Do not declare Phase 7 complete until format, lint, typecheck, full unit, MariaDB integration, SMTP integration, security, E2E, dependency audit, production build, Docker smoke, persistence, and backup/restore gates pass.

---

### Task 1: Shared Two-Line Brand Lockup

**Files:**

- Create: `src/components/layout/brand-lockup.tsx`
- Create: `src/components/layout/brand-lockup.test.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/page.test.tsx`
- Modify: `src/components/layout/sidebar-content.tsx`
- Modify: `src/components/layout/sidebar-content.test.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/globals.test.ts`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-1-report.md`

**Interfaces:**

- Produces: `BrandLockup({ variant?: "login" | "sidebar"; priority?: boolean })`.
- Guarantees: separate semantic block elements for `HAU SOC` and `Badging System`; logo aligned beside the complete two-line wordmark.

- [ ] Read the Next.js image/component guide and inspect the current login/sidebar/mobile shell rendering.
- [ ] Write failing component/page/CSS contract tests proving the second line is a distinct block and reused in login, desktop sidebar, and mobile menu.
- [ ] Run the focused tests and record expected RED failures from the missing shared component/current layout.
- [ ] Implement the minimal reusable Server Component with fixed logo alt text and no client JavaScript.
- [ ] Replace duplicated login/sidebar brand markup and add explicit column layout, spacing, wrapping, and narrow-width safeguards.
- [ ] Run focused tests, format, lint, and typecheck.
- [ ] Use the in-app Browser first to verify login, Administrator shell, Faculty shell, desktop, tablet, and 390×844 mobile; capture no-overlap/no-console-error evidence.
- [ ] Write the task report and obtain independent review.

### Task 2: Notification Schema, Contracts, and Environment Validation

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260823_phase_7_notification_outbox/migration.sql`
- Create: `src/modules/notifications/types.ts`
- Create: `src/modules/notifications/schemas.ts`
- Create: `src/modules/notifications/schemas.test.ts`
- Create: `src/modules/notifications/services/notification-outbox.ts`
- Create: `src/modules/notifications/services/notification-outbox.test.ts`
- Create: `src/modules/notifications/services/notification-outbox.integration.test.ts`
- Modify: `src/config/env.ts`
- Create: `src/config/env.test.ts`
- Modify: `.env.example`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-2-report.md`

**Interfaces:**

- Produces: `NotificationType`, `NotificationDeliveryStatus`, privacy-safe DTOs, `enqueueIssuedNotification(tx, input)`, `enqueueRevokedNotification(tx, input)`, `loadSmtpConfig(env)`, and validated worker timing configuration.
- Idempotency key: exact `(issuanceId, notificationType)` unique constraint.

- [ ] Write failing schema/contract tests for all statuses, bounded fields, safe diagnostics, masked display, retry configuration, and production SMTP validation.
- [ ] Write failing MariaDB tests for unique idempotency, required foreign keys, indexes, and exact cascade/restrict behavior.
- [ ] Run the focused unit/integration tests and capture RED evidence.
- [ ] Add Prisma enums/model, relations, indexes, and the forward SQL migration; do not edit existing migrations.
- [ ] Implement small outbox enqueue helpers that accept only a transaction client and snapshot-safe input.
- [ ] Add non-secret provider-neutral SMTP/worker variables to `.env.example`; reject partial/unsafe production configuration.
- [ ] Generate Prisma Client and run migration against a fresh disposable MariaDB database.
- [ ] Run focused tests, format, lint, typecheck, and production build.
- [ ] Write the task report and obtain independent review.

### Task 3: Atomic Individual, Batch, and Revocation Notification Creation

**Files:**

- Modify: `src/modules/issuance/services/issuance-service.ts`
- Modify: `src/modules/issuance/services/issuance-service.test.ts`
- Modify: `src/modules/issuance/services/issuance-service.integration.test.ts`
- Modify: `src/modules/issuance/services/batch-commit-service.ts`
- Modify: `src/modules/issuance/services/batch-commit-service.test.ts`
- Modify: `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- Modify: `src/modules/issuance/services/revocation-service.ts`
- Modify: `src/modules/issuance/services/revocation-service.test.ts`
- Modify: `src/modules/issuance/services/revocation-service.integration.test.ts`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-3-report.md`

**Interfaces:**

- Consumes: Task 2 enqueue helpers.
- Produces: one pending `BADGE_ISSUED` row per new individual/batch issuance and one pending `BADGE_REVOKED` row per first revocation.

- [ ] Write failing unit tests proving enqueue calls use private recipient snapshot values and canonical verification URLs without adding email to audit context.
- [ ] Write failing MariaDB tests proving issuance/audit/outbox atomic commit and rollback for individual, batch, and revocation workflows.
- [ ] Add repeat/concurrency tests proving tuple idempotency, repeat batch commit, and repeat revocation never create duplicate jobs.
- [ ] Run the focused suites and record RED evidence.
- [ ] Add outbox creation inside existing transactions after all authoritative authorization/state validation and before commit.
- [ ] Preserve existing result types and UI behavior unless a privacy-safe notification status is explicitly needed later.
- [ ] Run focused unit and real MariaDB integration tests, then full issuance/revocation regression suites.
- [ ] Run format, lint, typecheck, and production build.
- [ ] Write the task report and obtain independent review.

### Task 4: SMTP Templates, Adapter, Worker, Mailpit, and Retry Recovery

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/notifications/templates/issued-email.ts`
- Create: `src/modules/notifications/templates/revoked-email.ts`
- Create: `src/modules/notifications/templates/email-templates.test.ts`
- Create: `src/modules/notifications/services/smtp-client.ts`
- Create: `src/modules/notifications/services/smtp-client.test.ts`
- Create: `src/modules/notifications/services/retry-policy.ts`
- Create: `src/modules/notifications/services/retry-policy.test.ts`
- Create: `src/modules/notifications/services/delivery-worker.ts`
- Create: `src/modules/notifications/services/delivery-worker.test.ts`
- Create: `src/modules/notifications/services/delivery-worker.integration.test.ts`
- Create: `src/worker.ts`
- Modify: `Dockerfile`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-4-report.md`

**Interfaces:**

- Produces: `renderIssuedEmail`, `renderRevokedEmail`, `SmtpTransport.send`, `classifySmtpFailure`, `calculateNextAttempt`, `claimDueDeliveries`, `completeDelivery`, `failDelivery`, `runWorker`.
- Worker has no public port and uses claim tokens/leases for ownership.

- [ ] Confirm current maintained Nodemailer release and official SMTP API documentation before adding the dependency; use only official docs for technical decisions.
- [ ] Write failing template tests for escaping, safe fields, canonical link, issued/revoked language, no internal IDs/student number/private reason, text/HTML parity, and Unicode.
- [ ] Write failing retry-classification/backoff tests for success, transient 4xx/network, permanent 5xx/address rejection, maximum attempts, and bounded delays.
- [ ] Write failing worker unit tests for bounded claims, claim ownership, graceful shutdown, safe structured logs, and no raw email/body/error leakage.
- [ ] Write failing MariaDB concurrency tests for two workers, expired-claim recovery, crash simulation, success, transient retry, permanent failure, and duplicate-send protection.
- [ ] Run focused tests and record RED evidence.
- [ ] Implement the minimal Nodemailer adapter and templates, keeping SMTP behind a narrow injected interface.
- [ ] Implement transactional claim/update operations and the worker loop; do not hold a database transaction open during SMTP network I/O.
- [ ] Add a production worker Docker target/service and optional Mailpit development profile with loopback-only inbox UI.
- [ ] Run Mailpit integration: issue and revoke disposable credentials, verify exactly two messages, safe body content, canonical links, and persistence/retry behavior across worker restart.
- [ ] Run focused/full tests, dependency audit, format, lint, typecheck, Docker build, and production build.
- [ ] Write the task report and obtain independent review.

### Task 5: Delivery Queries, Administrator Retry, Faculty Status, and UI

**Files:**

- Create: `src/modules/notifications/services/notification-query-service.ts`
- Create: `src/modules/notifications/services/notification-query-service.test.ts`
- Create: `src/modules/notifications/services/notification-query-service.integration.test.ts`
- Create: `src/modules/notifications/services/notification-retry-service.ts`
- Create: `src/modules/notifications/services/notification-retry-service.test.ts`
- Create: `src/modules/notifications/services/notification-retry-service.integration.test.ts`
- Create: `src/app/notifications/page.tsx`
- Create: `src/app/notifications/page.test.tsx`
- Create: `src/app/notifications/actions.ts`
- Create: `src/app/notifications/actions.test.ts`
- Create: `src/components/notifications/notification-list.tsx`
- Create: `src/components/notifications/notification-list.test.tsx`
- Create: `src/components/notifications/retry-notification-form.tsx`
- Create: `src/components/notifications/retry-notification-form.test.tsx`
- Modify: `src/components/issuance/credential-detail.tsx`
- Modify: `src/components/issuance/credential-detail.test.tsx`
- Modify: `src/components/layout/navigation.ts`
- Modify: `src/components/layout/navigation.test.ts`
- Modify: `src/app/globals.css`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-5-report.md`

**Interfaces:**

- Produces: paginated privacy-safe notification projections; Administrator-only `retryNotificationAction`; Faculty-owned issuance delivery-status projection.
- Manual retry preserves destination/content snapshots and writes `notification.retry_requested` audit atomically.

- [x] Read Next.js 16 Server/Client Components, Server Actions, forms, caching/revalidation, and data-security guides completely.
- [x] Write failing authorization/query tests for Administrator global access, Faculty current-owner scope, non-owner denial, suspended/deleted actor denial, pagination, filters, and masked recipient email.
- [x] Write failing retry-service MariaDB tests for allowed statuses, actor lock/revalidation, exact unchanged destination, atomic audit/reset, concurrent retry, and safe idempotency.
- [x] Write failing page/action/component tests for labels, filters, pending/success/error feedback, unavailable retry control, responsive semantic tables, and server-derived capability props.
- [x] Run focused tests and capture RED evidence.
- [x] Implement narrow server services, protected Server Components/Actions, minimal client form islands, and active role-aware navigation.
- [x] Show Faculty only a status badge on authorized credential detail; keep provider details and retry control Administrator-only.
- [x] Run focused/full tests, format, lint, typecheck, and production build.
- [x] Use the in-app Browser first for Administrator, owning Faculty, non-owner Faculty, desktop, and mobile acceptance.
- [x] Write the task report and complete exact-file self-review because independent delegation was not authorized.

### Task 6: Shared Rate Limiting and Security Regression Suite

**Files:**

- Create: `prisma/migrations/20260823_phase_7_shared_rate_limits/migration.sql`
- Modify: `prisma/schema.prisma`
- Create: `src/platform/security/shared-rate-limit.ts`
- Create: `src/platform/security/shared-rate-limit.test.ts`
- Create: `src/platform/security/shared-rate-limit.integration.test.ts`
- Modify or replace: `src/platform/security/public-rate-limit.ts`
- Modify: `src/platform/security/public-rate-limit.test.ts`
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/credentials/[publicId]/page.tsx`
- Modify: `src/app/credentials/[publicId]/page.test.tsx`
- Modify: `src/app/api/credentials/[publicId]/route.ts`
- Modify: `src/app/api/credentials/[publicId]/download/route.ts`
- Modify: `src/app/api/credentials/public-credential-routes.test.ts`
- Modify: `src/app/api/classes/[classId]/roster/import/inspect/route.ts`
- Modify: `src/app/api/classes/[classId]/roster/import/preview/route.ts`
- Modify: `src/app/api/classes/[classId]/issued/batch/inspect/route.ts`
- Modify: `src/app/api/classes/[classId]/issued/batch/preview/route.ts`
- Modify: `src/app/api/classes/[classId]/roster/export/route.ts`
- Modify: `src/app/api/classes/[classId]/issued/export/route.ts`
- Modify: `src/app/api/issued/export/route.ts`
- Modify: `src/app/api/issuance-batches/[batchId]/report/route.ts`
- Modify: `src/app/api/media/[...key]/route.ts`
- Modify: corresponding existing route test files and create focused tests beside uncovered routes
- Create: `src/platform/security/security-regression.test.ts`
- Modify: `next.config.ts` and `src/config/next-config.test.ts` only for verified security headers/policies
- Create: `docs/security/threat-model.md`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-6-report.md`

**Interfaces:**

- Produces: `consumeRateLimit({ policy, key, now? }) -> { allowed, limit, remaining, retryAfterSeconds }` backed by atomic MariaDB operations.
- Policies: login, reset, public HTML/JSON, import/heavy processing, export.

- [ ] Inventory every state-changing/heavy/public route and document the threat/control mapping before edits.
- [ ] Write failing unit and MariaDB concurrency tests for atomic boundary counts, expiry, cleanup, key hashing/minimization, policy isolation, and multi-instance behavior.
- [ ] Write failing route/proxy tests for generic 429, `Retry-After`, cache/security headers, trusted-proxy opt-in, and no raw public ID/email/IP in persisted keys or responses.
- [ ] Add failing security regression tests for CSRF/origin checks, XSS escaping, ORM/raw SQL injection resistance, CSV formula sanitization, upload MIME/size/path traversal, enumeration, and horizontal/vertical authorization.
- [ ] Apply the migration and implement the smallest shared limiter with bounded cleanup; retain fail-closed/fail-safe behavior exactly as approved per endpoint risk.
- [ ] Wire policies at server boundaries before expensive database/file work.
- [ ] Run focused unit/route/security tests and real MariaDB concurrency tests.
- [ ] Run full tests, format, lint, typecheck, dependency audit, and production build.
- [ ] Write/update the threat model, task report, and obtain independent review.

### Task 7: Backup/Restore, Structured Operations, and Health

**Files:**

- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`
- Create: `scripts/verify-backup.sh`
- Create: `scripts/backup-restore.test.sh`
- Create: `src/platform/logging/structured-log.ts`
- Create: `src/platform/logging/structured-log.test.ts`
- Modify: `src/platform/health/health.ts`
- Modify: `src/platform/health/health.test.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `compose.yaml`
- Modify: `README.md`
- Create: `docs/operations/production-runbook.md`
- Create: `docs/operations/backup-restore-runbook.md`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-7-report.md`

**Interfaces:**

- Backup scripts require an explicit validated destination directory and Compose project; restore requires an explicit disposable/approved target.
- Health output remains non-secret and distinguishes web readiness from asynchronous email degradation.

- [ ] Write failing structured-log tests proving redaction of email, SMTP credentials, message content, session/token data, and private snapshots while retaining event IDs/status/error categories.
- [ ] Write failing health tests for database readiness, worker last-heartbeat/degraded mail state, non-secret output, and correct web availability when SMTP is down.
- [ ] Write a disposable backup/restore test harness first; verify it fails before scripts exist.
- [ ] Implement explicit-path database/media backup, checksum manifest, restore safeguards, and verification commands without broad/destructive defaults.
- [ ] Implement structured logs and health/readiness projection; do not expose configuration values.
- [ ] Run a fresh disposable stack, create representative users/classes/media/issuances/notifications/audits, back up, restore into another clean stack, and compare counts/checksums/public IDs/media resolution.
- [ ] Restart database/worker/web and prove persistence, recovery, clean logs, and health semantics.
- [ ] Run focused/full tests, shell checks, format, lint, typecheck, and build.
- [ ] Write runbooks/task report and obtain independent review.

### Task 8: Accessibility, Volume, Full E2E, Traceability, and Final Acceptance

**Files:**

- Modify: `e2e/global-setup.ts`
- Modify: `e2e/phase6-regression.spec.ts` only to preserve earlier coverage if fixtures/interfaces change
- Create: `e2e/phase7-notifications-hardening.spec.ts`
- Modify: `src/components/layout/brand-lockup.test.tsx`
- Modify: `src/components/notifications/notification-list.test.tsx`
- Modify: `src/modules/notifications/services/notification-query-service.integration.test.ts`
- Modify: `src/modules/audit/services/audit-log-service.test.ts`
- Modify: `src/modules/issuance/services/issuance-query-service.test.ts`
- Modify: `src/app/globals.css` only for evidence-backed accessibility/responsive corrections
- Modify: `README.md`
- Create: `docs/traceability/phase-7-matrix.md`
- Create: `docs/operations/known-limitations.md`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/task-8-report.md`
- Create: `.superpowers/sdd/2026-08-23-phase-7-notifications-hardening/final-review.md`

**Interfaces:**

- Verifies complete Phase 7 without adding Phase 8 signing/certification/wallet work.

- [ ] Build deterministic exact-cleanup E2E fixtures with random disposable passwords and no real recipients.
- [ ] Add E2E coverage for individual issued email, batch emails only for newly issued rows, revocation email, SMTP outage with successful issuance, retry recovery, Administrator inspection/retry, Faculty scoped status, non-owner denial, Mailpit content/privacy, and audit visibility.
- [ ] Add brand-lockup E2E checks on login, Administrator, Faculty, desktop, tablet, and 390×844 mobile.
- [ ] Run keyboard/focus/labels/live-region/contrast/touch-target/reduced-motion/wrapping/no-overflow acceptance using the in-app Browser first; record console/overlay/page-identity evidence.
- [ ] Seed representative paginated data volumes and measure bounded query/page behavior without embedding brittle wall-clock thresholds; document observed baselines.
- [ ] Run the complete security regression suite and resolve every finding with RED/GREEN tests.
- [ ] Run format, lint, typecheck, full unit tests, dependency audit, configured production build, full MariaDB integration, SMTP/Mailpit integration, and all E2E with zero skips.
- [ ] Build a fresh Compose stack, apply all migrations with none pending, verify db/web/worker/Mailpit health, inspect logs, restart services/database, and prove persistence.
- [ ] Execute backup/restore drill again from the final images.
- [ ] Map FR/P1/NFR/acceptance criteria to exact tests, routes, screenshots, commands, and reports in the traceability matrix.
- [ ] List Phase 8 signing/conformance/wallet work and student-portal scope as remaining; never claim certification.
- [ ] Request a fresh whole-Phase-7 independent spec/security/quality review and fix every Critical/Important/Minor finding before completion.

## Final Acceptance Checklist

- [ ] `HAU SOC` / `Badging System` is a reusable two-line lockup everywhere.
- [ ] Individual, batch, and revocation transactions create exactly one correct notification job.
- [ ] Mailpit receives correct issued/revoked emails and no private/internal fields.
- [ ] SMTP outage cannot roll back issuance/revocation.
- [ ] Worker concurrency, leases, retries, crashes, restarts, and duplicate protection pass on MariaDB.
- [ ] Administrator inspection/retry and Faculty scoped status pass authorization/privacy tests.
- [ ] Shared rate limits and all security regression categories pass.
- [ ] Backup/restore and persistence are demonstrated on disposable stacks.
- [ ] Accessibility, responsive, volume, and full E2E acceptance pass with zero skips.
- [ ] Format, lint, typecheck, full unit, integration, audit, build, and Docker gates pass.
- [ ] Traceability and production/recovery documentation are complete.
- [ ] Independent final review is clean.
