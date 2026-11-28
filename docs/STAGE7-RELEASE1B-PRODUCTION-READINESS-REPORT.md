# Stage 7 Release 1B — Production Readiness Report

**Date:** 28 November 2026
**Assessed release:** `feature/stage7-release1-shared-badge-library`
**Application release commit:** `81579e9` (plus readiness test/docs commits on the same branch)
**Production commit at assessment:** `4eb403f`
**Production URL:** https://socbadging.hausoc.org
**Deployment status:** NOT deployed. No production schema, data, container or configuration change was made.

## 1. Repository and release verification

| Check                                    | Result                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Remote repository                        | `https://github.com/mitayag/socbadging`                                                                                            |
| Branch                                   | `feature/stage7-release1-shared-badge-library`                                                                                     |
| Local HEAD                               | `81579e9ba9669d37ce875d81dafdd2fd60886519`                                                                                         |
| Remote branch HEAD                       | `81579e9…` (matches)                                                                                                               |
| Working tree                             | Clean except the three preserved operator scripts                                                                                  |
| Operator scripts                         | `reports/PHASE-A-OPERATOR-INSPECTION.sh`, `PHASE-B-INSTALL-BREVO-SECRET.sh`, `PHASE-F-OPERATOR-RECOVERY.sh` (untracked, untouched) |
| Prior fixes included                     | `c90ad36` email/acceptance, `3ffd0ca` student import wizard, `4eb403f` worker `server-only` fix — all ancestors of HEAD            |
| Merge conflicts vs `release/v0.5.0-rc.1` | None (`git merge-tree` exit 0)                                                                                                     |
| GitHub CI                                | Quality workflow passed on the branch (runs `46115842142`, `46116130003`)                                                          |

Release 1 changes are committed and pushed. Only additive documentation/test commits remain after the verified application commit.

## 2. Production environment

| Area                           | Status                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| SSH (approved root key)        | Reachable                                                                                   |
| Deployed commit                | `4eb403f`                                                                                   |
| Compose project                | `hau_soc_badging_stage2`                                                                    |
| Web / worker / signer / db     | All healthy; web and worker on `stage-studentimport-4eb403f`                                |
| Public and local `/api/health` | ready, database ready, signer ready, notifications ready, worker heartbeat fresh            |
| Migrations                     | 21 applied, 0 pending                                                                       |
| Brevo SMTP secret              | Present (mode 600, 90 bytes); values not read                                               |
| Signing key                    | Present and valid JSON; contents not read                                                   |
| Queue                          | 2 SENT, 2 FAILED, 2 ACCEPTED attempts, 0 STARTED, no in-flight claims                       |
| Public endpoints               | health/login/dashboard/issuer/status-list/credential page/API/download/image/PDF/QR all 200 |
| Media                          | ~1 MB, 3 files                                                                              |
| Disk / memory                  | 9.0 GB free / 1.9 GB available                                                              |

Production is healthy and matches the previous approved release. No degraded state was observed.

## 3. Differences between production and the release candidate

- Code: `4eb403f..81579e9` — additive course catalog, badge library, versions/approvals, shared assignments, migration tooling, tests and documentation (45 files).
- Database: production has 21 migrations; the candidate adds one additive migration (22).
- No existing column is dropped, renamed or made non-null; no historical row is rewritten.
- Environment and secrets are unchanged; no new required secret.

## 4. Backup and recovery verification

Fresh pre-release backup created on production at:

`/var/backups/hau-soc/stage7-release1b-20261128T064647Z`

Contents:

- `badging-db.sql.gz` — MariaDB logical dump (31 tables, routines/triggers, single transaction)
- `media.tar.gz` — badge artwork/media (888 KB)
- `secrets.tar.gz` — secrets directory, signing key and public key (contents not printed)
- `production.env`, `config.tar.gz` — runtime and Docker deployment configuration
- `containers.json`, `images.json` — rollback identifiers
- `SHA256SUMS`

Verification performed:

- `sha256sum -c SHA256SUMS` — all OK
- gzip/tar integrity — OK
- signing key JSON parse — OK (contents not printed)
- Isolated restore into a disposable MariaDB 11.8 — all counts and CRC sums matched production exactly (see migration rehearsal report)

No production application data was modified by the backup.

## 5. Release candidate verification summary

- Migration rehearsal on an isolated copy: PASS, idempotent, no credential/notification changes, no duplicate groups.
- Functional regression: unit 921, integration 159, local E2E 78 passed / 2 intentional skips, Stage 7 E2E 8/8 (desktop + mobile).
- Production public acceptance: 2 passed (desktop + mobile); 6 authenticated production tests skipped because `STAGEH_CREDENTIALS_FILE` was not supplied.
- Production build: PASS.
- Security: authorization, ownership isolation, immutable versions, duplicate prevention and audit coverage verified.

## 6. Blockers

None technical.

Operational prerequisites before deployment:

1. Explicit written authorization and maintenance window for Stage 7 Release 1C.
2. Named deployment operator and rollback owner.
3. Authenticated production acceptance credentials (`STAGEH_CREDENTIALS_FILE`) for post-deploy smoke testing; the public production checks already pass.
4. Confirmation that the release commit to deploy is the branch HEAD at deployment time (application code is unchanged since `81579e9`; only tests/docs follow).
