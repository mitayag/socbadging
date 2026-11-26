# Phase F — Remediation and Consolidated Change Plan

**Date:** 24 November 2026  
**Production changes:** None  
**Approval required:** Yes, for worker recovery and any later production acceptance writes

## 1. Defect register

| ID   | Defect                                      | Root cause                                                | Component     | Fix                                                      | Production needed?            |
| ---- | ------------------------------------------- | --------------------------------------------------------- | ------------- | -------------------------------------------------------- | ----------------------------- |
| F-01 | Worker exits with Brevo credential error    | Worker lacks `BREVO_SMTP_USER` and/or password at startup | Worker config | Apply Stage 6D Brevo override + existing password secret | Yes, worker only              |
| F-02 | Notifications degraded/stale                | Consequence of F-01                                       | Worker        | Start worker after queue review                          | Yes, worker only              |
| F-03 | Queue state unreviewed                      | No privileged DB access in this workflow                  | DB/worker     | Operator read-only queue check                           | Yes, inspection               |
| F-04 | Full production acceptance missing          | No authorized production test accounts/writes             | QA            | Isolated production test plan + approval                 | Yes, separate                 |
| F-05 | Signing-key recovery deferred               | No independent encrypted key backup                       | Signing       | Approved key backup/fingerprint restore                  | Yes, operational              |
| F-06 | Key ID named `staging-2026-11`              | Naming/custody ambiguity                                  | Signing       | Classify provenance; no automatic rename/rotation        | Documentation/governance      |
| F-07 | Restricted SSH privilege scope unverified   | Forced command exposes only status                        | Access        | Admin `sshd -T`/account metadata check                   | Yes, inspection               |
| F-08 | Production backup/PITR evidence not current | No host/backup access in this workflow                    | Operations    | Verify current checksums/restore evidence                | Yes, inspection               |
| F-09 | No CSP/HSTS at app layer                    | Header configuration                                      | Web           | Add/test CSP/HSTS with proxy review                      | Later hardening, not recovery |

No source code correction is required for F-01; the existing validation is correct and fails closed.
The secret must be restored from the legitimate Brevo account/vault; do not generate or reuse another
credential.
The local test-hardening change to the rate-limit E2E test is already in the working tree.

## 2. Minimal production recovery plan

This is the only change required to restore notification processing. It is **not authorized yet**.

Preconditions:

- [ ] Written approval to start the worker and apply the Stage 6D overrides.
- [ ] Current DB/media/key backup evidence or explicit risk acceptance.
- [ ] Queue empty: 0 pending/retry/processing, 0 unfinished `STARTED`, no duplicate provider IDs.
- [ ] Worker image/overrides transferred and checksums verified.
- [ ] Rollback images `socbadging-web:rollback-20261123` and
      `socbadging-worker:rollback-20261123` verified.
- [ ] Operator and rollback owner named.
- [ ] No badge issuance or live email during recovery.

Steps:

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

# 1. Use production Compose + Stage 6D overrides. Do not include staging overlays for the target state.
COMPOSE_ARGS=(
  -f "$COMPOSE_FILE"
  -f /var/tmp/socbadging-stage6d/production-brevo.override.yaml
  -f /var/tmp/socbadging-stage6d/production-stage6b-images.override.yaml
)

# 2. Dry-run first.
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --quiet

# 3. Preserve current images/config in the operator record.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECORD=/var/tmp/socbadging-stage6f-$STAMP
sudo install -d -m 700 "$RECORD"
for c in web worker; do
  id=$(docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$c")
  docker inspect "$id" | sudo tee "$RECORD/$c-before.json" >/dev/null
done

# 4. Recreate worker only. Do not start web, db, signer, migrate, or mailpit.
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" \
  up -d --no-deps --no-build worker

# 5. Verify worker.
sleep 20
docker inspect hau_soc_badging_stage2-worker-1 --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker logs --since=5m hau_soc_badging_stage2-worker-1
curl -fsS http://127.0.0.1:3002/api/health
```

Pass criteria:

- Worker running and Docker healthy.
- Logs show `notification.worker.cycle` with `processed=0`.
- Heartbeat fresh; notifications `ready`.
- Queue remains empty, no duplicate provider IDs.
- No email sent.
- Web remains ready; no web restart required.

Rollback: recreate only worker with `socbadging-worker:rollback-20261123`; do not restore DB or keys.

A reviewed worker-only operator script is provided at:

`reports/PHASE-F-OPERATOR-RECOVERY.sh`

The consolidated approval request is:

`reports/PHASE-F-PRODUCTION-CHANGE-APPROVAL-REQUEST.md`

The production test-account and Playwright acceptance procedure is:

`reports/PHASE-H-PRODUCTION-ACCEPTANCE-PROCEDURE.md`

It requires `STAGE6F_APPROVED=YES` and `STAGE6F_PREREQUISITES_ACK=YES`, verifies override/image/secret checks, rejects a non-empty notification
queue or duplicate/STARTED rows, preserves current container inspections, starts **only** the worker,
and does not restore the DB or keys. It has not been executed.

## 3. Required approvals

1. Worker-only recovery and Stage 6D override application.
2. Production queue inspection results reviewed.
3. Backup/key recovery status accepted.
4. Maintenance window/operator/rollback owner.
5. Separate authorization for any production Playwright/account writes.
6. Separate authorization for the one-recipient Brevo pilot.

## 4. Not changed

- No source code change for worker credential validation.
- No production service started/restarted.
- No database records modified.
- No secrets, keys, DNS, proxy, or SSH settings changed.
- No email sent.

## 5. Verdict

**Local remediation and tests: PASS.**  
**Production worker recovery: BLOCKED pending approval and queue/backup evidence.**  
**Web service: already ready; do not restart it for this fix.**
