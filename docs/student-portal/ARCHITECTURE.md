# Student Portal Architecture

## Current baseline

- Next.js 16.4.3 App Router, React 19.2.8, TypeScript, Tailwind/global design tokens.
- MariaDB through Prisma 7.9.1 with the MariaDB adapter.
- Custom database-backed sessions using `users`, `sessions`, Argon2id password hashes, and HTTP-only cookies.
- Existing roles: `ADMIN`, `FACULTY`.
- Existing student records: `students` and `class_students`; students do not have user accounts.
- Issued credentials: `badge_issuances` with immutable recipient/achievement/issuer snapshots and signed JSON-LD.
- Signing/status: `signing_keys`, `credential_status_lists`, `credential_status_allocations`.
- Public verification: `/credentials/:publicId`, `/api/credentials/:publicId`, JSON-LD download, sharing.
- Notifications: transactional outbox (`notification_deliveries`) and a separate SMTP worker using Nodemailer; local development uses Mailpit.
- Design: light blue/white academic SaaS tokens, shared `AppShell`, sidebar navigation, responsive breakpoints at 820px.

## Proposed student architecture

### Identity and accounts

- Add `STUDENT` to the `Role` enum.
- Add `StudentAccount` linking one `User` to one existing `Student`.
- Add `StudentToken` for hashed, short-lived, single-use activation and recovery tokens.
- Activation verifies email ownership by delivering a token link to the student's registered email.
- Recovery uses the same token model and always returns a generic response.
- Student sessions reuse the existing `sessions` table and cookie.
- Students never receive faculty or administrator privileges.

### Authorization boundaries

- Add `requireStaff` and `requireStudent` policies.
- Update all staff read services that currently treat any non-Faculty actor as an Administrator so `STUDENT` cannot read classes, rosters, issuances, batches, or notifications.
- Student services scope every query by the authenticated `StudentAccount.studentId`.
- Public verification remains anonymous and separate from private student data.

### Student portal routes

- `/student` — overview and metrics.
- `/student/badges` — wallet collection with search/filter.
- `/student/badges/:issuanceId` — private credential detail.
- `/student/notifications` — recipient-scoped issuance notification history.
- `/student/profile` — identity, verified email, security links.
- `/student/help` — access and sharing help.
- `/student/activate/:token` — account activation.
- `/student/recover` and `/student/recover/:token` — recovery request and reset.

### Notification enhancements

- Extend `notification_deliveries` with optional badge image URL and expiration metadata.
- Render branded HTML and text email with badge artwork, issuer, badge name, issue date, expiration when present, support contact, and public verification URL.
- Add authorized resend for Administrators and owning Faculty, with cooldown, rate limiting, audit records, and safe failure handling.
- Keep the transactional outbox and worker; do not send email inside the issuance transaction.

### Downloads

- Public image endpoint returns only locally stored badge artwork for the credential's immutable snapshot.
- PDF endpoint renders a human-readable summary with badge name, issuer, issue date, status, verification URL, and QR code.
- JSON-LD remains the authoritative signed credential export.
- PDF and image endpoints are rate-limited and never fetch arbitrary remote files.

## Security invariants

- No public endpoint reveals whether an email/student account exists.
- Recovery and activation tokens are stored only as SHA-256 digests and are single-use.
- Student detail and download routes verify `studentId` ownership server-side.
- Public exports exclude email, student number, internal IDs, roster data, and private audit context.
- No real email is sent in local development; Mailpit is the default transport.
- No production deployment or external provider connection is part of this work.
