# GitHub Release Deployment Plan

**Release candidate:** `v0.5.0-rc.1`  
**Candidate commit:** `1d622a043aa3f4923c2ccaee0db27513cc62168c`  
**Branch:** `release/v0.5.0-rc.1`  
**PR:** https://github.com/mitayag/socbadging/pull/1  
**Production deployment authorized:** No  
**Production deployment executed:** No

## 1. Current release position

The candidate branch is pushed and PR #1 is open against `main`. Both GitHub Actions Quality runs
passed. The candidate is **not approved for merge or production deployment**.

Required approvals before any deployment:

1. PR review and approval.
2. Written production GO decision.
3. External Brevo/DNS/webhook acceptance.
4. Nginx Proxy Manager/HTTPS validation.
5. Production signing-key activation.
6. Backup/vault and monitoring ownership.

## 2. Pre-deployment prerequisites

- [ ] PR #1 reviewed and merged by an authorized maintainer.
- [ ] Production environment provisioned from `deploy/production.env.example`.
- [ ] Eight secret files created under `/etc/hau-soc/secrets` mode `0600`.
- [ ] Final HTTPS `APP_URL`, `ISSUER_URL`, and `SIGNING_KEY_ID` configured.
- [ ] Fresh production signing key generated and vaulted.
- [ ] NPM proxy host/certificate created and validated.
- [ ] Brevo sender/domain/webhook approved and configured.
- [ ] `EMAIL_RECIPIENT_POLICY=production` (or `staging` for controlled acceptance).
- [ ] Verified DB/media/signing-key backups and restore drill.
- [ ] Monitoring, on-call, and rollback owner assigned.
- [ ] Maintenance window approved.

## 3. Build and validate (approved window)

```sh
git fetch origin
git switch main
git pull --ff-only origin main
# Confirm the approved release commit/tag before building.

npm ci
npm run db:generate
npm run format
npm run lint
npm run typecheck
npm test
npm run build

docker compose --env-file /etc/hau-soc/production.env \
  -f compose.production.yaml config --quiet
docker compose --env-file /etc/hau-soc/production.env \
  -f compose.production.yaml build
```

Record the local image digests for web, worker, signer, and migrate.

## 4. Start foundation and migrate

```sh
COMPOSE="docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml"
$COMPOSE up -d db-init db
$COMPOSE run --rm migrate
$COMPOSE up -d signer
$COMPOSE --profile tools run --rm seed
$COMPOSE --profile tools run --rm bootstrap
$COMPOSE up -d media-init web worker
```

`bootstrap` is idempotent and will not overwrite an already published status list.

## 5. Verify

```sh
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/status-lists/status-list-local >/dev/null
docker compose --env-file /etc/hau-soc/production.env \
  -f compose.production.yaml ps
```

Then verify through NPM over HTTPS:

- `/api/health` ready with fresh worker heartbeat and matching signer key.
- Public issuer, key, and status-list documents.
- Public credential page and signed proof.
- Suppression visibility and audited clearance.
- No DB, worker, or signer port exposed.

## 6. External acceptance

Follow `STAGE5E1-BREVO-ACCEPTANCE-PLAN.md`:

1. Run `scripts/brevo-readiness.ts` with the approved staging policy.
2. Arm exactly one controlled notification with `scripts/arm-controlled-acceptance.ts`.
3. Send only to the authorized recipient.
4. Capture provider acceptance, recipient inbox confirmation, webhook lifecycle, suppression,
   retry/resend denial, and revocation/status-list evidence.
5. Do not claim inbox delivery from SMTP acceptance alone.

## 7. Rollback

1. Stop web and worker to freeze writes/sends.
2. Restore verified DB/media and signing key from the approved backup set.
3. Revert to the prior approved image digests.
4. Keep additive migrations unless a reviewed migration rollback is approved.
5. Start signer, web, and worker; verify health, status list, queue, and canary.
6. Restore Mailpit/local policy and disable external sending if email is involved.
7. Record incident timeline, RPO/RTO, and approvals.

See `STAGE5D-BACKUP-RECOVERY.md`, `docs/operations/database-migrations.md`, and
`docs/operations/production-runbook.md`.

## 8. Production blockers

- No merge approval yet.
- External Brevo/DNS/sender/webhook acceptance incomplete.
- NPM/HTTPS not live-validated.
- Production key not activated.
- Production backup/vault and off-host binlog decision pending.
- Monitoring/on-call ownership pending.
- Final release publication requires separate approval.

## 9. Deployment status

**Plan prepared: PASS.**  
**Execution: NOT AUTHORIZED / NOT PERFORMED.**  
**Production GO/NO-GO: NO-GO.**
