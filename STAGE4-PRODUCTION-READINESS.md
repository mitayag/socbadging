# Stage 4 Production Readiness

**Status:** LOCAL IMPLEMENTATION COMPLETE — NOT PRODUCTION READY  
**Production deployment:** Not authorized  
**Production email reliability:** UNVERIFIED

## Locally verified

- All unit, integration, Playwright, build, lint, typecheck, format, and migration-parity checks pass.
- Notification queue and provider statuses are separated.
- Attempt and provider event histories are durable.
- Brevo webhook authentication, validation, idempotency, and stale-event handling are implemented.
- Retry backoff includes bounded jitter.
- Retry and resend actions are authorized and confirmed.
- Faculty notification visibility is scoped to owned classes.
- Student credential downloads, sharing, QR codes, and social metadata are implemented.
- Revoked credentials remain visibly revoked.

## Required before production

1. Configure an externally reachable HTTPS application URL and media host.
2. Register and verify the Brevo webhook with the production secret.
3. Confirm provider delivery events in the target environment.
4. Collect authorized recipient inbox evidence separately from provider events.
5. Implement a bounce/complaint suppression policy for future sends.
6. Add provider API/log reconciliation if operational response times require it.
7. Add monitoring, alerting, retention, and incident runbooks for email delivery.
8. Perform load, backup/restore, and security reviews for the target environment.
9. Verify DNS/domain authentication and sender reputation in production.
10. Do not treat SMTP acceptance or provider delivery as guaranteed inbox receipt.

## Remaining risks

- No provider-side deduplication guarantee.
- SMTP at-most-once is only guaranteed for controlled acceptance notifications.
- External artwork and social previews depend on public URL configuration.
- Webhook processing currently records status; suppression enforcement is a follow-up.
- No production deployment has been performed.
