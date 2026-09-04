# Backup and Restore Runbook

## Scope

The checked-in utilities back up MariaDB and the Compose media volume together. They require an
explicit Compose project and absolute directory. They never infer a destination, overwrite an
existing backup directory, or restore without an exact disposable-project confirmation.

## Create and verify a backup

Run from the repository root on a host with Docker Compose, `shasum` (or the platform equivalent),
and permission to read the project’s containers and volumes:

```sh
./scripts/backup.sh --project hau-soc-badging --output /absolute/secure/path/backup-2026-08-23
./scripts/verify-backup.sh --input /absolute/secure/path/backup-2026-08-23
```

The output contains `database.sql`, `media.tar.gz`, `backup.properties`, and `SHA256SUMS`. Store the
directory encrypted with access controls appropriate for student and credential data. The SQL dump
contains private data even though application logs do not.

## Restore drill

Create a clean, isolated Compose project with its own ports, credentials, and volumes. Start its
database and media initialization services, then restore only after confirming the exact project
name:

```sh
./scripts/restore.sh \
  --project hau_soc_restore_drill \
  --input /absolute/secure/path/backup-2026-08-23 \
  --confirm-disposable hau_soc_restore_drill
```

The restore verifies checksums before changing the target, imports MariaDB, clears only the
confirmed target project’s media volume, and extracts the media archive. Never use the restore
command against production directly. Validate on a disposable target, schedule an approved outage,
and use a reviewed recovery procedure for a production incident.

## Verification checklist

- Run `verify-backup.sh` before and after transport.
- Compare counts for users, classes, students, badge issuances, notification deliveries, and audits.
- Compare representative opaque public IDs and credential JSON checksums.
- Resolve representative `image_path`/media references through the restored web service.
- Start the restored web and worker, then verify `/api/health` reports database readiness and a
  fresh worker heartbeat.
- Record backup time, operator, source release, restore target, results, and deletion date.

The automated disposable drill is `sh scripts/backup-restore.test.sh`. It creates and removes its
own Compose project and verifies representative users, classes, students, issuances, notifications,
audits, public IDs, and media content.
