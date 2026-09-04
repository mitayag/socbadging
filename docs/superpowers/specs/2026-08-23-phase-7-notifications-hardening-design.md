# Phase 7 — Notifications and Production Hardening Design

**Date:** 2026-08-23  
**Status:** Approved  
**Requirements:** P1 recipient email notifications; FR-001, FR-002, FR-010, FR-011, FR-013, FR-016, FR-020; NFR security, accessibility, operations, testing, Docker deployment, and acceptance criteria 1–15

## 1. Goal

Complete production-oriented hardening and add reliable recipient email notifications for badge issuance and revocation without weakening issuance/revocation transactions, exposing student data, or changing immutable credential history.

Phase 7 also standardizes the product brand lockup so `HAU SOC` is always the first line and `Badging System` is always directly below it in the login, Administrator, Faculty, desktop, and mobile shells.

## 2. Scope

### Included

- Provider-neutral SMTP delivery configured only through environment variables.
- Mailpit as an optional development SMTP inbox.
- Transactional outbox records for individual issuance, batch issuance, and revocation notifications.
- A separate Docker email worker with safe job claiming, retry, recovery, and shutdown behavior.
- Administrator delivery inspection and audited manual retry.
- Faculty role-scoped delivery status for credentials in currently owned classes.
- Issuance and revocation email templates containing canonical public verification links.
- Database-backed shared rate limiting for security-sensitive and heavy endpoints.
- Security regression coverage for CSRF, XSS, SQL injection, formula injection, path traversal, upload validation, enumeration, and authorization boundaries.
- Database and media backup/restore automation with integrity verification.
- Structured operational logging, service health, Docker smoke, persistence, and recovery testing.
- Accessibility, responsive, representative-volume, and pagination audits.
- Complete FR/NFR/acceptance traceability and production/recovery runbooks.
- A reusable two-line application brand lockup.

### Excluded

- Student accounts or a student portal.
- Arbitrary email campaigns or editable rich-email templates.
- Changing a notification recipient after issuance.
- Including private administrative revocation reasons in recipient email.
- Cryptographic credential signing, formal certification, wallets, and interoperability work assigned to Phase 8.
- S3-compatible media migration unless separately approved after backup/restore hardening.

## 3. Architecture

Phase 7 adds a transactional notification outbox to the existing Next.js/MariaDB application and a separate Node.js worker service. Issuance and revocation services create domain records, audit records, and notification jobs inside the same MariaDB transaction. They never open an SMTP connection.

The worker polls eligible jobs, claims bounded batches using MariaDB locking, sends through a provider-neutral SMTP adapter, and records the outcome. A unique idempotency key prevents duplicate jobs for the same issuance and notification type. Claim leases allow recovery after worker crashes. Badge issuance and revocation remain successful even when SMTP is unavailable.

Hardening remains modular: rate-limit storage, backup/restore utilities, operational logging, and accessibility/E2E coverage are independent units with explicit interfaces. No public or client-side path receives SMTP credentials, raw notification payloads, or full student email addresses.

## 4. Notification Data Model

Add a forward Prisma migration for a `notification_deliveries` table and enums.

### Notification type

- `BADGE_ISSUED`
- `BADGE_REVOKED`

### Delivery status

- `PENDING` — eligible for a first attempt.
- `PROCESSING` — claimed by a worker until `claimExpiresAt`.
- `RETRY_SCHEDULED` — transient failure with a future `nextAttemptAt`.
- `SENT` — delivered successfully.
- `FAILED` — exhausted retries or permanent delivery failure.

### Required fields

- Internal opaque ID.
- Issuance ID foreign key.
- Notification type.
- Delivery status.
- Private recipient email snapshot.
- Recipient display-name snapshot.
- Badge-name snapshot.
- Issuer-name snapshot.
- Canonical verification URL snapshot.
- Unique idempotency key derived from issuance ID and notification type.
- Attempt count.
- Next-attempt timestamp.
- Claim token and claim-expiration timestamp.
- Safe last-error category and bounded safe diagnostic code; no raw message body or credentials.
- Optional provider message identifier.
- Sent timestamp and timestamps.

The destination and message-critical values are issuance-time snapshots. Manual retry cannot change them. Existing credentials receive no automatic backfill. Existing immutable issuance snapshots are never rewritten.

## 5. Transactional Event Creation

### Individual issuance

The issuance transaction creates:

1. The immutable badge issuance.
2. The existing `badge.issued` audit event.
3. One `BADGE_ISSUED` notification record.

Any database failure rolls back all three. SMTP is not contacted during the transaction.

### Batch issuance

Each newly created issuance receives exactly one `BADGE_ISSUED` notification. Invalid, already-issued, and excluded rows receive none. Repeated batch commit remains idempotent and cannot create duplicate notification records.

### Revocation

The existing revocation transaction updates lifecycle state, writes exactly one `badge.revoked` audit event, and creates exactly one `BADGE_REVOKED` notification. Repeat revocation remains idempotent and creates neither another audit event nor another notification.

The recipient email never appears in audit context.

## 6. Worker and SMTP Delivery

The worker is a dedicated Node.js process built from the repository and launched as a Compose service. It has database and SMTP environment access but no public HTTP port.

### Claiming

- Poll a bounded number of due `PENDING` or `RETRY_SCHEDULED` rows.
- Reclaim expired `PROCESSING` rows.
- Lock/claim rows atomically with a unique claim token and lease.
- Multiple workers must not send the same claimed job concurrently.
- Confirm claim ownership before recording success or failure.

### Retry policy

- Classify SMTP outcomes as success, transient, or permanent.
- Use bounded exponential backoff with configurable validated defaults.
- Stop after a configured maximum attempt count.
- Never retry malformed destinations or permanent SMTP rejection automatically.
- Preserve a safe error category without logging raw addresses, credentials, headers, or message bodies.

### Provider-neutral configuration

Environment variables cover SMTP host, port, secure/TLS mode, username, password, from address, reply-to, worker polling interval, claim lease, retry maximum, and retry base delay. Secrets have no committed values. Startup validation fails closed for inconsistent production configuration.

Mailpit is an optional development-profile service with its SMTP port available only to application containers and its web inbox loopback-bound for local use.

## 7. Email Content

Both templates are plain-text plus restrained accessible HTML generated from trusted application data and correctly escaped.

### Issued email

- Clear HAU SOC sender identity.
- Recipient first name.
- Badge name.
- Issuer name.
- Issue date.
- Canonical public verification URL.
- Explanation that the public link can be viewed and shared without signing in.

### Revoked email

- Clear revoked status and revocation date.
- Badge name and issuer name.
- Canonical verification URL showing current status.
- Support contact when configured.
- No private administrative revocation reason.

Emails contain no student number, internal issuance ID, internal public-ID label, roster metadata, audit context, or credential JSON attachment.

## 8. Authorization and Management UI

### Administrator

- Inspect paginated delivery records across the system.
- Filter by type, status, date, and safe recipient query.
- See masked recipient email, badge, status, attempt count, timestamps, and safe error category.
- Request retry only for `FAILED` or due/recoverable deliveries.
- Every retry request reauthenticates server-side and writes an append-only audit event.

### Faculty

- See delivery status only for issuances in classes they currently own.
- Cannot inspect SMTP configuration, provider diagnostics, other Faculty records, or unmasked recipient email through the notification UI.
- Cannot redirect or edit the stored destination.
- Manual retry is excluded from Faculty scope for Phase 7; Administrators control resend operations.

### Public/student

- No delivery-status route is public.
- Public verification continues to exclude student email and notification metadata.

## 9. Shared Rate Limiting

Replace single-process enforcement on security-sensitive and public endpoints with a MariaDB-backed limiter suitable for multiple web instances. Policies cover login, password reset, public HTML/JSON verification, import inspection/preview, and heavy export endpoints.

The limiter uses privacy-minimized keys, bounded expiry, atomic increments, generic denial responses, `Retry-After`, and scheduled cleanup. Proxy-derived client identity is trusted only when explicitly configured for a known deployment proxy. Tests cover boundary counts, expiry, concurrent increments, proxy policy, and non-disclosing denials.

## 10. Security Hardening

- Document a threat model for authentication, sessions, imports, uploads, verification, exports, notifications, backups, and administrative controls.
- Verify CSRF protection for state-changing browser actions.
- Test output escaping and stored/reflected XSS boundaries.
- Test SQL-injection resistance through ORM/raw-query boundaries.
- Retain spreadsheet formula sanitization for CSV/XLSX exports.
- Test path traversal, MIME/size validation, and media access boundaries.
- Test public-ID enumeration resistance and private-field absence.
- Test horizontal and vertical authorization for every protected Phase 7 route/action.
- Audit all new sensitive Administrator actions without recording secrets or private email.

## 11. Backup, Restore, and Operations

Provide checked-in scripts or narrowly scoped commands for consistent MariaDB backup and media-volume archive, plus restore into a clean disposable stack. Backups are written to an explicit operator-provided directory, never a broad or implicit path.

Verification must prove:

- Database row counts and selected checksums before and after restore.
- Issued credential history and public IDs persist.
- Media references resolve after restore.
- Notification state and audit history persist.
- Existing migrations remain applied with none pending.

The production runbook documents deployment, migrations, worker scaling, SMTP rotation, health checks, logs, backups, restore drills, incident recovery, and known limitations.

## 12. Accessibility, Responsive, and Volume Acceptance

- Keyboard-only navigation and visible focus across login, shell, notification tables, dialogs, and public credential pages.
- Programmatic labels, descriptions, live status, errors, pending states, and destructive confirmations.
- Modern-light token contrast, touch targets, alt text, reduced motion, wrapping, and no horizontal page overflow.
- Desktop, tablet, and 390×844 mobile acceptance.
- Paginated delivery/audit/issuance views with representative-volume checks.
- No framework overlay or unexplained console warnings/errors.

## 13. Brand Lockup

Create one reusable brand-lockup component for the login page, desktop sidebar, and mobile navigation. Its semantic structure is fixed:

```text
HAU SOC
Badging System
```

`Badging System` must never share the first text line with `HAU SOC`. The logo aligns beside the complete two-line wordmark, not above it or between its lines. CSS uses explicit column layout for the wordmark and preserves readable spacing at all supported widths. Component tests assert separate block elements; browser acceptance covers login, Administrator, Faculty, desktop, tablet, and mobile states.

## 14. Docker and Health

Compose adds:

- `worker` — notification processor with no host port.
- `mailpit` — optional development profile with loopback-only inbox access.
- Existing `web`, `db`, migration, media, integration, and E2E workflows remain supported.

Health and smoke checks cover database readiness, web health, worker database readiness, SMTP configuration/readiness where enabled, migrations, logs, and persistence across service/database restarts. Email unavailability must be visible operationally without making the web health endpoint falsely report issued credentials as unavailable.

## 15. Testing Strategy

Strict TDD applies to production changes.

- Unit tests: schemas, templates, escaping, masking, retry classification/backoff, claim rules, authorization, brand structure, rate-limit policies.
- MariaDB integration: transactional outbox creation/rollback, individual/batch/revocation idempotency, concurrent claims, expired-claim recovery, audit atomicity, settings and migration behavior.
- SMTP integration: Mailpit captures issued/revoked messages with correct safe content and canonical links.
- Route/action tests: Administrator inspection/retry, Faculty scoped status, authorization denial, validation, privacy, pagination, cache, and error behavior.
- Security tests: CSRF, XSS, SQL injection, formula injection, path traversal, MIME/size, enumeration, proxy trust, and role/ownership boundaries.
- E2E: Administrator, owning Faculty, non-owner Faculty, anonymous verifier, individual issuance notification, batch notification, revocation notification, failed delivery/retry, audit visibility, responsive brand lockup.
- Operations: fresh Compose build, all migrations, health, clean logs, persistence, backup/restore, audit zero vulnerabilities, production build.

## 16. Completion and Traceability

Phase 7 is complete only when:

- Automatic issued and revoked notifications work through Mailpit and provider-neutral SMTP configuration.
- Issuance/revocation success is independent of SMTP availability.
- Duplicate protection, retries, worker recovery, privacy, authorization, and audit behavior pass automated tests.
- Shared rate limiting and required security regressions pass.
- Backup/restore is demonstrated against a disposable stack.
- Accessibility/responsive/volume acceptance passes.
- The two-line brand lockup is verified across all shells.
- Format, lint, typecheck, full unit, MariaDB integration, SMTP integration, security, E2E, dependency audit, production build, Docker smoke, persistence, and restore gates pass.
- A traceability matrix maps implemented evidence to requirements and acceptance criteria.
- Remaining Phase 8 signing/conformance/wallet work is listed without certification claims.

## 17. Explicit Decisions and Assumptions

- SMTP is provider-neutral; Mailpit is local-development infrastructure.
- Notifications use a transactional outbox and a separate worker.
- Both issuance and revocation generate recipient notifications.
- Revocation emails omit the private administrative reason.
- Only Administrators can manually retry delivery in Phase 7.
- No automatic historical notification backfill occurs.
- Students continue to use public verification links without accounts.
- MariaDB is the shared coordination store for outbox jobs and rate limiting in the current deployment model.
- Phase 7 does not imply Open Badges certification.
