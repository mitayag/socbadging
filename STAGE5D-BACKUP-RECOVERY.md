# Stage 5D Backup and Recovery

**Date:** 5 November 2026  
**Staging backup/restore drill:** PASS  
**Production data deleted/modified:** No

## 1. What must be backed up

| Asset                  | Method                                            | Location                                         |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------ |
| MariaDB data           | `scripts/backup.sh` logical dump                  | Encrypted off-host backup store                  |
| Badge/credential media | `scripts/backup.sh` media archive                 | Same verified backup set as the DB               |
| Signing private key    | `scripts/backup-signing-key.sh` encrypted archive | Separate restricted vault/location               |
| Public key metadata    | Included optionally in the signing-key backup     | Separate vault                                   |
| Configuration/secrets  | Deployment secret store backup                    | Restricted vault, never in DB/media backup       |
| MariaDB binlogs        | Retained in `mariadb_binlogs` volume              | Host/volume snapshot or archived to backup store |

The signing key is deliberately not included in the DB/media backup set.

## 2. Create a production backup

Run on the Docker host from the reviewed release directory:

```sh
sudo install -d -m 700 /var/backups/hau-soc
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
./scripts/backup.sh \
  --project hau-soc-badging-prod \
  --output "/var/backups/hau-soc/backup-$STAMP"
./scripts/verify-backup.sh --input "/var/backups/hau-soc/backup-$STAMP"
```

The output contains `database.sql`, `media.tar.gz`, `backup.properties`, and `SHA256SUMS`. The SQL
dump contains private data; encrypt it at rest and restrict access.

## 3. Create the separate signing-key backup

```sh
sudo ./scripts/backup-signing-key.sh \
  --input /etc/hau-soc/secrets/signing_key \
  --output "/var/backups/hau-soc/signing-key-$STAMP" \
  --passphrase-file /etc/hau-soc/backup-passphrase \
  --public-metadata /absolute/secure/path/key-public-metadata.json
```

Store the passphrase separately from the encrypted archive. Never store the key or passphrase in the
repository, database, media volume, or logs.

## 4. Restore drill

Restore is restricted to a target whose project name is explicitly confirmed as disposable:

```sh
./scripts/restore.sh \
  --project hau_soc_restore_drill \
  --input /var/backups/hau-soc/backup-20261105T010000Z \
  --confirm-disposable hau_soc_restore_drill
```

Stage 5D staging evidence:

- a synthetic audit row inserted after the backup was absent after restore;
- the seeded Administrator and status list were restored;
- a media marker file inserted after the backup was removed by restore;
- backup checksums verified before restore.

After restore, start the restored web/worker, verify `/api/health`, public status list, a canary
credential, and media resolution. Never apply `restore.sh` directly to production; use a reviewed
incident procedure with an approved maintenance window.

## 5. Point-in-time recovery assessment

Production Compose enables MariaDB binary logging:

- `--log-bin`
- `--binlog-format=ROW`
- `--server-id=1`
- `--max-binlog-size=256M`
- `--expire-logs-days` default `14`

The volume `mariadb_binlogs` persists binlogs. PITR is **feasible** after:

1. a verified full logical/physical base backup;
2. archived binlogs shipped off-host continuously; and
3. a tested `mariadb-binlog` replay procedure into a disposable restore target.

Stage 5D did **not** implement off-host binlog shipping. Until it is added, binlogs on the same VM do
not protect against host loss. Current realistic RPO remains the daily backup interval.

## 6. Retention policy

| Asset                         | Recommended retention                          | Rationale                                  |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Daily DB/media backups        | 30 days                                        | Operational rollback and incident recovery |
| Weekly DB/media backups       | 90 days                                        | Longer recovery window                     |
| Monthly DB/media backups      | 1 year                                         | Institutional record policy                |
| Signing-key encrypted backups | 365 days or institutional key-retention policy | Historical verification and key recovery   |
| Binlogs                       | 14 days minimum, shipped off-host              | PITR window                                |
| Audit/credential history      | Per institution retention policy               | Immutable credential and audit records     |

Do not delete the 27 quarantined legacy test-artifact issuances without explicit approval.

## 7. RPO/RTO recommendations

| Scenario                                   | Recommended RPO             | Recommended RTO             |
| ------------------------------------------ | --------------------------- | --------------------------- |
| Application/worker failure                 | 0 (outbox persists)         | 15–30 minutes               |
| Database corruption with daily backup only | Up to 24 hours              | 2–4 hours                   |
| Database with off-host binlog shipping     | 5–15 minutes                | 2–4 hours                   |
| Signing-key loss with vault backup         | No key loss if vault intact | 1–2 hours to restore signer |
| Media volume loss                          | Matches last backup         | 1–2 hours                   |

## 8. Rollback procedure

1. Stop web and worker to freeze writes and sends.
2. Record release version, migration state, and incident start time.
3. Restore the verified DB and matching media archive to a disposable target first; validate.
4. For application rollback, deploy the prior image digests. The Stage 5C.1 suppression migration is
   additive and can remain in place.
5. Do not drop `recipient_suppressions` or delete historical credentials without approval.
6. Start signer, web, and worker; verify `/api/health`, status list, queue state, and a controlled
   canary.
7. Record RPO/RTO actually achieved and all operator actions.

## 9. Verification checklist

- [ ] Backup directory permissions and encryption approved.
- [ ] Checksums verified before and after transport.
- [ ] DB row/public-ID/credential checksum comparisons recorded.
- [ ] Media references resolve on the restored app.
- [ ] `/api/health` ready and worker heartbeat fresh.
- [ ] Public status list proof verifies externally.
- [ ] Signing key backup decrypts and public fingerprint matches.
- [ ] Restore target explicitly disposable; no production overwrite.
