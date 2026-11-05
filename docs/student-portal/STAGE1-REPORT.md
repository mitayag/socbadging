# Stage 1 Report — Badge Access and Notification Improvements

## Implemented

- Branded HTML and plain-text BADGE_ISSUED email with:
  - badge title,
  - issuer,
  - recipient first name,
  - issue date,
  - badge artwork when a safe public URL exists,
  - expiration only when applicable,
  - support contact when configured,
  - public verification URL.
- Transactional outbox retained for individual, batch, replacement, and revocation notifications.
- `SENT` wording corrected throughout new UI and documentation to mean SMTP acceptance, not inbox delivery.
- Authorized resend:
  - Administrator can resend SENT notifications.
  - Owning Faculty can resend notifications for their classes.
  - Non-owner Faculty denied.
  - Cooldown, `account` rate limit, audit record, and safe errors.
- Public badge image download using the immutable issuance snapshot and local storage only.
- Printable PDF summary with badge name, issuer, issue date, status, verification URL, QR code, and explicit “human-readable summary” wording.
- Existing signed JSON-LD view/download preserved.
- Student activation and recovery token foundation:
  - SHA-256 token digests only,
  - short expiry,
  - single use,
  - generic public recovery response,
  - audit records without raw tokens.
- Email infrastructure readiness documentation.

## Security assessment

- No arbitrary remote image fetching; image and PDF routes use stored snapshot paths and validate image content.
- PDF/QR generation uses bounded input and no user-controlled templates.
- Notification resend is server-authorized and ownership-scoped for Faculty.
- SMTP secrets are environment-only and not logged.
- Local verification used Mailpit only.

## Test evidence

- Unit tests: 110 files / 779 tests PASS on Node 22.
- MariaDB integration: 17 files / 112 tests PASS.
- Playwright E2E: 43 passed, 3 skipped (mobile stateful single-use token fixtures), 0 failed.
- Live local verification: activation email in Mailpit, student activation/login, JSON/image/PDF downloads, administrator resend, new Mailpit delivery.

## Limitations

- Bounce/complaint webhook processing is not implemented.
- Delivery is at-least-once at the SMTP boundary.
- No provider-specific delivery confirmation beyond SMTP acceptance.
