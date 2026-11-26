# Stage 5F.9 Production Worker Deployment Plan

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production server:** `100.126.199.26`  
**Production health:** HTTP 200; notification worker unhealthy/stale  
**Deployment executed:** No  
**Production changes by OpenCode:** None

> Historical plan for the Stage 5F.9 image snapshot. The file checksums below identify that image
> snapshot and do not describe the current working tree.

## 1. Executive summary

A corrected Stage 5F.4 worker image has been built, labeled, integrity-checked, and smoke-tested
locally. The image contains the cycle timeout, SMTP/DB timeouts, bounded heartbeat, stall watchdog,
structured diagnostics, and graceful shutdown changes.

The production queue is empty (0 deliveries, 0 attempts, 0 unfinished `STARTED` attempts), so a
worker-only replacement carries no current duplicate-email risk. The administrator has deferred the
separate encrypted signing-key backup; this is documented as an explicitly accepted residual risk for
worker deployment, but remains an open item for final production GO.

**Worker-only deployment status: READY FOR APPROVAL.**  
**Production GO: NO-GO** pending post-deployment validation and separate signing-key custody/recovery
follow-up.

## 2. Source revision and integrity

### 2.1 Base revision

- Git HEAD: `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`
- Package version: `0.5.0-rc.1`
- Stage 5F.4 fix is present in the working tree and is **not committed/pushed**.
- Image source manifest SHA-256:
  `1ce4d1c61f0a7d711c6d3d0ef02b83048900285e295c67d72b39ce94eef729dc`

The manifest covers the worker runtime, configuration, health check, Dockerfile, Compose/env
templates, package lock, and Prisma schema. Individual file hashes:

```text
84dbb063bfa10a736b0f897cc6eabee3f449482da342568917fdb3389ea923f0  src/worker.ts
029d45008c46b3812f80554fc100d5de69271309ce1834e46a20d5da464ba720  src/config/env.ts
738190ad39e2fff13fd1244413c82a3cf4aa22d3fc1683b4b1fb0f829a1d8850  src/modules/notifications/services/worker-runtime.ts
b088449223933382ceb6e805d016191d1469ad8326c93c3a94607fd456021d15  src/modules/notifications/services/smtp-client.ts
65375a11870c32f29b0a2ecd363dc7c38dbfd020fecea60a9a6897249a47d240  scripts/worker-healthcheck.mjs
8ad05cedb970d6ad137701b28d6bc06cec932030a1fc2c8e10a5d79adfaa3d78  compose.production.yaml
7a5328a20c1f30c610528498194aa9870d79b0f5904836b14a3f02affdffa4f7  deploy/production.env.example
cb678530cb2b06882e30a72a1e6d634f5657a84f49e0bc02933ca5069d685ace  .env.example
1a35c5493cb4813e29b170f59108ade0da8f82907207d264a2d1b1ef29d3c928  Dockerfile
e46cdfbc9ab9b8bb878feb71b7d1392ebcff0ba4bddf725352bd3a21aca069e5  package.json
142cc981b2fc5d0b99e4859ef6e8ab5796285a1f693a73e2f6879395c3e2909c  package-lock.json
ad96d60a857fa9d39be60746a5a1a62f1bd3b12de1ba00f981ce864af401a3da  prisma/schema.prisma
```

Because the fix is uncommitted, the image is reproducible only from this working tree plus the
manifest. Do not rebuild from `HEAD` alone.

### 2.2 Built image

| Item              | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Tag               | `hau-soc-badging-worker:stage5f4-6d2f403`                                                       |
| Image ID          | `sha256:c99297e839d761cfc40612b2aa1a938d578d0337624eb2c1f8c6d44ba071e404`                       |
| Architecture / OS | `linux/amd64`                                                                                   |
| Created           | `2026-11-22T08:49:15Z`                                                                          |
| Base image        | `node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5` |
| Image tar         | `hau-soc-badging-worker-stage5f4-6d2f403.tar` (634 MB)                                          |
| Tar SHA-256       | `16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350`                              |
| Image labels      | revision `6d2f403...`, fix `stage5f4`, manifest `1ce4d1...`, version `0.5.0-rc.1+stage5f4`      |

Build command used (from the approved source working tree):

```sh
docker buildx build --platform linux/amd64 --target worker --load \
  --provenance=false --sbom=false \
  -t hau-soc-badging-worker:stage5f4-6d2f403 \
  --label "org.opencontainers.image.title=HAU SOC Badging Worker" \
  --label "org.opencontainers.image.version=0.5.0-rc.1+stage5f4" \
  --label "org.opencontainers.image.revision=6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f" \
  --label "org.opencontainers.image.created=<UTC timestamp>" \
  --label "org.opencontainers.image.source=https://github.com/mitayag/socbadging" \
  --label "org.hau-soc.worker-fix=stage5f4" \
  --label "org.hau-soc.worker-source-manifest-sha256=1ce4d1c61f0a7d711c6d3d0ef02b83048900285e295c67d72b39ce94eef729dc" \
  .
```

Local image tar:

```text
/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/hau-soc-badging-worker-stage5f4-6d2f403.tar
sha256: 16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350
```

The image tar was loaded back successfully and resolved to the same image ID.

### 2.3 Local image smoke test

The linux/amd64 image was run with:

- user `1001:1001`;
- read-only root filesystem;
- tmpfs `/tmp` and `node_modules/.cache`;
- disposable test database and local Mailpit;
- no external email.

Observed:

```text
notification.worker.starting
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
```

Heartbeat was written fresh; no external email was sent. The image contains
`worker-runtime.ts`, `runWorkerLoop`, `NOTIFICATION_CYCLE_TIMEOUT_MS`, and SMTP timeout settings.

### 2.4 Architecture gate

The prepared image is **linux/amd64**. Before transfer, confirm production architecture:

```sh
# On the production host
uname -m
docker info --format '{{.Architecture}}'
```

If production is `aarch64`/`arm64`, rebuild with `--platform linux/arm64`. Do not load an amd64 image
on an arm64-only host.

## 3. Image transfer and integrity verification

Use the approved registry or a secure image bundle. Do not use the restricted SSH account for file
transfer.

### Option A — approved registry

```sh
# On the approved build host
docker tag hau-soc-badging-worker:stage5f4-6d2f403 <registry>/hau-soc-badging-worker:stage5f4-6d2f403
docker push <registry>/hau-soc-badging-worker:stage5f4-6d2f403
docker image inspect <registry>/hau-soc-badging-worker:stage5f4-6d2f403 \
  --format 'id={{.Id}} digests={{json .RepoDigests}}'

# On production
docker pull <registry>/hau-soc-badging-worker@sha256:<registry-digest>
```

Record the registry digest. Tags are mutable; deploy by digest where possible.

### Option B — secure tar bundle

```sh
# Build host
shasum -a 256 hau-soc-badging-worker-stage5f4-6d2f403.tar
# Transfer through the approved secure channel.

# Production host
shasum -a 256 hau-soc-badging-worker-stage5f4-6d2f403.tar
# Must equal 16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350
docker load -i hau-soc-badging-worker-stage5f4-6d2f403.tar
docker image inspect hau-soc-badging-worker:stage5f4-6d2f403 \
  --format 'id={{.Id}} arch={{.Architecture}} os={{.Os}} labels={{json .Config.Labels}}'
```

Expected image ID:
`sha256:c99297e839d761cfc40612b2aa1a938d578d0337624eb2c1f8c6d44ba071e404`.

## 4. Pre-deployment prerequisites

- [ ] Written deployment approval and maintenance window.
- [ ] Production architecture confirmed (`linux/amd64`).
- [ ] Corrected image loaded/pulled and digest verified.
- [ ] Original worker image available for rollback.
- [ ] Queue still 0 deliveries/0 attempts/0 unfinished `STARTED` attempts.
- [ ] Proxmox VM 130 backup verified (VM-level PASS).
- [ ] MariaDB logical backup and isolated restore PASS (administrator-confirmed).
- [ ] Media backup checksum/archive PASS (administrator-confirmed).
- [ ] Config/secrets recovery evidence reviewed.
- [ ] Signing-key backup deferral explicitly accepted as residual risk.
- [ ] Only `hau_soc_badging_stage2-worker-1` is in scope.
- [ ] Named operator, rollback owner, and monitoring owner.

## 5. Preserve the original image for rollback

```sh
cd /opt/socbadging
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
WORKER=hau_soc_badging_stage2-worker-1
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECORD=/var/tmp/socbadging-worker-deploy-$STAMP
sudo install -d -m 700 "$RECORD"

docker inspect "$WORKER" | sudo tee "$RECORD/worker-before.json" >/dev/null
ORIGINAL_IMAGE=$(docker inspect -f '{{.Image}}' "$WORKER")
printf '%s\n' "$ORIGINAL_IMAGE" | sudo tee "$RECORD/original-image.txt"
printf '%s\n' "sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914" \
  | sudo tee "$RECORD/expected-original-image.txt"

# Preserve a local rollback tag.
docker image tag "$ORIGINAL_IMAGE" hau-soc-badging-worker:pre-5f4
docker image inspect hau-soc-badging-worker:pre-5f4 --format 'id={{.Id}} created={{.Created}}'
```

If the original image is missing, restore it from the approved registry/image backup using the
recorded digest. Do not rebuild the old image from changed source.

## 6. Worker-only deployment procedure

### 6.1 Pre-deploy state capture

```sh
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health

curl -fsS "$PROD_HEALTH_URL" | sudo tee "$RECORD/health-before.json" >/dev/null
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sudo tee "$RECORD/containers-before.txt" >/dev/null
docker inspect --format '{{.State.Health}}' "$WORKER" | sudo tee "$RECORD/worker-health-before.txt" >/dev/null
```

### 6.2 Pin the corrected image with an override

```yaml
# /opt/socbadging/worker-image.override.yaml
services:
  worker:
    image: hau-soc-badging-worker:stage5f4-6d2f403
```

If using a registry digest, use
`image: <registry>/hau-soc-badging-worker@sha256:<digest>` instead.

### 6.3 Deploy only the worker

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-image.override.yaml \
  up -d --no-deps --no-build worker
```

- `--no-deps` prevents web/db/signer recreation.
- `--no-build` uses the pinned image and does not rebuild from source.
- Do not force-recreate any other service.
- No database migration is required by the worker fix.

### 6.4 Confirm only the worker changed

```sh
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sudo tee "$RECORD/containers-after.txt" >/dev/null
diff -u "$RECORD/containers-before.txt" "$RECORD/containers-after.txt" || true
```

Expected: only `hau_soc_badging_stage2-worker-1` has a new image/container identity. Web, database,
signer, and staging containers must remain untouched.

## 7. Post-deployment verification

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

- [ ] `notification.worker.starting`, then `notification.worker.cycle` every ~5s.
- [ ] `/api/health`: `notifications.status=ready`, `workerHeartbeat=fresh`.
- [ ] Docker health `healthy`.
- [ ] No `notification.worker.timeout`, `notification.worker.error`, or `stall_exit`.
- [ ] Queue remains 0 or processes safely; no mass failures.
- [ ] No duplicate provider message IDs or duplicate SENT attempts.
- [ ] Web/db/signer/signing endpoints remain healthy.
- [ ] Staging container untouched.
- [ ] Corrected fix present:
  ```sh
  docker exec "$WORKER" test -f /app/src/modules/notifications/services/worker-runtime.ts \
    && echo fix-present
  docker exec "$WORKER" printenv NOTIFICATION_CYCLE_TIMEOUT_MS
  ```

Post-deploy read-only SQL:

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

Monitor for 30 minutes, then 24 hours. If heartbeat goes stale, cycles stop, the worker exits
repeatedly, or duplicates appear, roll back.

## 8. Rollback procedure

### 8.1 Rollback override

```yaml
# /opt/socbadging/worker-rollback.override.yaml
services:
  worker:
    image: hau-soc-badging-worker:pre-5f4
```

### 8.2 Execute rollback

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-rollback.override.yaml \
  up -d --no-deps --no-build worker
```

Verify:

```sh
docker inspect "$WORKER" --format 'image={{.Image}} created={{.Created}} status={{.State.Status}}'
curl -fsS "$PROD_HEALTH_URL" || true
docker logs --tail=100 "$WORKER"
```

Expected rollback image:
`sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`.

If the rollback tag is unavailable, load the preserved original image/registry digest before
recreating the worker. Do not modify web/db/signer or restore the database for a worker rollback.

## 9. Deferred signing-key recovery — accepted residual risk

The administrator has elected to defer the separate encrypted signing-key backup for this worker
deployment.

**Explicitly accepted residual risk for worker deployment:**

- The VM 130 backup success does not prove independent recovery of signing-key material.
- The VM backup may or may not include the private key and may not be encrypted/access-controlled to
  the required standard.
- No separate encrypted signing-key archive/fingerprint restore has been verified.
- If the signing key is lost/corrupted, credential signing/status-list publication and key recovery
  may be impaired.
- No key rotation/replacement is authorized in this deployment.

This deferral is accepted **only for the worker-only recovery**. It remains a required follow-up before
final production GO:

1. Create/verify an encrypted signing-key backup outside the VM/DB/media backup set.
2. Store the passphrase separately in the approved vault.
3. Verify the public fingerprint from a restored key in an isolated environment.
4. Record key custodian, retention, and restore evidence.
5. Review whether `staging-2026-11` is a naming-only or staging-provenance key; separate approval is
   required for any rotation.

## 10. Final pre-deployment checklist

| Item                                         | Status                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| Corrected image built from Stage 5F.4 source | PASS                                                    |
| Source manifest/revision recorded            | PASS                                                    |
| Image is linux/amd64                         | PASS (must match production arch)                       |
| Image labels/digest/integrity tar            | PASS                                                    |
| Non-root/read-only image smoke test          | PASS                                                    |
| No external email in smoke test              | PASS                                                    |
| Production queue empty (0/0/0)               | PASS                                                    |
| Proxmox VM 130 backup                        | PASS — VM-level                                         |
| MariaDB logical backup/restore               | PASS — administrator-confirmed                          |
| Media backup integrity                       | PASS — administrator-confirmed                          |
| Configuration/secrets recovery               | REVIEW REQUIRED                                         |
| Separate signing-key backup                  | DEFERRED — accepted residual risk                       |
| Original worker image preserved              | REQUIRED before deploy                                  |
| Worker-only deploy/rollback overrides        | PREPARED                                                |
| Web/db/signer/staging untouched              | REQUIRED verification                                   |
| Maintenance window/operator/rollback owner   | APPROVAL REQUIRED                                       |
| Post-deployment validation                   | PREPARED                                                |
| Production deployment authorized             | NO                                                      |
| Production GO/NO-GO                          | **NO-GO** until deployment/validation and key follow-up |

## 11. Required approvals

1. Approve the corrected image ID/digest and linux/amd64 compatibility.
2. Approve image transfer path (registry or secure tar) and integrity checks.
3. Approve worker-only deployment and maintenance window.
4. Approve rollback ownership and monitoring window.
5. Accept the deferred signing-key backup residual risk for this worker deployment.
6. Approve separate follow-up for signing-key recovery and `staging-2026-11` custody.
7. Separately authorize production acceptance/Playwright testing.

## 12. Deployment status

**Corrected worker image: READY.**  
**Worker-only deployment: READY FOR APPROVAL.**  
**Production GO: NO-GO** pending approved deployment, post-deployment validation, and signing-key
recovery follow-up.

No production restart, image replacement, database change, signing-key change, external email, DNS/
proxy change, commit, or push was performed.
