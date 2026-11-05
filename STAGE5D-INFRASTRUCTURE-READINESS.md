# Stage 5D Infrastructure Readiness

**Date:** 5 November 2026  
**Scope:** Production infrastructure preparation only  
**Production deployment executed:** No  
**Live DNS/email/DNS changed:** No  
**Commit/push/merge:** No

## 1. Audit summary

| Area         | Current state before Stage 5D                                          | Production difference                                                                |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Compose      | `compose.yaml` development stack with Mailpit, seed, and test profiles | New `compose.production.yaml` with no Mailpit, no test service, opt-in tools profile |
| Images       | Tag-only MariaDB/Alpine/Mailpit; Node base tag without digest          | Production images pinned by digest; Dockerfile Node base pinned by digest            |
| Web exposure | Published on all interfaces on `3000`                                  | Bound to `127.0.0.1:3001`, internal target remains `3000`                            |
| Database     | Published on `127.0.0.1:3307` for local E2E                            | Not published; internal network only                                                 |
| Signer       | Internal `3101`, read-only, host secret file                           | Internal only, non-root, read-only, no capabilities                                  |
| Networks     | Default bridge plus implicit service DNS                               | Explicit `internal` network plus restricted `egress`                                 |
| Volumes      | `mariadb_data`, `media_data`                                           | Adds `mariadb_binlogs`; signing key remains a secret file                            |
| Secrets      | Environment values and a host-bound signing key file                   | Docker file secrets plus runtime entrypoint; no secret in templates                  |
| Backups      | DB + media logical backup; signing key excluded                        | Separate encrypted signing-key backup; binlog retention and PITR assessment          |
| Monitoring   | `/api/health` and Docker health checks                                 | Health script, thresholds, canary, log rotation, and alert matrix                    |
| Proxy        | No Nginx Proxy Manager instance detected                               | Prepared NPM forward/TLS/body-size guidance                                          |
| Dependencies | Stage 5C baseline                                                      | `npm audit --omit=dev`: 0 vulnerabilities                                            |

## 2. Environment observations

- Host Docker 29.7.2, Docker Compose v5.5.0, Node.js 22.
- Host port `3001` was unused before preparation.
- Existing local app used `3000`; MariaDB used `127.0.0.1:3307`.
- No running Nginx Proxy Manager container was found. Existing proxy hosts and certificates were not
  touched.
- Production stack was rehearsed under a separate Compose project (`hau_soc_staging5d`) on
  `127.0.0.1:3001`, with synthetic data and a local Mailpit sink.

## 3. Deliverable map

| Artifact                                           | Purpose                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `compose.production.yaml`                          | Production services, networks, volumes, secrets, health, log rotation |
| `deploy/staging.override.yaml`                     | Staging-only Mailpit overlay; never production                        |
| `deploy/production.env.example`                    | Non-secret production environment template                            |
| `deploy/secrets/README.md`                         | Secret file names, permissions, and generation guidance               |
| `deploy/docker-entrypoint-secrets.sh`              | Runtime bridge from `/run/secrets` to application env                 |
| `deploy/nginx-proxy-manager/advanced.conf.example` | NPM body-size/timeout/HSTS guidance                                   |
| `deploy/monitoring/README.md`                      | Monitors, thresholds, logs, privacy                                   |
| `scripts/production-healthcheck.sh`                | Metrics/alerts for health, queue, webhook, disk, backup, status list  |
| `scripts/backup-signing-key.sh`                    | Encrypted, separate signing-key backup                                |
| `scripts/worker-healthcheck.mjs`                   | Worker heartbeat container health check                               |
| Updated `scripts/backup.sh` / `scripts/restore.sh` | Support MariaDB `_FILE` secrets used by production                    |

## 4. Readiness verdict

**Infrastructure preparation: PASS.**  
**Staging rehearsal: PASS.**  
**Nginx Proxy Manager live validation: PENDING (NPM not installed on this host).**  
**Production GO/NO-GO: NO-GO** pending approved DNS/TLS, Brevo/recipient activation, production key
execution, NPM proxy-host creation, and resolution of the exact-recipient email allowlist limitation.

No production deployment, live email, DNS change, key rotation, or proxy/certificate modification was
performed.
