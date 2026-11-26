# Stage 5F.7 Production Deployment Readiness

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production image:** `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`  
**Image created:** November 5, 2026  
**VM:** Production VM 130  
**Stage 5F.4 fix:** Locally tested, not deployed  
**Production changes by OpenCode:** None

## 1. Executive summary

Administrator evidence resolves the queue-safety question:

- notification deliveries: **0**
- delivery attempts: **0**
- unfinished `STARTED` attempts: **0**
- Proxmox VM 130 backup: **successful (TASK OK)** on 22 November 2026
- current worker remains unhealthy/stale
- production image predates/does not include the tested Stage 5F.4 fix

Queue/restart duplicate risk for the current empty state is therefore **low/none**. However,
restart-only recovery would re-run the same unfixed image and is not the preferred remediation.
**Deploy the corrected Stage 5F.4 worker image** once the remaining recovery evidence and approvals
are complete.

The VM backup is a **VM-level** success. It does not by itself prove a consistent MariaDB logical
backup, media integrity, configuration/secrets recovery, signing-key recovery, or a successful restore.
Those remain **BLOCKED** until verified.

## 2. Updated evidence

| Item                              | Result                       | Evidence                                        |
| --------------------------------- | ---------------------------- | ----------------------------------------------- |
| Production stack                  | PASS                         | NPM + Docker mapping (`hau_soc_badging_stage2`) |
| Production worker                 | PASS                         | `hau_soc_badging_stage2-worker-1`               |
| Current worker health             | FAIL                         | Unhealthy/stale heartbeat                       |
| Notification deliveries           | PASS — 0                     | Administrator query                             |
| Delivery attempts                 | PASS — 0                     | Administrator query                             |
| Unfinished STARTED attempts       | PASS — 0                     | Administrator query                             |
| Current duplicate risk            | PASS — none from empty queue | 0 deliveries/attempts                           |
| Proxmox VM 130 backup             | PASS — VM-level              | TASK OK, 22 Nov 2026                            |
| MariaDB application consistency   | BLOCKED                      | No logical/restore evidence                     |
| Media/config/signing-key recovery | BLOCKED                      | No evidence                                     |
| Production image includes fix     | NO                           | Image predates/not deployed                     |
| Restart-only recommendation       | NOT PREFERRED                | Same defect may recur                           |
| Corrected-image deployment        | RECOMMENDED                  | Locally tested fix                              |

## 3. MariaDB backup and recovery verification

### 3.1 Proxmox backup evidence to collect

The VM backup task success is necessary but not sufficient. Confirm the backup mode, guest-agent
consistency, storage, encryption, and retention.

```sh
# Identify the VM and backup job.
pvesh get /cluster/resources --type vm --output-format json | grep -E '130|socbadging'
qm config 130 | grep -E 'name|agent|scsi|virtio|memory|cores'

# List backups for VM 130.
pvesh get /nodes/<node>/storage/<storage>/content --content backup --vmid 130 --output-format json

# Inspect the successful task log/status.
pvesh get /nodes/<node>/tasks/<UPID>/status --output-format json
pvesh get /nodes/<node>/tasks/<UPID>/log

# Check scheduled backup job/mode/retention/encryption.
pvesh get /cluster/backup --output-format json
```

Record:

- VM ID/name;
- backup mode (`snapshot`, `suspend`, `stop`);
- guest-agent/fsfreeze usage;
- backup storage, encryption status, retention;
- task start/end, size, verification status.

A snapshot backup without application quiescing may be crash-consistent. MariaDB may recover, but that
must be proven on a restored clone, not assumed.

### 3.2 Production logical backup verification

```sh
cd /opt/socbadging
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/hau-soc/db-verify-$STAMP
sudo install -d -m 700 "$DEST"

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  if [ -n "${MARIADB_PASSWORD_FILE:-}" ] && [ -f "$MARIADB_PASSWORD_FILE" ]; then
    password="$(cat "$MARIADB_PASSWORD_FILE")"
  else
    password="${MARIADB_PASSWORD:-}"
  fi
  exec mariadb-dump --single-transaction --routines --triggers --hex-blob \
    -u"$MARIADB_USER" -p"$password" "$MARIADB_DATABASE"
' | sudo tee "$DEST/database.sql" >/dev/null

sudo sh -c "cd '$DEST' && sha256sum database.sql > SHA256SUMS"
sudo sh -c "cd '$DEST' && sha256sum -c SHA256SUMS"
```

Do not print the password or database URL.

### 3.3 Isolated MariaDB restore drill

Restore to a disposable project/VM, never production:

```sh
# Create a disposable restore target with separate volumes and a non-public port.
# Restore database.sql into the disposable MariaDB.
# Then compare:
docker compose -p <restore-project> exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT COUNT(*) FROM users;
    SELECT COUNT(*) FROM students;
    SELECT COUNT(*) FROM classes;
    SELECT COUNT(*) FROM badge_issuances;
    SELECT COUNT(*) FROM credential_status_lists;
    SELECT version FROM credential_status_lists WHERE id = '\''status-list-local'\'';
    SELECT COUNT(*) FROM credential_status_allocations WHERE is_revoked = 1;
    SELECT COUNT(*) FROM notification_deliveries;
    SELECT COUNT(*) FROM notification_delivery_attempts;
  "
'
```

Verify:

- restore completes without errors;
- row counts/checksums match the approved source snapshot;
- status-list versions/allocation bits are consistent;
- representative signed credentials still resolve and verify;
- no orphan foreign-key rows;
- MariaDB error log shows clean startup/recovery.

## 4. Media, configuration, and signing-key recovery

### 4.1 Media

```sh
docker volume inspect hau_soc_badging_stage2_media_data
sudo find /var/backups/hau-soc -maxdepth 2 -type f -name 'media.tar.gz' \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
sudo sh -c "cd <media-backup-dir> && sha256sum -c SHA256SUMS"
sudo tar -tzf <media-backup-dir>/media.tar.gz >/dev/null && echo media-archive-ok
```

Then resolve representative badge image paths from a restored database against the restored media.
Do not overwrite production media.

### 4.2 Configuration and secrets

```sh
sudo ls -l /etc/hau-soc /etc/hau-soc/secrets
sudo find /var/backups/hau-soc -maxdepth 2 -type f \
  \( -iname '*config*' -o -iname '*secret*' -o -iname '*.env*' \) \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
```

Confirm an encrypted, access-controlled vault/backup record with checksum and documented restore.
Do not cat/decrypt/print contents.

### 4.3 Signing-key recovery

```sh
SIGNING_BACKUP=/var/backups/hau-soc/signing-key-<timestamp>
sudo sh -c "cd '$SIGNING_BACKUP' && sha256sum -c SHA256SUMS"
sudo ls -l "$SIGNING_BACKUP"
```

Follow `docs/runbooks/open-badges-key-lifecycle.md` to decrypt into a restricted temporary location,
derive the public key/fingerprint, compare with registered metadata, and remove the temporary copy.
Never print or commit private material.

The Proxmox VM backup may contain the private signing key and production secrets on disk. Confirm the
VM backup storage is encrypted and access-controlled, and retain the separate encrypted signing-key
backup as the authoritative recovery copy.

## 5. Worker-only deployment of the Stage 5F.4 image

### 5.1 Prerequisites

- [ ] Written deployment approval and maintenance window.
- [ ] Queue/attempts confirmed 0 (currently PASS).
- [ ] VM 130 backup verified (currently PASS at VM level).
- [ ] MariaDB logical backup/restore verified.
- [ ] Media/config/signing-key recovery verified.
- [ ] Corrected worker image built, tested, scanned, and digest-approved.
- [ ] Original worker image ID/digest recorded for rollback.
- [ ] No schema migration required by the worker fix (confirmed: worker code/config only).
- [ ] Signing-key custody review remains separate; no key rotation during deployment.

### 5.2 Build and record the corrected image

On the approved build host:

```sh
cd "/path/to/approved/source"
docker build --target worker -t hau-soc-badging-worker:stage5f4-<approved-sha> .
docker image inspect hau-soc-badging-worker:stage5f4-<approved-sha> \
  --format 'id={{.Id}} created={{.Created}} digest={{json .RepoDigests}}'
```

Deliver by the approved registry or an integrity-checked image bundle. Do not use the restricted SSH
account for image transfer.

### 5.3 Production pre-deploy record

```sh
cd /opt/socbadging
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
WORKER=hau_soc_badging_stage2-worker-1
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo install -d -m 700 /var/tmp/socbadging-deploy-$STAMP

docker inspect "$WORKER" | sudo tee /var/tmp/socbadging-deploy-$STAMP/worker-before.json
ORIGINAL_IMAGE=$(docker inspect -f '{{.Image}}' "$WORKER")
printf '%s\n' "$ORIGINAL_IMAGE" | sudo tee /var/tmp/socbadging-deploy-$STAMP/original-image.txt
docker image tag "$ORIGINAL_IMAGE" hau-soc-badging-worker:pre-5f4
```

Expected original image:
`sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`.

### 5.4 Deploy only the worker

Create a reviewed override that pins the corrected worker image and leaves web/db/signer unchanged:

```yaml
# /opt/socbadging/worker-image.override.yaml
services:
  worker:
    image: hau-soc-badging-worker:stage5f4-<approved-sha>
```

Deploy without rebuilding or touching dependencies:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-image.override.yaml \
  up -d --no-deps --no-build worker
```

Do not use `--force-recreate` on web/db/signer. Confirm only the worker container changed.

### 5.5 Rollback override

```yaml
# /opt/socbadging/worker-rollback.override.yaml
services:
  worker:
    image: hau-soc-badging-worker:pre-5f4
```

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-rollback.override.yaml \
  up -d --no-deps --no-build worker
```

If the original image is missing, restore it from the approved image registry/bundle using the
recorded digest. Do not rebuild the old image from changed source unless approved.

## 6. Post-deployment validation

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
WORKER=hau_soc_badging_stage2-worker-1
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health

for i in $(seq 1 12); do
  date -u
  curl -fsS "$PROD_HEALTH_URL" || true
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$WORKER"
  sleep 5
done

docker logs --since=10m --tail=200 "$WORKER"
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=10m --tail=200 worker
```

Pass criteria:

- [ ] Worker cycles every ~5 seconds (`notification.worker.cycle`).
- [ ] Heartbeat fresh (≤300s; preferably ≤30s).
- [ ] `/api/health`: `notifications.status=ready`, `workerHeartbeat=fresh`.
- [ ] Docker health `healthy`.
- [ ] No `notification.worker.timeout`, `notification.worker.error`, or `stall_exit` recurrence.
- [ ] Queue remains 0 or processes safely; no unexpected mass failures.
- [ ] No duplicate provider message IDs or duplicate SENT attempts.
- [ ] Web/db/signer remain healthy; staging untouched.
- [ ] Corrected fix present (`worker-runtime.ts` + timeout env wired).

Post-deploy SQL:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, mail_status, recorded_at, TIMESTAMPDIFF(SECOND, recorded_at, UTC_TIMESTAMP()) AS age_seconds
    FROM operational_heartbeats WHERE id = '\''notification-worker'\'';
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT id, status, claim_expires_at FROM notification_deliveries WHERE status = '\''PROCESSING'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Monitor for 30 minutes, then 24 hours. If heartbeat goes stale or the worker exits repeatedly, roll
back the worker image and escalate.

## 7. Signing-key custody review (`staging-2026-11`)

Public evidence:

- Key ID: `https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11`
- Public multikey: `z6Mkggc2kqVvuj68G3aVvewPZbcv69GgDkQ8SuyyhYqgag8x`
- Trust state: ACTIVE
- Controller: `https://socbadging.hausoc.org/api/issuers/hau-soc`

Still BLOCKED:

- whether the name is only a label or indicates staging-generated key material;
- private-key custody/vault/backup evidence;
- whether the VM backup containing the key is encrypted/access-controlled;
- whether any historical staging key is reused in production.

Do not rotate during worker deployment. Resolve through
`PRODUCTION-ADMIN-VERIFICATION-CHECKLIST.md` section C. If provenance is uncertain, a separate approved
rotation is required; keep the old key RETIRED for historical verification unless compromise is proven.

## 8. Final pre-deployment checklist

| Item                                           | Status                      |
| ---------------------------------------------- | --------------------------- |
| Production stack/worker confirmed              | PASS                        |
| Queue/deliveries/attempts empty                | PASS — 0                    |
| Unfinished STARTED attempts                    | PASS — 0                    |
| Proxmox VM 130 backup                          | PASS — VM-level             |
| MariaDB logical backup + checksum              | BLOCKED                     |
| MariaDB isolated restore drill                 | BLOCKED                     |
| Media backup + restore verification            | BLOCKED                     |
| Configuration/secrets backup                   | BLOCKED                     |
| Signing-key recovery archive + fingerprint     | BLOCKED                     |
| VM backup encryption/access control            | BLOCKED                     |
| Corrected Stage 5F.4 image built/tested        | PASS — local                |
| Corrected image delivered/pinned to production | BLOCKED                     |
| Original worker image rollback recorded        | PASS — `sha256:dc083...`    |
| Worker-only deploy override reviewed           | BLOCKED — requires approval |
| Maintenance window/operator/rollback owner     | BLOCKED                     |
| Signing-key custody resolved/deferred          | BLOCKED / separate          |
| Post-deployment validation prepared            | PASS                        |
| Production deployment authorized               | NO                          |
| Production GO/NO-GO                            | **NO-GO**                   |

## 9. Required approvals

1. Approve MariaDB logical backup/restore drill and media/config/signing-key recovery evidence.
2. Approve the VM backup encryption/access-control posture.
3. Approve the corrected worker image digest and worker-only deploy override.
4. Approve the maintenance window, operator, and rollback owner.
5. Approve the restart/deployment and post-deployment monitoring plan.
6. Resolve or explicitly defer `staging-2026-11` custody; no rotation during this deployment.
7. Separately authorize production acceptance/Playwright testing.

## 10. GO/NO-GO

**Production GO/NO-GO: NO-GO.**

Queue safety is now resolved, and the VM-level backup is successful. Deployment is still blocked by
unverified MariaDB/media/config/signing-key recovery, backup encryption/access control, corrected-image
approval/delivery, and maintenance approvals.

**Recommended path:** complete the recovery drills, approve the corrected worker image, deploy only
`hau_soc_badging_stage2-worker-1`, then verify heartbeat, health, Docker status, queue movement, and
duplicate indicators. Restart-only is not preferred because it re-runs the unfixed image.

No production restart, deployment, database change, key change, email, DNS/proxy change, commit, or
push was performed.
