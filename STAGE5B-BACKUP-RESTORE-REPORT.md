# Stage 5B Backup and Restore Report

**Date:** 4 November 2026  
**Result:** PASS — backup restored into an isolated database with matching counts and checksums

## 1. Backup

Commands used (executed inside the local MariaDB container; credentials were supplied through
container environment variables and were not printed):

- Full logical backup: `mariadb-dump --single-transaction --routines --triggers --events --databases "$MARIADB_DATABASE"`
- Restore-safe table dump: same options without `--databases`, so it contains no `CREATE DATABASE`/`USE` for the production-like schema.
- Backup files (not in the repository, read-only restricted):
  - `storage/stage5b/app-backup.sql` — 228,428 bytes, 30 tables (full backup)
  - `storage/stage5b/app-tables.sql` — 228,249 bytes, restore-safe table dump
- The backup includes users, students, classes, badge templates, issuances, signed credential
  JSON, signing-key public metadata, credential status lists and allocations, notification
  deliveries, audit logs, sessions, and all other application tables.
- The backup does **not** include the signer private-key file, the Docker media volume, or
  external email-provider state.

## 2. Restore rehearsal

- Target: isolated disposable database `badging_stage5b_restore`.
- Source: restore-safe table dump.
- Restore exit status: success.
- Restore time: approximately **0.67 seconds** for the local dataset.
- The application database was not used as a restore target.

## 3. Integrity verification

Exact row counts matched for:

| Table                         | Source | Restore |
| ----------------------------- | -----: | ------: |
| users                         |     37 |      37 |
| students                      |     49 |      49 |
| student_accounts              |      1 |       1 |
| classes                       |     36 |      36 |
| class_students                |     22 |      22 |
| badge_templates               |     38 |      38 |
| badge_issuances               |     36 |      36 |
| notification_deliveries       |     10 |      10 |
| signing_keys                  |     24 |      24 |
| credential_status_lists       |     20 |      20 |
| credential_status_allocations |      9 |       9 |
| audit_logs                    |    138 |     138 |

`CHECKSUM TABLE` matched between source and restore for users, students, issuances, signing
keys, status lists, status allocations, notification deliveries, and audit logs.

Restored relationship checks returned zero orphans for:

- student accounts missing users;
- issuances missing classes or students;
- status allocations missing issuances.

Restored credential dependencies:

- 9 signed credentials;
- 27 malformed legacy records;
- 1 ACTIVE signing key;
- 1 signed status list with allocations.

## 4. Recovery limitations

- **Private signing key is not in the database backup.** The signer key file must be backed up
  and restored separately with the signing-key lifecycle runbook.
- **Media storage is not in the database backup.** Badge artwork in the Docker media volume
  must be backed up separately.
- **Sessions are included.** Restoring an old backup may resurrect sessions; invalidate
  sessions after any production restore.
- **Rate-limit buckets are included.** Restoring recent buckets may temporarily throttle
  users; clear or expire them after restore as appropriate.
- **No point-in-time recovery.** The current rehearsal uses logical dumps only. Production
  needs a documented RPO/RTO and tested binary-log/PITR or snapshot strategy.
- **Restore timing is local-only.** The 0.67-second restore is not a production RTO estimate.
- **Provider state is external.** Email webhook/provider status is not fully represented in
  the database backup.

## 5. Verdict

**Backup/restore: PASS** for the local dataset. The backup preserves record counts,
relationships, signed credential data, signing-key metadata, status lists, and audit history.
Production recovery still requires private-key, media, and provider-state procedures.
