# Phase A — Production Discovery

**Date:** 24 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production host/project:** `badging-server` / `hau_soc_badging_stage2`  
**Production changes in this phase:** None

## 1. Current status matrix

| Area                                     | Current result                | Evidence                                                                       |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Public HTTPS                             | PASS                          | `/login` 200, `/api/health` 200                                                |
| Web readiness                            | PASS                          | `readiness=ready`; database/signer ready                                       |
| Database                                 | PASS                          | Health `ready`; operator `SELECT 1` PASS                                       |
| Signer                                   | PASS                          | Health ready; key `staging-2026-11`, `eddsa-rdfc-2022`                         |
| Notification worker                      | **FAIL**                      | Exited with `Brevo SMTP username and password are required`                    |
| Notifications                            | **DEGRADED**                  | Public health `notifications.status=degraded`, heartbeat `stale`               |
| Public issuer/status list                | PASS                          | Both endpoints HTTP 200                                                        |
| Restricted SSH                           | PASS (forced command)         | Attempted `id` returned only the status banner                                 |
| Production Playwright/account acceptance | **NOT TESTED**                | No authorized production test session                                          |
| Backups                                  | PARTIAL                       | Historical VM/DB/media evidence; current and key-backup evidence not available |
| Rollback images                          | PASS (administrator-verified) | Web/worker rollback tags and IDs supplied                                      |

Public health snapshot:

```json
{
  "status": "ok",
  "service": "hau-soc-badging-system",
  "readiness": "ready",
  "database": { "status": "ready" },
  "notifications": { "status": "degraded", "workerHeartbeat": "stale" },
  "signer": {
    "status": "ready",
    "keyId": "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    "cryptosuite": "eddsa-rdfc-2022"
  }
}
```

## 2. Local source and release identity

| Item            | Value                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Local repo      | `<repository-root>`                                                                                                               |
| Branch          | `release/v0.5.0-rc.1`                                                                                                             |
| HEAD            | `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`                                                                                        |
| Working tree    | Dirty/uncommitted                                                                                                                 |
| Source snapshot | `a8c209e18d5f034d46eba36a7fb3d4a809306eed5da3335b9bc016e9c1a4e51b`                                                                |
| Web image       | `hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f` / `sha256:927561474586020d4753446bd52328c9af9f597e22ae3c1874bb1589a7204d38`    |
| Worker image    | `hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f` / `sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379` |
| Architecture    | Both `linux/amd64`                                                                                                                |
| Migrations      | 21; no Stage 6B schema change                                                                                                     |

Local image archives and SHA-256:

```text
/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images/hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7

/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images/hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed
```

New local deployment overrides:

```text
<repository-root>/deploy/production-brevo.override.yaml
8e314a5fda4ab1f00e02c2520a6fd2ea03d9b265062d3d8108f05308e8e3aa2c

<repository-root>/deploy/production-stage6b-images.override.yaml
12d7ca12900e9c82884806b2b74429d447a7b68dbd61c82d1062588659f66337
```

## 3. Production Compose and services

- Services: `db`, `signer`, `web`, `worker`, plus one-shot `migrate`, `media-init`, `seed`, `bootstrap`.
- Web image runs as `nextjs` with `read_only`, no added capabilities, loopback port only.
- Worker runs as `1001:1001`, `read_only`, with database and Brevo password secrets.
- DB/signer are internal-only; web/worker join `internal` and `egress`.
- DB and signer have no published ports.
- Production health checks are wired to `/api/health` and `scripts/worker-healthcheck.mjs`.

## 4. Secret and configuration observations

- `/run/secrets/database_url` and `/run/secrets/signer_token` are present/nonempty.
- `/etc/hau-soc/secrets/brevo_smtp_password` is **0 bytes (empty)**.
- `BREVO_SMTP_USER` is listed in the worker environment; the exact value must be confirmed without
  printing it.
- The worker entrypoint exports only `BREVO_SMTP_PASSWORD` from
  `/run/secrets/brevo_smtp_password`; an empty file makes the Brevo password empty.
- Current worker failure is caused by the empty Brevo password secret, with the username value still
  to be confirmed exactly.
- The Stage 6D override supplies the confirmed `BREVO_SMTP_USER=<redacted-brevo-smtp-username>` for both
  web and worker.

## 5. Network, database, and signer

Operator-supplied evidence:

- Docker DNS resolves `db` and `signer`.
- TCP connections to `db:3306` and `signer:3101` succeed.
- Direct signer `/health` returns HTTP 200 ready.
- MariaDB `SELECT 1` succeeds.
- Database URL format is valid and points at `db:3306/badging`.

These rule out basic DNS/TCP failure. They do not prove application-user authentication or matching
signer key metadata.

## 6. Backups, rollback, and access

Preserved rollback images:

```text
socbadging-web:rollback-20261123
sha256:f80a9d4bdb87779c650c81b8493d0e6723f26294072e9eccd1e45bbcbd089205

socbadging-worker:rollback-20261123
sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914
```

Historical backup evidence is documented in `SOC-BADGING-LIMITED-OPERATIONAL-ACCEPTANCE.md`: VM-level
backup, DB logical restore, and media integrity PASS; separate signing-key backup deferred; off-host
PITR unverified.

The restricted SSH account is confirmed as a forced diagnostic command: attempting `id` returned only
the status banner. No forced login shell, sudo, Docker socket, or forwarding privileges were
independently verified.

## 7. Current blockers

1. Notification worker is down with a Brevo credential configuration error.
2. `/etc/hau-soc/secrets/brevo_smtp_password` is empty and must be restored from the approved
   credential source.
3. No privileged production inspection path was available to this workflow; a reviewed read-only
   operator script is required.
4. Production worker/web image IDs and environment need direct verification on the host.
5. Queue must be confirmed empty before starting the worker.
6. Separate signing-key recovery evidence remains deferred.
7. Production Playwright/account acceptance has not been authorized/executed.
8. Current production backup timestamps and restore evidence are not available from this workspace.
9. The first inspection's `latest_backup=NONE_FOUND` was a directory-name assumption; the corrected
   script discovers backup artifacts by file content and verifies the latest set.

## 8. Operator inspection script

A consolidated read-only script is provided at:

`reports/PHASE-A-OPERATOR-INSPECTION.sh`

It does not start, stop, restart, or modify any production service. It is intended for the authorized
production administrator.

Exact execution path through the approved administrative session:

```sh
scp reports/PHASE-A-OPERATOR-INSPECTION.sh <approved-admin>@badging-server:/tmp/
ssh -t <approved-admin>@badging-server \
  'sudo sh /tmp/PHASE-A-OPERATOR-INSPECTION.sh 2>&1 | sudo tee /var/tmp/socbadging-phase-a-$(date -u +%Y%m%dT%H%M%SZ).log'
```

Do not use `socbadging-test`; it is status-only.
