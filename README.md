# HAU SOC Badging System

HAU School of Computing’s Dockerized badging MVP. Administrators manage Faculty access; Faculty manage classes, rosters, badge templates, and individual or validated batch credential issuance.

Issued credentials are immutable historical records. Phase 8 credentials use signed Open Badges
3.0-aligned JSON-LD and interoperable revocation status lists. Legacy unsigned credentials remain
available without being presented as cryptographically verified. This product is **not Open Badges
certified**.

## Local setup

1. Copy `.env.example` to `.env` and replace every example database and bootstrap credential with a unique value.
2. Start MariaDB: `docker compose up -d db`.
3. Generate the client and apply migrations: `npm run db:generate && npm run db:migrate`.
4. Set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in your local environment, then bootstrap the first Administrator: `npm run db:seed`. The command is idempotent and refuses passwords shorter than 14 characters.
5. Start the app: `npm run dev`.

Never commit `.env` or real administrator credentials. After the initial bootstrap, an Administrator creates Faculty accounts through the authenticated application.

## Issuer configuration

Set these non-secret values in `.env` before issuing credentials:

- `APP_URL` — canonical application URL, used for credential and verification identifiers.
- `ISSUER_NAME` — defaults to `Holy Angel University — School of Computing`.
- `ISSUER_URL` — optional canonical issuer URL; blank defaults to `APP_URL`.
- `ISSUER_LOGO_PATH` — safe root-relative logo path; defaults to `/images/hausoclogo.png`.

Issuer values are snapshotted when a credential is issued, so later configuration or badge-template changes do not rewrite issued history. Validated Administrator issuer settings are used by future individual and batch issuances, while existing credential snapshots remain unchanged. An Administrator can manage the current public issuer name, canonical URL, logo path, support contact, and sharing visibility at `/settings`; settings and sensitive activity are available from `/audit-logs` without exposing raw audit context or network identifiers.

## Issuance routes

Authenticated users can access:

- `/classes/:classId/issued` — Faculty issue one active class badge to one actively enrolled student and view that class’s records; Administrators have read-only records access.
- `/classes/:classId/issued` also contains the Faculty-only batch wizard and role-scoped batch history. Faculty can download CSV/XLSX templates, map columns, review a stored validation preview, explicitly confirm the ready rows, and download validation/result reports. Administrators can inspect history, results, and reports but cannot preview or commit batches.
- `/issuance-batches/:batchId` — role-scoped batch result with row dispositions and credential links.
- `/issued` and `/issued/:issuanceId` — role-scoped issuance records and authenticated credential detail.
- `/api/issued/:issuanceId/credential` — authenticated `application/ld+json` download.
- `/api/issued/export` and `/api/classes/:classId/issued/export` — authenticated, role-scoped CSV exports.

Batch uploads accept `.csv` and `.xlsx` files up to 2 MiB and 5,000 data rows. Student Number is required; Email is an optional identity cross-check. A stored preview expires after 30 minutes. Only `READY` rows are committed; invalid rows remain excluded and reportable, while already-issued rows are handled idempotently.

## Public verification, sharing, and revocation

Each issued credential has an opaque public verification URL at `/credentials/:publicId`. The public page remains available for active, expired, and revoked credentials while showing the current lifecycle status. It exposes only the recipient's first name plus last initial; it never displays the recipient email, student number, internal issuance ID, roster data, or administrative audit data.

Anonymous visitors can view or download the privacy-safe `application/ld+json` representation at `/api/credentials/:publicId` and `/api/credentials/:publicId/download`. New Phase 8 credentials contain an EdDSA Data Integrity proof and a signed Bitstring Status List reference; the public verifier validates the persisted issuer key, proof, and current revocation status. Legacy credentials remain available but are clearly identified as lacking cryptographic proof. Public credential HTML and JSON routes use `private, no-store` cache behavior and a MariaDB-backed shared rate limit. Forwarding headers are ignored unless `TRUST_PROXY=true`; enable it only behind a trusted proxy that overwrites `X-Forwarded-For`.

When sharing is enabled in System Settings, visitors can copy the verification URL and use native share (when supported), LinkedIn, Facebook, X, or their email client. Email sharing only opens a `mailto:` composition link; it does not send SMTP notification email.

Active Administrators can revoke any credential. Active Faculty can revoke only credentials in classes they currently own. Revocation requires a reason, preserves the immutable credential snapshot and issuance history, updates the public status immediately, and writes one audited `badge.revoked` event. Repeating a completed revocation is idempotent and does not add another audit record.

## Docker deployment

Configure the signing values in `.env`, including an explicit host path to a mode-`0600` private
key file, before starting the production stack. Run `docker compose up --build -d`. Compose starts
the internal-only signer with its read-only named secret and starts web only after signer readiness
passes. Run the initial seed separately with `docker compose --profile tools run --rm seed`.

Persistent named volumes are `mariadb_data` and `media_data`. Back up both before production changes. No secret belongs in source control. Enable provider-neutral notification delivery with `docker compose --profile notifications up -d worker mailpit` for local development, or configure an external SMTP provider and start the worker in production.

`GET /api/health` reports database, signer, and notification-worker state. Database or signer
failure returns HTTP 503; signer health contains only status, key ID, and cryptosuite. Notification
degradation does not take an otherwise ready web application out of service.

## Recipient email notifications

Individual issuance, newly created rows from batch issuance, and revocation enqueue durable email jobs in the same MariaDB transaction as the credential change. The separate worker sends provider-neutral SMTP messages containing the badge name and public verification URL. SMTP outages do not roll back issuance or revocation; bounded retries and safe diagnostics remain visible to Administrators at `/notifications`. Faculty see delivery status only for credentials in classes they currently own. Recipient addresses are masked in the Administrator list and are never written to structured logs.

For local delivery inspection, enable the `notifications` Compose profile and use Mailpit. Production deployments should set the documented `SMTP_*` variables to their provider and run the worker as a separate process. Notification delivery is asynchronous: a successfully issued credential can temporarily show Pending or Retry Scheduled while SMTP recovers.

Backup, restore, deployment, health, logging, and incident procedures are documented in [the production runbook](docs/operations/production-runbook.md) and [the backup/restore runbook](docs/operations/backup-restore-runbook.md). Restore is intentionally restricted to a target explicitly confirmed as disposable.

Signing-key generation, activation, rotation, retirement, compromise response, and separate backup
are documented in [the key lifecycle runbook](docs/runbooks/open-badges-key-lifecycle.md). Final
HTTPS deployment, external retrieval, official-suite submission, and certification wording are in
[the production activation runbook](docs/runbooks/open-badges-production-activation.md).

## Quality gates

Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit`, `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build`, and `docker compose up --build -d --wait` followed by a health check at `/api/health`.

### MariaDB integration and browser E2E tests

The transaction integration suite is intentionally opt-in and runs from the Compose network. Start the database and execute the tools-image profile with a disposable test database URL:

```text
MARIADB_DATABASE=badging MARIADB_USER=badging MARIADB_PASSWORD=smoke-db-password MARIADB_ROOT_PASSWORD=smoke-root-password DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging TEST_DATABASE_URL=mysql://badging:smoke-db-password@db:3306/badging APP_URL=http://localhost:3000 npm run test:integration:docker
```

`TEST_DATABASE_URL` is required by `npm run test:integration`, which prevents the suite from silently using an application or production database URL.

The checked-in Playwright regression suite creates, uses, and removes its own random-password fixture users and credential records. It restores the previous issuer settings after the run. Compose binds MariaDB only to `127.0.0.1:3307` for this purpose; do not use this command against production data. With the disposable local Compose database running, run:

```text
E2E_CONFIRM_DISPOSABLE_DATABASE=true TEST_DATABASE_URL=mysql://badging:<local-test-password>@127.0.0.1:3307/badging npm run test:e2e
```

The test command starts a temporary app at `http://127.0.0.1:3100` and exercises signed individual and previewed batch issuance, proof and status-list verification, tamper/expiration/replacement/legacy states, signer outage recovery, anonymous privacy behavior, public headers/rate limiting, Faculty revocation and notification status, Administrator signing settings, responsive two-line branding, and non-owner authorization at desktop and 390×844 mobile viewports. It refuses to run until the explicit disposable-database confirmation is supplied.

Current requirement mappings and Phase 8 evidence are recorded in [the traceability matrix](docs/TRACEABILITY.md) and [local readiness report](docs/conformance/open-badges-3-local-readiness.md). Production HTTPS activation and official 1EdTech conformance submission remain external milestones; local readiness does not make this product certified. Phase 7 history remains in [the Phase 7 matrix](docs/traceability/phase-7-matrix.md), and operational boundaries remain in [known limitations](docs/operations/known-limitations.md).

## Security boundaries

Role-aware navigation is presentation only. Protected server pages resolve the current database account and require active status. Server-only policies enforce role checks; Faculty must never be authorized for Administrator-only services.

Public verification is intentionally separate from authenticated issuance detail. The public server-side DTO and JSON-LD projection exclude private roster and account fields; malformed, missing, inaccessible, and corrupt public credentials use the same not-found response. The public rate limiter rejects before database-heavy lookup and does not reveal whether a credential exists.
