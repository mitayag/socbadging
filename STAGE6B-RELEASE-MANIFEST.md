# Stage 6B Release Manifest

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Deployment performed:** No  
**Live email sent:** No  
**Overall deployment readiness:** **BLOCKED**  
**Live external email readiness:** **PASS for Brevo domain/sender authentication**; pilot still **BLOCKED** pending production configuration verification and approval

## 1. Status matrix

| Gate                                     | Result        | Evidence                                                                                                   |
| ---------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Source state identified                  | PASS          | Base commit + dirty-tree hashes below                                                                      |
| Stage 5F/6A changes classified           | PASS          | Section 3                                                                                                  |
| Production images built                  | PASS          | Worker/web linux/amd64 images                                                                              |
| Image checksums recorded                 | PASS          | Section 4                                                                                                  |
| Schema compatibility in source           | PASS          | Existing columns only; no Prisma changes                                                                   |
| New migration required                   | NO            | 21 migrations; no schema/migration diff                                                                    |
| Production schema verified               | BLOCKED       | No authorized production DB inspection                                                                     |
| Relevant regression suite                | PASS          | Unit/integration/Stage 6A/Phase 8 below                                                                    |
| Full Playwright suite                    | NOT CLEAN     | Local dev-server navigation timeouts; see §6                                                               |
| Production worker image verified         | BLOCKED       | Host inspection not available                                                                              |
| Production web rollback image captured   | BLOCKED       | Must be captured on host before deployment                                                                 |
| Brevo sender/DNS authentication          | **PASS**      | Administrator screenshots: `hausoc.org` authenticated, `badges@hausoc.org` verified, DKIM/DMARC configured |
| Deployment authorization/window/operator | BLOCKED       | Not supplied                                                                                               |
| Existing credential verifiability        | PARTIAL       | Issuer/key/status-list HTTP 200; specific credential check pending                                         |
| Commit/push                              | NOT PERFORMED | Working tree remains uncommitted                                                                           |

## 2. Source identification

This release was **not** built from an anonymous working tree. The build context was copied to an
isolated snapshot and hashed before building.

| Item                       | Value                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Branch                     | `release/v0.5.0-rc.1`                                                                           |
| Base commit                | `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`                                                      |
| Working tree               | Dirty/uncommitted                                                                               |
| Tracked diff SHA-256       | `022cc328c19fbafd04bdf90feeb5c73d324d2a13d343f8930c17ee3ce965e14f`                              |
| Untracked manifest SHA-256 | `1030a14332d0ccc2d4afb93f29714c7e7627a24e894febfdc8ac4da5a29ec61e`                              |
| Source snapshot SHA-256    | `a8c209e18d5f034d46eba36a7fb3d4a809306eed5da3335b9bc016e9c1a4e51b`                              |
| Source files in snapshot   | 688                                                                                             |
| Snapshot path              | `/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-source-20261122T103413Z`     |
| Build context exclusions   | `.git`, `node_modules`, `.next`, root `storage`, test artifacts, `.env*`, `docs`                |
| Dockerfile                 | `Dockerfile` (pinned Node base)                                                                 |
| Node base image            | `node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5` |
| Package lock SHA-256       | `142cc981b2fc5d0b99e4859ef6e8ab5796285a1f693a73e2f6879395c3e2909c`                              |
| Package version            | `0.5.0-rc.1`                                                                                    |
| Prisma schema SHA-256      | `ad96d60a857fa9d39be60746a5a1a62f1bd3b12de1ba00f981ce864af401a3da`                              |

**Safeguard:** this snapshot is identifiable but not a committed release. Do not deploy until the
same content is committed/tagged through the approved release process, or an authorized operator
explicitly accepts the dirty-tree snapshot hash above.

## 3. Change classification

### 3.1 Worker reliability fix

- `src/worker.ts`
- `src/modules/notifications/services/worker-runtime.ts` (new)
- `src/modules/notifications/services/worker-runtime.test.ts` (new)
- `src/modules/notifications/services/delivery-worker.test.ts`
- `src/config/env.ts`
- `src/config/env.test.ts`
- `scripts/worker-healthcheck.mjs`
- `.env.example`
- `deploy/production.env.example`
- `compose.production.yaml`
- `docs/operations/email-delivery-operations.md` (related operational note)

Purpose: bound worker cycles and heartbeat writes, terminate after repeated timeouts, add bounded
MariaDB timeouts, and make polling interruptible. No schema change.

### 3.2 SMTP reliability improvements

- `src/modules/notifications/services/smtp-client.ts`
- `src/modules/notifications/services/smtp-client.test.ts` (new)
- `src/modules/notifications/services/smtp-timeout.integration.test.ts` (new)

Purpose: connection/greeting/socket timeouts and local stall/closed-port regression coverage. No
external email sent.

### 3.3 Email templates and worker rendering

- `src/modules/notifications/templates/template-utils.ts`
- `src/modules/notifications/templates/issued-email.ts`
- `src/modules/notifications/templates/email-templates.test.ts`
- `src/modules/notifications/services/delivery-worker.ts`
- `src/modules/notifications/services/delivery-worker.test.ts`
- `docs/operations/email-delivery-operations.md`

Purpose: official HAU SOC issued-badge email, immutable snapshot display/description, portal and
social links, with fallback for historical/malformed snapshots. No migration: the worker reads
existing `badge_issuances.recipient_snapshot_json` and `achievement_snapshot_json` columns.

### 3.4 Social sharing

- `src/components/verification/share-controls.tsx`
- `src/components/verification/share-controls.test.tsx`
- `src/components/verification/public-credential.tsx`
- `src/components/verification/public-credential.test.tsx`
- `src/components/student/student-credential-detail.tsx`
- `src/app/credentials/[publicId]/page.tsx`
- `src/app/credentials/[publicId]/page.test.tsx`
- `e2e/stage6a-sharing.spec.ts` (new)
- `e2e/global-setup.ts`
- `docs/student-portal/BADGE-SHARING.md`
- `docs/operations/known-limitations.md`

Purpose: LinkedIn certification add-to-profile, privacy-safe Open Graph/Twitter metadata, and
suppression/noindex when global sharing is disabled. No schema change.

### 3.5 Stage 6B test hardening

- `e2e/phase6-regression.spec.ts`

Purpose: start the public-HTML rate-limit test at a fresh fixed window so slow local rendering cannot
cross the 60-second boundary mid-assertion. Test-only change; no runtime behavior change.

### 3.6 Documentation and evidence only

Untracked Stage 5E/5F/6A/6B reports and checklists are not runtime release inputs. They are excluded
from the build snapshot only where `docs` is excluded; root-level reports are present in the snapshot
but not executed.

No `prisma/schema.prisma`, `prisma/migrations/*`, `package.json`, or `package-lock.json` changes are
part of this release.

## 4. Production image manifest

Build command pattern:

```sh
docker buildx build --platform linux/amd64 --target <worker|runner> \
  --tag <tag> --label org.opencontainers.image.revision=6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f-dirty \
  --label io.hau.soc.source-tree-sha256=a8c209e18d5f034d46eba36a7fb3d4a809306eed5da3335b9bc016e9c1a4e51b \
  --load <snapshot>
```

| Service | Tag                                                   | Image ID                                                                  | Architecture  | Compressed tar SHA-256                                             |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| Worker  | `hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f` | `sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379` | `linux/amd64` | `3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed` |
| Web     | `hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f`    | `sha256:927561474586020d4753446bd52328c9af9f597e22ae3c1874bb1589a7204d38` | `linux/amd64` | `26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7` |

Local tar directory:

```text
/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images/
```

The worker image contains `worker-runtime.ts`, `runWorkerLoop`, SMTP timeouts, and the updated issued
email template. The web image contains `/app/server.js`, `.next/static`, and `/app/public`.

## 5. Rollback manifest

| Service     | Rollback image                                                                               | Status                                                           |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Worker      | Reported original: `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914` | **Must be verified/captured on host before deployment**          |
| Web         | Unknown                                                                                      | **BLOCKED — capture current production image ID/digest on host** |
| Signer      | Unchanged                                                                                    | Do not replace for Stage 6B                                      |
| Database    | No migration                                                                                 | Do not restore for application rollback                          |
| Signing key | Unchanged                                                                                    | Do not rotate                                                    |

A worker-only rollback tag must be created before replacement:

```sh
docker image tag "$(docker inspect -f '{{.Image}}' hau_soc_badging_stage2-worker-1)" \
  hau-soc-badging-worker:pre-stage6b
```

A web rollback tag must be created the same way from the current web container. Do not assume the
reported worker digest is still deployed; verify it on the host.

## 6. Verification evidence

### 6.1 Source and static gates

| Gate                                  | Result                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| `npm run format`                      | PASS                                                              |
| `npm run lint`                        | PASS                                                              |
| `npm run typecheck`                   | PASS                                                              |
| Docker worker build                   | PASS                                                              |
| Docker web build                      | PASS                                                              |
| Worker image smoke (local DB/Mailpit) | PASS — cycles `ready`, 0 processed, no restart, no external email |
| Web image content check               | PASS                                                              |

### 6.2 Automated tests

| Suite                               | Result                           |
| ----------------------------------- | -------------------------------- |
| Unit                                | **117 files / 875 tests PASS**   |
| Integration                         | **21 files / 150 tests PASS**    |
| Stage 6A + Phase 8 Playwright       | **20 passed** (desktop + mobile) |
| Rate-limit E2E after test hardening | **1 passed** (desktop)           |
| Full Playwright suite               | **NOT CLEAN** — see below        |

Full Playwright run after the rate-limit fix: 57 passed, 3 failed, 1 skipped, 1 did not run. The
failures were navigation/load timeouts in older mobile audit, dashboard, and management specs while
running the local Docker `next dev` server; individual reruns passed for the same tests. This is
recorded as local E2E environment flakiness, not a release PASS. Do not use the full-suite run as
production acceptance evidence.

### 6.3 Schema/migrations

- 21 migrations present; test database `prisma migrate status` reports up to date.
- No migration files or Prisma schema changes in this release.
- Runtime queries use existing `operational_heartbeats.mail_status` and
  `badge_issuances.recipient_snapshot_json`/`achievement_snapshot_json`.
- Fresh disposable migration parity was previously validated in Stage 5B/5E.1.
- **Actual production schema/migration ledger: verification BLOCKED** until an authorized operator
  runs the read-only checks in the deployment runbook.

### 6.4 Public credential verifiability

Read-only production checks at manifest time:

| Endpoint                        | Result                                                               |
| ------------------------------- | -------------------------------------------------------------------- |
| `/api/health`                   | HTTP 200; database/signer/notifications ready; heartbeat fresh       |
| Issuer/key endpoint             | HTTP 200                                                             |
| Status list `status-list-local` | HTTP 200, signed JSON-LD                                             |
| Specific production credential  | **BLOCKED** — no production public ID supplied for a read-only check |

No signing-key, schema, or credential-data change is part of this release, so historical
verifiability should remain intact. Post-deployment verification must still use an actual production
public ID selected read-only by the operator.

## 7. Brevo authentication verification

**Confirmed by administrator-provided Brevo screenshots (22 November 2026):**

| Check                      | Administrator evidence | Result |
| -------------------------- | ---------------------- | ------ |
| `hausoc.org` domain        | Authenticated          | PASS   |
| `badges@hausoc.org` sender | Verified               | PASS   |
| DKIM                       | Verified               | PASS   |
| DMARC                      | Configured             | PASS   |
| Branded subdomain          | `badges`               | PASS   |
| Sending infrastructure     | Shared IP              | PASS   |

The production sender identity is:

```text
HAU SOC Badging System <badges@hausoc.org>
```

Public DNS still shows `hausoc.org` SPF without a Brevo include. Because Brevo reports the domain as
authenticated and DKIM verified, DKIM/DMARC can provide authentication; however SPF alignment remains
a deliverability observation for the operator. Do not change DNS as part of this release. Do not
claim SPF PASS without provider/DNS confirmation.

The earlier `badges@hau.edu.ph` candidate is not the production sender and must not be used.

## 8. Readiness decision

**Source/test/image preparation: PASS.**  
**Brevo domain/sender authentication: PASS** per administrator screenshots.  
**Production deployment readiness: BLOCKED** because the source is uncommitted, production
worker/web image IDs and schema ledger are unverified, rollback web image is not captured, and no
deployment authorization/window/operator was supplied.  
**Live email pilot: BLOCKED** pending production application configuration verification, worker
transport confirmation, queue/backups, approved recipient/window, and explicit send authorization.

No deployment, restart, migration, production account change, real badge issuance, DNS change, key
rotation, live email, commit, or push was performed.
