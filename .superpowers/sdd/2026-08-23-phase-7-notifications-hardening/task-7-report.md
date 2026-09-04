# Task 7 Report — Backup, Restore, Structured Operations, and Health

## Implemented

- Explicit-path MariaDB and media-volume backup with checksum manifest and restrictive artifact
  permissions.
- Backup verification for required artifacts, format marker, SHA-256 checksums, and media archive
  readability.
- Restore safeguards requiring an absolute input path and exact disposable Compose-project
  confirmation before database/media mutation.
- Structured one-line JSON logging with recursive redaction for email, SMTP/auth credentials,
  passwords, tokens, message content, private credential/snapshot data, and email-like text.
- Trusted log envelope fields that callers cannot overwrite; operational event IDs, statuses,
  counts, and error categories remain available.
- Database-backed web readiness, persisted notification-worker heartbeat, and separate degraded
  mail status. SMTP/worker degradation does not falsely mark credential issuance unavailable.
- Worker cycle logs, graceful error continuation, heartbeat updates, and Compose process health.
- Production and backup/restore runbooks plus updated README deployment guidance.

## Requirement Mapping

- P1 backup/restore automation and stronger operational monitoring.
- FR-012/FR-013: public IDs and credential/media records are preserved and compared during restore.
- FR-020: audit records are included in database backup/restore verification.
- Security and privacy: backup target safeguards, checksum integrity, secret/private-log redaction,
  and no configuration values in health output.
- Non-functional requirements: structured logs, health endpoint, persistent Docker volumes,
  migrations, automated tests, and documented operation.
- Acceptance criterion 1: disposable Compose build/migrate/start and persistence across service
  restarts were demonstrated.

## TDD Evidence

- Structured-log tests initially failed because the module was absent; redaction and envelope
  integrity were implemented only after RED observations.
- Health tests initially received the old two-field response and the route returned HTTP 200 on
  database failure; readiness/degradation semantics were implemented after RED.
- Heartbeat integration initially failed type checking because the module/model did not exist; the
  migration and service followed.
- The backup/restore harness initially failed at the missing backup script, then passed after the
  guarded utilities were implemented.
- Docker acceptance exposed a standalone-worker crash caused by a Next.js-only `server-only`
  marker. Root-cause removal was followed by a successful rerun.

## Verification Evidence

- Fresh MariaDB: all 11 migrations deployed; 8 integration files and 33 tests passed.
- Representative backup/restore: user, class, student, issuance, notification, audit, opaque public
  ID, and media content matched after restore; invalid confirmation was rejected; disposable
  project/volumes were removed.
- Full Compose: database, migration, web, worker, media initialization, and Mailpit started healthy;
  web health reported ready/fresh; database and media persisted across database/worker/web restart;
  inspected logs did not contain the test database credential or private field names; disposable
  project/volumes were removed.
- Shell syntax and backup/restore harness: passed.
- Format, lint, TypeScript, full unit/route/component tests, production build, and dependency audit:
  passed in the final verification cycle.

## Review

Independent delegation was not authorized. Exact-file self-review found and removed the worker’s
incompatible Next.js-only module marker and protected structured-log envelope fields from caller
override. Destructive restore behavior is limited to the explicitly confirmed target project’s
database and media volume; no running application database was used by acceptance tests.

## Remaining Phase 7 Scope

Task 8 retains accessibility/volume testing, expanded Phase 7 E2E, final Docker acceptance,
traceability, known limitations, and final Phase 7 review. Open Badges signing, conformance, and
wallet interoperability remain Phase 8.
