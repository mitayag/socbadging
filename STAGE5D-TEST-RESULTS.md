# Stage 5D Test Results

**Date:** 5 November 2026  
**Scope:** Production configuration validation and isolated staging rehearsal  
**Live email sent:** No  
**Production deployment:** No

## 1. Static and application gates

| Check                       | Command                    | Result                     |
| --------------------------- | -------------------------- | -------------------------- |
| Format                      | `npm run format`           | PASS                       |
| Lint                        | `npm run lint`             | PASS                       |
| Typecheck                   | `npm run typecheck`        | PASS                       |
| Unit tests                  | `npm test`                 | 115 files / 849 tests PASS |
| MariaDB integration         | `npm run test:integration` | 20 files / 145 tests PASS  |
| Production build            | `npm run build`            | PASS                       |
| Production dependency audit | `npm audit --omit=dev`     | 0 vulnerabilities          |

The integration run used the disposable local database reset and migrated for Stage 5D. Playwright was
not rerun in Stage 5D because no UI behavior changed; Stage 5C.1 E2E evidence remains current.

## 2. Compose validation

```sh
docker compose --env-file <env> -f compose.production.yaml config --quiet
docker compose --env-file <env> -f compose.production.yaml -f deploy/staging.override.yaml config --quiet
```

Both: **PASS**.

Production service list: `db`, `db-init`, `media-init`, `migrate`, `signer`, `web`, `worker`.
Tools profile adds `seed` and `bootstrap`. Mailpit is absent from production.

## 3. Isolated staging rehearsal

Project: `hau_soc_staging5d`  
Host binding: `127.0.0.1:3001`  
Database: synthetic credentials, separate volumes  
Email: local Mailpit only (`smtp` to `mailpit:1025`, UI exposed only on loopback)
Signing key: freshly generated disposable key  
Data: synthetic Administrator and synthetic badge/notification fixture

### Results

| Step                                          | Result                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Build production images                       | PASS                                                                                           |
| Start db-init/db                              | PASS after adding binlog-volume ownership init                                                 |
| Apply all 21 migrations                       | PASS after enabling `log-bin-trust-function-creators` for triggers                             |
| Start signer (UID 1001, read-only)            | PASS                                                                                           |
| Seed synthetic Administrator                  | PASS                                                                                           |
| Initial key registration + signed status list | PASS                                                                                           |
| Web health                                    | HTTP 200, database ready, signer ready, worker heartbeat fresh                                 |
| Public status list                            | HTTP 200, signed JSON-LD                                                                       |
| External status-list proof verification       | PASS (`eddsa-rdfc-2022`, no revoked bits, active index 0 clear)                                |
| Worker synthetic email                        | `SENT` via Mailpit; Mailpit contained the synthetic message                                    |
| DB + media backup                             | PASS, checksums verified                                                                       |
| Encrypted signing-key backup                  | PASS, decrypted archive listed expected files                                                  |
| Restore drill                                 | PASS (post-backup audit marker gone, Administrator/status list restored, media marker removed) |
| Controlled restart                            | PASS (web/worker restarted; health recovered)                                                  |
| Signer outage                                 | Web returned HTTP 503 with `signer: unavailable`                                               |
| Signer recovery                               | Health returned HTTP 200 with matching key ID                                                  |
| Production health script                      | PASS (all metrics OK, `checks_failed=0`)                                                       |
| Bootstrap rerun                               | PASS (`statusListUpdated: false`; published list not overwritten)                              |

## 4. Issues found and fixed during rehearsal

| Issue                                                                                   | Resolution                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Binlog volume was root-owned; MariaDB could not create the index                        | Added `db-init` one-shot to chown the binlog volume to UID/GID 999                                                  |
| Migration trigger creation failed with binlogging enabled                               | Added `--log-bin-trust-function-creators=1`; documented the scoped risk                                             |
| Worker could not import `server-only` modules                                           | Split suppression into a worker-safe core module; web-only authorization stays in the service                       |
| Web port was not published when attached only to the internal network on Docker Desktop | Attached web to the restricted `egress` bridge; documented removing it on platforms where internal publishing works |
| Backup/restore scripts assumed `MARIADB_PASSWORD`                                       | Updated to support `MARIADB_PASSWORD_FILE` used by production secrets                                               |
| Signing-key backup used a BSD-incompatible tar append                                   | Reworked to stage files and create one archive                                                                      |

## 5. What was not tested

- Live Nginx Proxy Manager host, certificate issuance, and proxy headers (NPM not installed here).
- Real Brevo SMTP delivery, webhook registration, DNS/SPF/DKIM/DMARC.
- Production signing key activation and production issuance.
- Off-host binlog shipping and true PITR replay.
- Full Playwright rerun (no UI changes in Stage 5D).

## 6. Test verdict

**Stage 5D staging and configuration validation: PASS.**  
All executable infrastructure checks passed with synthetic data and no live email.
