# Stage 4 — Production Email Reliability and Badge Sharing Improvements

**Status:** LOCAL IMPLEMENTATION COMPLETE  
**Production readiness:** UNVERIFIED

## Phase 4A — Email reliability foundation

- [x] Audit notification and SMTP implementation.
- [x] Document current queue/SMTP state machine.
- [x] Add notification delivery attempt history.
- [x] Add immutable provider event history.
- [x] Track SMTP acceptance separately from provider delivery.
- [x] Correlate notification, attempt, and provider identifiers.
- [x] Add reviewed migration `20261102170000_stage4_delivery_events`.
- [x] Preserve backward compatibility with existing notification rows.

## Phase 4B — Retry and recovery

- [x] Keep durable outbox jobs.
- [x] Add bounded exponential backoff with jitter.
- [x] Preserve configurable maximum attempts.
- [x] Preserve claim-token concurrency protection.
- [x] Preserve issuance idempotency.
- [x] Preserve administrator resend.
- [x] Record attempt history and retry outcomes.
- [x] Preserve worker crash/lease recovery behavior.

## Phase 4C — Brevo webhook integration

- [x] Implement `POST /api/webhooks/brevo`.
- [x] Verify HMAC-SHA256 signatures via `x-brevo-signature` / `x-sib-signature`.
- [x] Enforce 64 KiB body limit and 50-event batch limit.
- [x] Handle delivered, deferred, bounced, blocked, invalid, and complaint events.
- [x] Make duplicate events idempotent.
- [x] Prevent stale/out-of-order events from regressing status.
- [x] Store immutable normalized event history.
- [x] Add local webhook simulation script.
- [x] Avoid treating provider delivery as inbox receipt.

## Phase 4D — Student badge sharing

- [x] Audit Student Badge Portal.
- [x] Preserve My Badges and Badge Details.
- [x] Preserve signed JSON-LD and badge image downloads.
- [x] Preserve copyable public verification links.
- [x] Preserve issuance date, issuer, description, and status.
- [x] Preserve student ownership authorization.
- [x] Preserve signed credential integrity.

## Phase 4E — Social sharing

- [x] Preserve LinkedIn and Facebook actions.
- [x] Preserve native sharing and copy-link fallback.
- [x] Add safe Open Graph/Twitter metadata.
- [x] Add QR code generation and download.
- [x] Avoid private student information in previews.
- [x] Preserve visible revoked status on public verification.

## Phase 4F — Monitoring dashboard

- [x] Display queue and provider status.
- [x] Add provider-status filtering.
- [x] Preserve search and pagination.
- [x] Add attempt and provider event history detail.
- [x] Add retry/resend actions with confirmation.
- [x] Restrict retry to Administrator.
- [x] Scope Faculty visibility to owned classes.
- [x] Preserve light visual design tokens.

## Phase 4G — Testing

- [x] SMTP acceptance vs provider delivery unit tests.
- [x] Retry/backoff/jitter tests.
- [x] Worker attempt-history tests.
- [x] Webhook authentication, validation, replay, and stale-event tests.
- [x] Bounce/complaint projection tests.
- [x] Notification authorization and privacy tests.
- [x] Sharing/QR/metadata tests.
- [x] Full unit suite.
- [x] Full MariaDB integration suite on clean disposable database.
- [x] Production build.
- [x] Playwright regression suite.

## Deliverables

- [x] Application code.
- [x] Database migration.
- [x] Automated tests.
- [x] Environment examples updated.
- [x] Administrator documentation.
- [x] Student sharing documentation.
- [x] `STAGE4-TODO.md`.
- [x] `STAGE4-IMPLEMENTATION-REPORT.md`.
- [x] `STAGE4-TEST-RESULTS.md`.
- [x] `STAGE4-PRODUCTION-READINESS.md`.

## Blockers

- None for local implementation.
- Production email delivery remains unverified until authenticated provider events and recipient inbox evidence are confirmed in the target environment.
