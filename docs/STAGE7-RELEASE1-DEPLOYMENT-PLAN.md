# Stage 7 Release 1 — Deployment Plan

**Status:** Prepared only. No production merge or deployment is authorized by this document.
**Production URL:** https://socbadging.hausoc.org
**Production project:** `hau_soc_badging_stage2`

## 1. Preconditions (all required)

- [ ] Explicit written approval for merge and deployment, with a maintenance window.
- [ ] Named deployment operator and rollback owner.
- [ ] Production source at the approved release commit or an accepted dirty-tree hash.
- [ ] Verified database, media and signing-key backups with SHA-256 manifest and restore test.
- [ ] Rollback web/worker image tags preserved and inspected.
- [ ] Staging acceptance of the same commit, including the migration dry-run.
- [ ] Notification worker healthy and queue free of in-flight work.
- [ ] Confirmation that no additional migration is required beyond the additive Stage 7 migration.

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

1. Apply the schema migration with the existing one-shot `migrate` service (`prisma migrate deploy`). The migration is additive; no downtime is required for the schema change.
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

## 7. Stop conditions

- Migration ledger/schema mismatch or failed migration.
- Backup or restore verification failure.
- Worker unhealthy, stale heartbeat, cycle timeout/error/stall logs.
- Duplicate/in-flight queue rows not understood.
- Failed credential verification or changed historical signature.
- Any authorization regression or unexpected email.

## 8. Approval gate

Production merge and deployment remain blocked until explicit authorization is recorded. The feature branch is ready for review, CI verification and a staging rehearsal.
