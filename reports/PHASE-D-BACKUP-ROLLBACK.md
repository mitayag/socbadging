# Phase D — Backup and Rollback Validation

**Date:** 24 November 2026  
**Production changes:** None  
**Backup/key contents exposed:** None

## 1. Status

| Item                                       | Status                 | Evidence                                              |
| ------------------------------------------ | ---------------------- | ----------------------------------------------------- |
| Proxmox VM backup                          | PASS (historical)      | Prior administrator evidence, TASK OK                 |
| MariaDB logical backup/restore             | PASS (historical)      | Prior isolated restore evidence                       |
| Media backup                               | PASS (historical)      | Prior checksum/archive evidence                       |
| Current backup timestamps                  | **BLOCKED**            | No privileged host/backup access in this workflow     |
| Separate encrypted signing-key backup      | **DEFERRED / BLOCKED** | Accepted residual risk; not independently restorable  |
| Off-host binlog/PITR                       | **BLOCKED**            | Not verified                                          |
| Web rollback image                         | PASS                   | `socbadging-web:rollback-20261123` / `f80a9d4b...`    |
| Worker rollback image                      | PASS                   | `socbadging-worker:rollback-20261123` / `dc083f41...` |
| Migration requirement                      | NONE                   | Stage 6B has no Prisma/migration changes              |
| Schema compatibility                       | PASS in source         | 21 migrations; runtime uses existing columns          |
| Production schema ledger                   | BLOCKED                | Requires read-only DB inspection                      |
| Maintenance window/operator/rollback owner | BLOCKED                | Not supplied                                          |

## 2. Rollback images

```text
socbadging-web:rollback-20261123
sha256:f80a9d4bdb87779c650c81b8493d0e6723f26294072e9eccd1e45bbcbd089205

socbadging-worker:rollback-20261123
sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914
```

Verify without changing services:

```sh
docker image inspect socbadging-web:rollback-20261123 --format '{{.Id}} {{.Architecture}}'
docker image inspect socbadging-worker:rollback-20261123 --format '{{.Id}} {{.Architecture}}'
```

## 2.1 Why `latest_backup=NONE_FOUND`

The original inspection searched only for directories named `backup-*`. The November 22 artifacts may
use a timestamp/other directory name, or may be stored below another path. This was a false negative
in the inspection script, not proof that backups are absent.

The corrected inspection searches for the artifact files themselves (`SHA256SUMS`, `database.sql`,
`media.tar.gz`, `signing-key.tar.gz.enc`), derives the containing backup directory, runs
`verify-backup.sh` when available, and checks the media archive. It remains read-only.

## 2.2 Create and verify a current backup

This is a production read/write operation because it creates backup files; obtain approval and a
maintenance window. Do not overwrite an existing backup directory.

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/var/backups/hau-soc/backup-$STAMP
sudo /opt/socbadging/scripts/backup.sh \
  --project hau_soc_badging_stage2 --output "$OUT"
sudo /opt/socbadging/scripts/verify-backup.sh --input "$OUT"
```

`backup.sh` writes a mode-700 directory containing `database.sql`, `media.tar.gz`,
`backup.properties`, and `SHA256SUMS`, files mode 600. The database dump contains private data; it is
not encrypted by that script. Store the backup set in an encrypted/access-controlled vault and record
its SHA-256 and retention date.

## 2.3 Signing-key backup and verification

The signing key is intentionally excluded from DB/media backups. Use the approved passphrase file
stored separately from the archive:

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/var/backups/hau-soc/signing-key-$STAMP
sudo /opt/socbadging/scripts/backup-signing-key.sh \
  --input /etc/hau-soc/secrets/signing_key \
  --output "$OUT" \
  --passphrase-file /path/to/approved/offline-passphrase-file
sudo sh -c "cd '$OUT' && sha256sum -c SHA256SUMS"
sudo ls -l "$OUT"
```

Do not print the passphrase or key. A full recovery drill must decrypt into an isolated directory,
derive the public fingerprint, load the key into a disposable signer, and compare against the
registered public metadata. Do not overwrite production key material. This evidence is still
**BLOCKED** until the approved passphrase/custody path is supplied.

## 3. Schema compatibility

- Stage 6B web/worker changes do not add migrations.
- Runtime worker changes read existing snapshot and heartbeat columns.
- Production has 21 migrations in the source chain.
- Do not run `migrate` for this recovery.
- Do not restore the database for an application/worker configuration rollback.

Read-only production check:

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  "
'
```

Expected: `0`.

## 4. Queue safety before worker recovery

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT delivery_channel, status, COUNT(*) FROM notification_deliveries GROUP BY delivery_channel, status;
    SELECT COUNT(*) FROM notification_delivery_attempts WHERE outcome = '\''STARTED'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
      WHERE provider_message_id IS NOT NULL
      GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Start the worker only when there are **0 pending/retry/processing rows, 0 unfinished STARTED attempts,
and no duplicate provider IDs**.

## 5. Rollback procedure

### Web

```yaml
services:
  web:
    image: socbadging-web:rollback-20261123
```

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml \
  -f /var/tmp/socbadging-stage6b-web-rollback.yaml \
  up -d --no-deps --no-build web
```

### Worker

```yaml
services:
  worker:
    image: socbadging-worker:rollback-20261123
```

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml \
  -f /var/tmp/socbadging-stage6b-worker-rollback.yaml \
  up -d --no-deps --no-build worker
```

Do not restart db, signer, or migrate. Do not restore data. Preserve logs and queue records.

## 6. Blocking requirements

- Current production DB/media/key backup checksums and restore evidence.
- Separate signing-key recovery evidence or explicit acceptance of the residual risk.
- Named operator, maintenance window, rollback owner, and explicit worker-start approval.
- Read-only production schema/queue inspection.

No backup was created, restored, overwritten, or exposed in this phase.
