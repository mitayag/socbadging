# Stage 7 Release 1 — Deployment Plan

**Status:** Executed successfully on 28 November 2026 as Stage 7 Release 1C. This plan is retained as the rollback and recovery reference.
**Production URL:** https://socbadging.hausoc.org
**Production project:** `hau_soc_badging_stage2`
**Release candidate:** `81579e9`; deployed release: `c64038b` (release/v0.5.0-rc.1)
**Production commit at readiness assessment:** `4eb403f`
**Verified pre-release backups:** `/var/backups/hau-soc/stage7-release1b-20261128T064647Z`, `/var/backups/hau-soc/stage7-release1c-predeploy-20261128T072717Z`
**Expected downtime:** ~1–3 minutes for worker/web recreation; the additive schema migration requires no downtime.

## 1. Preconditions (all required)

- [ ] Explicit written approval for merge and deployment, with a maintenance window.
- [ ] Named deployment operator and rollback owner.
- [ ] Production source at the approved release commit or an accepted dirty-tree hash.
- [ ] Verified database, media and signing-key backups with SHA-256 manifest and restore test.
- [ ] Rollback web/worker image tags preserved and inspected.
- [ ] Staging acceptance of the same commit, including the migration dry-run.
- [ ] Notification worker healthy and queue free of in-flight work.
- [ ] Confirmation that no additional migration is required beyond the additive Stage 7 migration.
- [ ] Stage 7 Release 1B readiness, migration rehearsal, regression and GO/NO-GO reports reviewed and approved.
- [ ] Authenticated production acceptance credentials (`STAGEH_CREDENTIALS_FILE`) or an approved manual equivalent available for post-deployment smoke testing.

## 2. Pre-deployment verification

```sh
# Production access and release identity
ssh <approved-admin>@<production-host>
cd /opt/socbadging && git rev-parse HEAD && git status --short
docker compose -p hau_soc_badging_stage2 -f compose.production.yaml ps

# Health and queue baseline
curl -fsS https://socbadging.hausoc.org/api/health
# Confirm 0 in-flight notification deliveries/attempts before deploying the worker.

# Backups
mkdir -p /var/backups/hau-soc/stage7-$(date -u +%Y%m%dT%H%M%SZ)
# Database dump, media archive, secrets/signing key, compose/env, image IDs; sha256sum -c
# Restore the dump into a temporary database and compare table/row counts.
```

## 3. Migration rehearsal (required)

On a production data copy:

```sh
DATABASE_URL="mysql://.../rehearsal" npx tsx scripts/stage7-release1-migrate.ts
# Review reports/stage7-release1-migration-<stamp>.json|.md
DATABASE_URL="..." npx tsx scripts/stage7-release1-migrate.ts --apply
DATABASE_URL="..." npx tsx scripts/stage7-release1-migrate.ts --apply   # idempotency check
```

Accept only if:

- existing credential count, public IDs and signatures are unchanged;
- duplicate groups are reviewed and deliberately left archived or kept;
- no orphaned classes/templates;
- second apply performs zero writes.

## 4. Deployment sequence

1. Apply the schema migration with the existing one-shot `migrate` service (`prisma migrate deploy`). The migration is additive; no downtime is required for the schema change. Confirm the ledger moves from 21 to 22 and no pending/failed migration remains.
2. Build web and worker images from the approved commit (amd64).
3. Record current image IDs and tag them `pre-stage7`.
4. Deploy the worker first; verify health, cycles, timeout/error logs and heartbeat.
5. Deploy web; verify health, login, catalog, library and class badge pages.
6. Run `scripts/stage7-release1-migrate.ts` dry-run against production, reconcile, then `--apply` if approved.
7. Run smoke tests (below).

```sh
docker compose -p hau_soc_badging_stage2 -f compose.production.yaml up -d --no-deps --no-build worker
docker compose -p hau_soc_badging_stage2 -f compose.production.yaml up -d --no-deps --no-build web
```

Do not recreate `db`, `signer`, `migrate` or `media-init` during the service rollout.

## 5. Post-deployment verification

- `/api/health` ready, DB ready, signer ready, notifications ready, worker heartbeat fresh.
- `/catalog` (admin) and `/library` (admin/faculty) render with search/filter/pagination.
- Administrator creates a course and approves a badge in staging/production as authorized.
- Faculty assigns the approved badge to an owned class; duplicate assignment is rejected.
- Individual and batch issuance still work; a credential verifies at its existing public URL.
- Existing credential signatures, public IDs, revocation and expiration states unchanged.
- No unexpected queue rows, duplicate provider IDs or emails.
- Audit rows exist for course/badge/assignment actions.

## 6. Rollback

Application rollback is sufficient because the schema change is additive:

1. Redeploy the `pre-stage7` web and worker images (`--no-deps`).
2. Leave new tables/columns in place; the previous code ignores them.
3. If data promotion must be undone, follow `docs/STAGE7-RELEASE1-MIGRATION-PLAN.md` §7. Never rewrite `badge_issuances`, signatures, public IDs, status allocations, notification history or audit logs.
4. A database restore is required only for a destructive failure outside the additive design.
5. Records created after deployment (courses, definitions, versions, assignments, materialized templates, audit/review rows) remain valid under the previous code and are ignored by it. Do not delete them during an application rollback; leave them in place unless a separately approved data rollback is executed.
6. If the promotion script was applied, follow `docs/STAGE7-RELEASE1-MIGRATION-PLAN.md` §7 to unlink/remove only the promoted rows, never historical issuances, signatures, public IDs, notifications or audit logs.

## 7. Stop conditions

- Migration ledger/schema mismatch or failed migration.
- Backup or restore verification failure.
- Worker unhealthy, stale heartbeat, cycle timeout/error/stall logs.
- Duplicate/in-flight queue rows not understood.
- Failed credential verification or changed historical signature.
- Any authorization regression or unexpected email.

## 8. Approval gate

Production merge and deployment remain blocked until explicit authorization is recorded. The feature branch is ready for review, CI verification and a staging rehearsal.

Required operator approvals:

- [ ] Release owner authorizes deployment and the maintenance window.
- [ ] Security/authorization owner accepts the Stage 7 Release 1B security assessment.
- [ ] Data owner accepts the migration rehearsal and backup/restore evidence.
- [ ] Rollback owner confirms the `pre-stage7` image tags and backup path.
- [ ] Operator confirms no production deployment occurs before authorization.

## 9. Execution record (Stage 7 Release 1C)

- Deployed release commit: `c64038b5caaccb0b378609d33de487e1e82a17d1`.
- Web image: `sha256:365324803329e2ca199c0c8d020206045fa0e00dfa54d00d60d37aecae53834d`.
- Worker image: `sha256:a23b29f60a8ce4d974411246c8de55cacbaf16c2b4a65f0b29b241deac2349b7`.
- Rollback images: `hau-soc-badging-web:pre-stage7`, `hau-soc-badging-worker:pre-stage7`.
- Schema migration: 21 → 22, applied successfully; promotion dry-run/apply/second-dry-run idempotent.
- Historical credential counts and CRC sums unchanged; no reissuance or notification.
- Worker/web rollout healthy; public and authenticated acceptance passed.
- Observed downtime: brief worker and web recreation (seconds each); no public health failure.
- Reports: `docs/STAGE7-RELEASE1C-PRODUCTION-DEPLOYMENT-REPORT.md`, `docs/STAGE7-RELEASE1C-PRODUCTION-ACCEPTANCE-REPORT.md`, `docs/STAGE7-RELEASE1C-TEST-ACCOUNT-RETIREMENT-REPORT.md`.

## 10. Stage 7 Release 1B references

- `docs/STAGE7-RELEASE1B-PRODUCTION-READINESS-REPORT.md`
- `docs/STAGE7-RELEASE1B-MIGRATION-REHEARSAL-REPORT.md`
- `docs/STAGE7-RELEASE1B-REGRESSION-TEST-REPORT.md`
- `docs/STAGE7-RELEASE1B-GO-NOGO-ASSESSMENT.md`
- `docs/evidence/stage7-release1b/`
