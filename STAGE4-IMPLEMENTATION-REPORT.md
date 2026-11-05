# Stage 4 Implementation Report

**Status:** LOCAL IMPLEMENTATION COMPLETE  
**Production readiness:** UNVERIFIED  
**Deployment:** Not performed

## Summary

Stage 4 adds durable delivery-attempt and provider-event history, Brevo webhook ingestion, provider-status monitoring, retry jitter, safer social previews, QR sharing, and expanded notification operations.

## Phase 4A — Email reliability foundation

- Added `NotificationDeliveryAttempt` history with one row per SMTP attempt.
- Added immutable `NotificationDeliveryEvent` provider event history.
- Added `smtpAcceptedAt`, `providerStatus`, and `providerStatusAt` to notification deliveries.
- Kept SMTP acceptance separate from provider delivery.
- Added correlation by notification ID, attempt ID, provider message ID, and recent recipient delivery.
- Migration: `20261102170000_stage4_delivery_events`.
- Existing notification rows remain compatible; new fields default to null.

## Phase 4B — Retry and recovery

- Preserved the durable MariaDB outbox.
- Added bounded exponential backoff with ±20% jitter.
- Preserved `NOTIFICATION_MAX_ATTEMPTS`.
- Preserved atomic claim tokens and lease recovery.
- Worker attempts now create durable attempt history.
- Retry/resend actions remain authorized and audited.
- Controlled acceptance attempts remain non-retryable.

## Phase 4C — Brevo webhook integration

- Added `POST /api/webhooks/brevo`.
- HMAC-SHA256 verification via `x-brevo-signature` or `x-sib-signature`.
- 64 KiB body limit and 50-event batch limit.
- Strict event validation.
- Idempotent provider event IDs.
- Provider status projection for delivered, deferred, bounced, blocked, invalid, and complaint.
- Stale and out-of-order events are stored but do not regress final status.
- Unmatched events are stored without changing a delivery.
- Local signed-event simulation script: `scripts/simulate-brevo-webhook.ts`.
- Provider delivery is never treated as inbox receipt.

## Phase 4D — Student badge sharing

- Existing My Badges, Badge Details, signed downloads, public verification links, issuer/date/status displays, and ownership checks were preserved.
- Student detail and public verification pages now include a QR code for the public verification URL.
- Signed JSON-LD remains authoritative; PDF remains a summary.

## Phase 4E — Social sharing

- Preserved LinkedIn, Facebook, X, email, native sharing, and copy-link fallback.
- Added safe Open Graph and Twitter metadata containing badge and issuer information only.
- Added downloadable QR code endpoint: `/api/credentials/[publicId]/qr`.
- Revoked and expired credentials remain visibly marked on public verification.

## Phase 4F — Monitoring dashboard

- `/notifications` now shows queue status, provider status, SMTP acceptance time, attempts, and filters.
- Added provider-status filter and recipient/badge search.
- Added `/notifications/[deliveryId]` with attempt history and provider event history.
- Retry and resend actions require confirmation.
- Retry remains Administrator-only.
- Faculty visibility is scoped to owned classes.
- Existing light design tokens were preserved.

## Security and privacy

- Notification projections mask recipient emails.
- Faculty cannot access notifications for classes they do not own.
- Student credential access remains ownership-scoped.
- Social metadata excludes recipient identity.
- Webhook payloads are size-limited, signed, validated, and normalized.
- No SMTP credentials or provider secrets are logged.
- No external email was sent during automated tests.

## Known limitations

- Brevo transactional webhook behavior requires authenticated provider configuration in the target environment.
- Bounce/complaint suppression policy is not yet enforced for future sends; events update provider status.
- No provider API/log synchronization beyond the webhook.
- External-facing media and verification URLs still depend on a production `APP_URL` and public media host.
- Provider-side deduplication and inbox delivery are not guaranteed by SMTP acceptance.

## Files changed

Key implementation files:

- `prisma/schema.prisma`
- `prisma/migrations/20261102170000_stage4_delivery_events/migration.sql`
- `src/modules/notifications/services/notification-delivery-event-service.ts`
- `src/app/api/webhooks/brevo/route.ts`
- `src/modules/notifications/services/delivery-worker.ts`
- `src/modules/notifications/services/retry-policy.ts`
- `src/modules/notifications/services/notification-query-service.ts`
- `src/app/notifications/page.tsx`
- `src/app/notifications/[deliveryId]/page.tsx`
- `src/components/notifications/notification-list.tsx`
- `src/components/notifications/retry-notification-form.tsx`
- `src/components/notifications/resend-notification-form.tsx`
- `src/components/verification/share-controls.tsx`
- `src/components/verification/public-credential.tsx`
- `src/components/student/student-credential-detail.tsx`
- `src/app/credentials/[publicId]/page.tsx`
- `src/app/api/credentials/[publicId]/qr/route.ts`
- `src/app/globals.css`
- `scripts/simulate-brevo-webhook.ts`
- `docs/operations/email-delivery-operations.md`
- `docs/student-portal/BADGE-SHARING.md`
- `docs/email/BREVO-CONFIGURATION.md`

Tests added or updated:

- Webhook route and adapter tests.
- Delivery event projection integration tests.
- Attempt-history worker tests.
- Retry jitter tests.
- Provider-status and Faculty-scope query tests.
- Notification detail privacy test.
- QR and metadata tests.
- Notification confirmation E2E updates.
