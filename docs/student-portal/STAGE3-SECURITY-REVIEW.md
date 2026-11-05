# Stage 3 Security Review

## Access isolation

- `/student/badges/:issuanceId` is guarded in `proxy.ts` before page rendering.
- The guard verifies the session, STUDENT role, active status, and `StudentAccount.studentId` ownership.
- Cross-student access returns HTTP 404 with generic HTML and no credential data.
- Staff APIs return 403 for STUDENT sessions and do not include student PII.
- Public credential verification remains anonymous and unaffected.

## Dependency audit

Safe upgrades:

- `next@16.4.3`
- `nodemailer@10.3.1`
- `zod@4.6.7`
- Prisma client/toolchain/adapter `7.10.1`

Result: **0 critical, 0 high, 7 moderate**.

Remaining moderate chain:

- `exceljs` → `archiver`, `archiver-utils`, `glob`, `minimatch`, `readdir-glob`, `zip-stream`

Runtime impact:

- Used by authenticated XLSX roster and batch issuance import/export.
- Inputs are bounded to 2 MiB and 5,000 rows.
- Only authorized Faculty/Administrators can access the import/export surfaces.
- No safe upstream fix without a breaking ExcelJS change; deferred and documented.

Compensating controls:

- Strict authorization and ownership checks.
- File size/extension/content validation.
- Bounded row/cell payloads.
- CSV/XLSX formula neutralization.
- No arbitrary filesystem paths.

## Email hardening

- Outbox unique constraint prevents duplicate notification rows.
- Worker claims use lease tokens and conditional updates.
- Resend has cooldown, rate limit, audit, and ownership checks.
- `SENT` explicitly means SMTP accepted, not inbox delivery.
- At-least-once delivery is documented.
- Bounce/complaint contract defines strict validation, idempotency, suppression, and replay protection.
- No provider-specific webhook/signature implementation exists yet; this remains a production blocker.

## Residual risks

- No production SMTP provider, SPF/DKIM/DMARC, or bounce processing configured.
- Remaining moderate ExcelJS dependency chain.
- Direct SMTP for activation/recovery emails (not outbox-backed).
- Local Mailpit does not forward to real inboxes.
- No wallet API/OAuth or social account linking.
