# Production Administrator Verification Checklist

**Purpose:** Read-only verification of production worker health, signing-key classification, and
backup evidence before production acceptance testing.  
**Target:** `https://socbadging.hausoc.org` / `badging-server`  
**Do not cat, decrypt, export, or print private keys, secrets, passwords, or tokens.**

## A. Access and status

- [ ] `ssh -T badging-server` succeeds and prints restricted status.
- [ ] `/api/health` returns HTTP 200.
- [ ] Record database, signer, notification status, and UTC timestamp.
- [ ] Confirm the restricted account still has no unrestricted shell/sudo/forwarding.

## B. Notification worker diagnosis

### B1. Container state and health

```sh
docker compose -p hau-soc-badging-prod ps worker
WORKER_ID=$(docker compose -p hau-soc-badging-prod ps -q worker)
docker inspect "$WORKER_ID" --format \
  'status={{.State.Status}} running={{.State.Running}} started={{.State.StartedAt}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
docker inspect "$WORKER_ID" --format '{{json .State.Health}}'
```

- [ ] Container exists, status, restart count, and health recorded.
- [ ] If health is `unhealthy`, capture the last health-check output.
- [ ] Do not restart the worker.

### B2. Worker logs

```sh
docker compose -p hau-soc-badging-prod logs --since=60m --tail=300 worker
```

- [ ] Look for `notification.worker.cycle`, `notification.worker.error`,
      `notification.worker.stopped`, SMTP timeouts, DB errors, or crash loops.
- [ ] Confirm whether cycles are still occurring.
- [ ] Do not print message bodies/recipient PII.

### B3. Heartbeat timestamp and queue state

```sh
docker compose -p hau-soc-badging-prod exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, mail_status, recorded_at, TIMESTAMPDIFF(SECOND, recorded_at, UTC_TIMESTAMP()) AS age_seconds
    FROM operational_heartbeats WHERE id = '\''notification-worker'\'';
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT MAX(started_at) AS last_attempt_started FROM notification_delivery_attempts;
    SELECT MAX(occurred_at) AS last_event_occurred FROM notification_delivery_events;
  "
'
```

- [ ] Heartbeat age is ≤300 seconds for fresh.
- [ ] Queue status counts recorded.
- [ ] Last attempt/event timestamps recorded.
- [ ] If heartbeat age >300s, the worker is stalled/stopped even if the container is running.

### B4. SMTP/worker environment (public values only)

```sh
docker compose -p hau-soc-badging-prod exec -T worker sh -lc \
  'printf "EMAIL_DELIVERY_MODE=%s\nEMAIL_RECIPIENT_POLICY=%s\nEXTERNAL_EMAIL_ENABLED=%s\nNOTIFICATION_POLL_INTERVAL_MS=%s\n" \
   "$EMAIL_DELIVERY_MODE" "$EMAIL_RECIPIENT_POLICY" "$EXTERNAL_EMAIL_ENABLED" "$NOTIFICATION_POLL_INTERVAL_MS"'
```

- [ ] Confirm polling interval is not larger than the 5-minute stale threshold.
- [ ] Confirm delivery mode/policy as expected.
- [ ] Do not print SMTP usernames/passwords.

### B5. Host resources

```sh
docker stats --no-stream
df -h /
```

- [ ] Rule out disk exhaustion, memory pressure, or CPU starvation.

## C. Signing-key classification (`staging-2026-11`)

### C1. Public metadata already verified

- Key ID: `https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11`
- Public multikey: `z6Mkggc2kqVvuj68G3aVvewPZbcv69GgDkQ8SuyyhYqgag8x`
- Key trust state: `ACTIVE`
- Controller: `https://socbadging.hausoc.org/api/issuers/hau-soc`

### C2. Database provenance

```sh
docker compose -p hau-soc-badging-prod exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, verification_method_url, controller_url, fingerprint, status, activated_at, retired_at, compromised_at, created_at
    FROM signing_keys
    WHERE verification_method_url = '\''https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11'\'';
    SELECT COUNT(*) AS active_key_count FROM signing_keys WHERE status = '\''ACTIVE'\'';
    SELECT COUNT(*) AS historical_credentials FROM badge_issuances WHERE signing_key_id = (
      SELECT id FROM signing_keys WHERE verification_method_url = '\''https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11'\''
    );
    SELECT COUNT(*) AS status_lists FROM credential_status_lists WHERE signing_key_id = (
      SELECT id FROM signing_keys WHERE verification_method_url = '\''https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11'\''
    );
  "
'
```

- [ ] Compare fingerprint with deployed public metadata.
- [ ] Record activation/creation time and exactly one active key.
- [ ] Record credential/status-list usage counts.

### C3. Activation audit trail

```sh
docker compose -p hau-soc-badging-prod exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT action, created_at, context_json FROM audit_logs
    WHERE action LIKE '\''signing-key.%'\''
    ORDER BY created_at DESC LIMIT 30;
  "
'
```

- [ ] Identify registration/activation source and date.
- [ ] Determine whether the key was generated by a staging or production procedure.
- [ ] Do not print private material.

### C4. Signing identity/custody (public metadata and file metadata only)

```sh
sudo grep -E '^(SIGNING_KEY_ID|SIGNING_PUBLIC_MULTIKEY|SIGNING_KEY_FINGERPRINT|SIGNING_CRYPTOSUITE|SIGNING_PRIVATE_KEY_PATH)=' \
  /etc/hau-soc/production.env
sudo ls -l /etc/hau-soc/secrets/signing_key
sudo stat -c '%U %G %a %s %n' /etc/hau-soc/secrets/signing_key
```

- [ ] Confirm the deployed public metadata matches the database/public endpoint.
- [ ] Confirm the private-key file is outside the repository, mode `0600`, owned appropriately.
- [ ] Confirm the key path/name does not identify a staging/development copy.
- [ ] Do not cat or decrypt the key.

### C5. Decision

- [ ] If provenance/custody is production-approved: **naming issue only**; do not rename (key ID is
      embedded in signed credentials); document classification and retain custody evidence.
- [ ] If provenance is staging/uncertain or custody is weak: **rotate through the approved key
      lifecycle**. Keep the old key RETIRED for historical verification unless compromise is proven.
      Mark COMPROMISED only with incident approval. Never rewrite historical credentials.
- [ ] If compromise is suspected: stop issuance, follow incident response, rotate, preserve evidence.

## D. Database/media backup evidence

```sh
sudo find /var/backups/hau-soc -maxdepth 2 -type f \
  \( -name database.sql -o -name media.tar.gz -o -name backup.properties -o -name SHA256SUMS \) \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort

LATEST=/var/backups/hau-soc/backup-<timestamp>
sudo sh -c "cd '$LATEST' && sha256sum -c SHA256SUMS"
sudo cat "$LATEST/backup.properties"
sudo tar -tzf "$LATEST/media.tar.gz" >/dev/null && echo media-archive-ok
```

- [ ] Latest DB backup timestamp, size, and checksum.
- [ ] Matching media archive timestamp/size/checksum.
- [ ] Backup age within 24h (or approved RPO).
- [ ] Off-host copy exists and is immutable/access-controlled.
- [ ] Retention job/timer exists and recent run is successful.
- [ ] Backup owner named.

## E. Configuration and secrets backup

```sh
sudo ls -l /etc/hau-soc /etc/hau-soc/secrets
sudo find /var/backups/hau-soc -maxdepth 2 -iname '*config*' -o -iname '*secret*'
```

- [ ] Production env/secrets have an encrypted backup record with checksum.
- [ ] Restore procedure documented and access-controlled.
- [ ] No plaintext secret copies in repository, logs, or unencrypted backup directories.
- [ ] Do not print file contents.

## F. Signing-key recovery materials

```sh
SIGNING_BACKUP=/var/backups/hau-soc/signing-key-<timestamp>
sudo sh -c "cd '$SIGNING_BACKUP' && sha256sum -c SHA256SUMS"
sudo ls -l "$SIGNING_BACKUP"
```

- [ ] Encrypted signing-key archive exists and checksum passes.
- [ ] Passphrase is stored separately in the approved vault.
- [ ] Public fingerprint can be derived and matches registered metadata using the approved restore
      procedure.
- [ ] Backup is stored separately from DB/media backups.
- [ ] Do not export or display private key material.

## G. Restore/drill and PITR evidence

```sh
sudo find /var/backups /var/log -maxdepth 3 -type f \
  \( -iname '*restore*' -o -iname '*drill*' -o -iname '*backup*report*' \) \
  -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort | tail -20

docker compose -p hau-soc-badging-prod exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" \
    -e "SHOW BINARY LOGS;"
'
```

- [ ] Last restore-drill date, target, operator, and result.
- [ ] DB/media/credential/media checks passed.
- [ ] Binlogs enabled and archived off-host for approved PITR.
- [ ] RPO/RTO achieved and signed off.
- [ ] No production restore performed as part of this verification.

## H. Final readiness gate

- [ ] Worker heartbeat fresh and queue processing proven.
- [ ] Signing key provenance/custody classified; rotation decision recorded.
- [ ] DB/media backups verified and within retention.
- [ ] Config/secrets backup verified.
- [ ] Signing-key recovery materials verified without exposure.
- [ ] Restore drill and off-host PITR evidence accepted.
- [ ] Production acceptance testing separately authorized.

All checks above are read-only. Do not restart services, rotate keys, restore backups, or modify
production as part of evidence collection.
