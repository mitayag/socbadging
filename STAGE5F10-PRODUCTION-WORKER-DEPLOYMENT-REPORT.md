# Stage 5F.10 Production Worker Deployment Report

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Corrected image:** `hau-soc-badging-worker:stage5f4-6d2f403`  
**Expected corrected image ID:** `sha256:c99297e839d761cfc40612b2aa1a938d578d0337624eb2c1f8c6d44ba071e404`  
**Original image:** `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`

## 1. Final status

**Deployment status: BLOCKED — NOT EXECUTED.**  
**Rollback status: NOT REQUIRED / NOT EXECUTED.**  
**Deployment success claimed: NO.**

The locally built corrected image passed preflight, but production deployment could not proceed because:

- no independently approved administrative deployment path was available;
- production architecture (`linux/amd64` vs `arm64`) was not confirmed;
- preservation of the original production worker image was not confirmed;
- the maintenance window, deployment operator, rollback owner, and explicit deployment authorization
  were not supplied;
- transfer of the image to `badging-server` was not authorized/available.

The restricted `socbadging-test` SSH account was not bypassed and was used only for its status command.

## 2. Unexpected production health change

During preflight, public production health changed to:

```json
{
  "status": "ok",
  "readiness": "ready",
  "database": { "status": "ready" },
  "notifications": { "status": "ready", "workerHeartbeat": "fresh" },
  "signer": {
    "status": "ready",
    "keyId": "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    "cryptosuite": "eddsa-rdfc-2022"
  }
}
```

Previously it reported the worker `degraded` with a stale heartbeat.

**This change was not caused by this workflow.** No production container was restarted, replaced, or
deployed by OpenCode. The cause is unverified and may be an administrator restart, host-level recovery,
or another operator action.

Do not assume the corrected image is deployed. The production worker image ID must be verified:

```sh
docker inspect hau_soc_badging_stage2-worker-1 --format 'image={{.Image}} created={{.Created}} labels={{json .Config.Labels}}'
```

Expected original until approved deployment:
`sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`.

If the image is still the original, the unbounded-I/O defect remains and the worker may stall again.

## 3. Preflight results

| Check                                      | Result                               | Evidence                                                           |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------ |
| Stage 5F.9 plan reviewed                   | PASS                                 | Deployment plan                                                    |
| Corrected image tar exists                 | PASS                                 | 634 MB local tar                                                   |
| Tar SHA-256                                | PASS                                 | `16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350` |
| Local image ID                             | PASS                                 | `sha256:c99297e8...`                                               |
| Local image architecture                   | PASS — `linux/amd64`                 | `docker image inspect`                                             |
| Source manifest matches image label        | PASS                                 | `1ce4d1c6...` recomputed = label                                   |
| Image contains Stage 5F.4 fix              | PASS                                 | `worker-runtime.ts`, `runWorkerLoop`, SMTP timeouts                |
| Non-root/read-only image smoke             | PASS                                 | Cycles + fresh heartbeat with test DB/Mailpit                      |
| Pinned worker override Compose validation  | PASS                                 | `config --quiet`                                                   |
| Production architecture confirmed          | **BLOCKED**                          | Requires admin `uname -m` / `docker info`                          |
| Original production image preserved        | **BLOCKED**                          | Not verifiable from this environment                               |
| Notification queue/deliveries              | PASS — 0/0/0                         | Administrator evidence                                             |
| Unfinished STARTED attempts                | PASS — 0                             | Administrator evidence                                             |
| Proxmox VM 130 backup                      | PASS — VM-level                      | TASK OK, 22 Nov 2026                                               |
| MariaDB logical backup/restore             | PASS — administrator-confirmed       | Prior evidence                                                     |
| Media backup integrity                     | PASS — administrator-confirmed       | Prior evidence                                                     |
| Signing-key backup                         | DEFERRED — accepted residual risk    | Administrator decision                                             |
| Maintenance window/operator/rollback owner | **BLOCKED**                          | Not supplied                                                       |
| Explicit deployment authorization          | **BLOCKED**                          | Not supplied for this execution                                    |
| Approved admin image-transfer path         | **BLOCKED**                          | Restricted SSH is status-only                                      |
| Production worker health                   | PASS at check time — external change | Fresh heartbeat, not caused by this workflow                       |

## 4. Image verification evidence

Local image:

```text
Tag:        hau-soc-badging-worker:stage5f4-6d2f403
Image ID:   sha256:c99297e839d761cfc40612b2aa1a938d578d0337624eb2c1f8c6d44ba071e404
Arch/OS:    linux/amd64
Created:    2026-11-22T08:49:15Z
Revision:   6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f
Fix label:  stage5f4
Manifest:   1ce4d1c61f0a7d711c6d3d0ef02b83048900285e295c67d72b39ce94eef729dc
Tar SHA:    16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350
```

The image tar was loaded and resolved to the same image ID. No secrets are embedded in the image;
runtime secrets remain file-based.

## 5. Deployment actions

**No deployment actions were executed.**

No image was transferred to `badging-server`, no container was loaded/replaced, no Compose command was
run against production, and no service was restarted.

The planned worker-only sequence (for a separately authorized operator) is:

```sh
# 1. Confirm production architecture
uname -m
docker info --format '{{.Architecture}}'

# 2. Verify transferred tar checksum
shasum -a 256 hau-soc-badging-worker-stage5f4-6d2f403.tar
# expected 16de155d4f4bd9f11da33d7a989864f26871db3b4d33bd64f025142e269e1350
docker load -i hau-soc-badging-worker-stage5f4-6d2f403.tar

# 3. Inspect loaded image
docker image inspect hau-soc-badging-worker:stage5f4-6d2f403 \
  --format 'id={{.Id}} arch={{.Architecture}} labels={{json .Config.Labels}}'

# 4. Preserve original worker image
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
docker image tag "$ORIGINAL_IMAGE" hau-soc-badging-worker:pre-5f4

# 5. Validate Compose with pinned worker image (no secrets printed)
# worker-image.override.yaml:
# services:
#   worker:
#     image: hau-soc-badging-worker:stage5f4-6d2f403
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-image.override.yaml config --quiet

# 6. Deploy only the worker
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" -f worker-image.override.yaml \
  up -d --no-deps --no-build worker
```

These commands were **not executed**.

## 6. Actual production worker image ID

**BLOCKED — not verified.** This workflow did not have access to inspect the running production
container. The supplied original image remains
`sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914` until an authorized
operator verifies otherwise.

## 7. Post-deployment health results

**NOT APPLICABLE — no deployment occurred.**

The current public health is ready/fresh, but this is an external state change and does not validate the
corrected image. Required post-deployment checks remain:

```sh
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health
WORKER=hau_soc_badging_stage2-worker-1

for i in $(seq 1 12); do
  date -u
  curl -fsS "$PROD_HEALTH_URL" || true
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$WORKER"
  sleep 5
done

docker logs --since=10m --tail=200 "$WORKER"
docker exec "$WORKER" test -f /app/src/modules/notifications/services/worker-runtime.ts \
  && echo fix-present
docker exec "$WORKER" printenv NOTIFICATION_CYCLE_TIMEOUT_MS
```

Pass criteria: cycles every ~5s, fresh heartbeat ≤300s, Docker health `healthy`, notifications ready,
no timeout/stall_exit errors, no duplicate provider message IDs, web/db/signer healthy, staging
unchanged.

## 8. Queue and duplicate-delivery checks

Administrator-supplied preflight: 0 notification deliveries, 0 attempts, 0 unfinished `STARTED`
attempts. This means the current queue has no duplicate-delivery risk from a worker replacement.

After deployment, re-run:

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT id, status, claim_expires_at FROM notification_deliveries WHERE status = '\''PROCESSING'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

## 9. Rollback status

**NOT EXECUTED.** No deployment occurred.

Prepared rollback (only if a future deployment fails):

```sh
# worker-rollback.override.yaml:
# services:
#   worker:
#     image: hau-soc-badging-worker:pre-5f4

docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml \
  -f worker-rollback.override.yaml up -d --no-deps --no-build worker
```

Verify rollback image equals the preserved original digest, then check health/heartbeat. Do not restore
the database or rotate keys for a worker rollback.

## 10. Outstanding production-readiness issues

1. **Deployment authorization/access:** no approved admin deployment path, maintenance window,
   operator, or rollback owner was supplied.
2. **Production architecture:** must be confirmed as `linux/amd64` before loading the prepared image.
3. **Original image preservation:** must be verified on the production host.
4. **Production worker image ID:** must be checked; the current ready state may still be the old image.
5. **Signing-key backup:** separate encrypted backup remains deferred/accepted residual risk; VM backup
   alone does not guarantee key recovery.
6. **Signing-key custody:** `staging-2026-11` provenance remains unclassified; no rotation authorized.
7. **Post-deployment validation:** not performed.
8. **Production GO:** remains NO-GO until a real deployment is validated and key recovery follow-up is
   completed.

## 11. Required approvals before retry

1. Written deployment authorization and maintenance window.
2. Named deployment operator and rollback owner.
3. Confirmed production architecture and approved image-transfer path.
4. Confirmed original image preserved on production.
5. Confirmed corrected image digest/labels after transfer.
6. Confirmed queue remains empty immediately before deployment.
7. Explicit acceptance of the deferred signing-key backup residual risk.
8. Separate authorization for post-deployment monitoring/validation.

## 12. Final status

**Preflight: PARTIAL PASS.**  
**Deployment: BLOCKED — NOT EXECUTED.**  
**Rollback: NOT EXECUTED.**  
**Production worker currently healthy — external change, corrected image deployment unverified.**  
**Production GO/NO-GO: NO-GO.**

No production container, database, image, signing key, SSH/DNS/proxy configuration, or email was
modified. No commit or push occurred.
