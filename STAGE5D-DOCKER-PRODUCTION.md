# Stage 5D Docker Production Configuration

**File:** `compose.production.yaml`  
**Staging overlay:** `deploy/staging.override.yaml`

## 1. Services

| Service      | Image/build                           | Published port           | Purpose                             |
| ------------ | ------------------------------------- | ------------------------ | ----------------------------------- |
| `db`         | `mariadb:11.8` pinned digest          | None                     | Persistent MariaDB with binlogs     |
| `db-init`    | `alpine:3.22` pinned digest           | None                     | One-shot binlog-volume ownership    |
| `migrate`    | local `tools` target                  | None                     | One-shot Prisma migration deploy    |
| `media-init` | `alpine:3.22` pinned digest           | None                     | One-shot media-volume ownership     |
| `signer`     | local `signer` target                 | None                     | Isolated credential signing         |
| `web`        | local `runner` target                 | `127.0.0.1:3001 -> 3000` | Next.js standalone server           |
| `worker`     | local `worker` target                 | None                     | Notification outbox delivery        |
| `seed`       | local `tools` target, `tools` profile | None                     | One-time initial Administrator      |
| `bootstrap`  | local `tools` target, `tools` profile | None                     | Initial key/status-list publication |

Mailpit is intentionally absent from the production file. The staging overlay adds it only for
rehearsal.

## 2. Version pinning

Compose images are pinned by digest:

- MariaDB: `mariadb:11.8@sha256:d9f7eb2637296652f24b484afd5d246f759f49f5babcadc6a9e344c9acb75fbf`
- Alpine: `alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce`
- Node base in `Dockerfile`: `node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5`
- Staging-only Mailpit: `axllent/mailpit:v1.27@sha256:e22dce5b36f93c77082e204a3942fb6b283b7896e057458400a4c88344c3df68`

Record the local image digests for `web`, `worker`, `signer`, and `migrate` in the deployment change
record after the reviewed build.

## 3. Networks

- `internal` (`internal: true`): DB, migration, seed, bootstrap, signer, web, worker.
- `egress` (bridge): web and worker only.

The signer, database, migration, seed, and bootstrap have no route to the internet. Worker egress is
required for Brevo SMTP. Web is attached to `egress` because Docker Desktop did not publish the
internal-only container port during rehearsal; if the target platform publishes correctly from the
internal network, remove web from `egress` and retest NPM connectivity. Never publish MariaDB, worker,
or signer ports.

## 4. Persistent storage

| Volume            | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `mariadb_data`    | MariaDB data directory                         |
| `mariadb_binlogs` | MariaDB binary logs for point-in-time recovery |
| `media_data`      | Badge artwork and credential media             |

The signing key is not a volume. It is a file secret mounted read-only at
`/run/secrets/signing_key` and is never included in DB/media backups.

## 5. Secrets

Sensitive inputs are Docker Compose file secrets:

`database_url`, `db_password`, `db_root_password`, `signer_token`, `signing_key`,
`brevo_smtp_password`, `brevo_webhook_secret`, `bootstrap_admin_password`.

`deploy/docker-entrypoint-secrets.sh` loads the exact values needed by each container from
`/run/secrets` at start. MariaDB uses the official `*_FILE` variables. No secret is baked into an
image or written to a template.

## 6. Health checks

| Service  | Check                                                                      |
| -------- | -------------------------------------------------------------------------- |
| `db`     | `mariadb-admin ping` with the root secret                                  |
| `signer` | internal `/health` returns ready key/cryptosuite                           |
| `web`    | `/api/health` returns HTTP 200                                             |
| `worker` | `scripts/worker-healthcheck.mjs` verifies a heartbeat newer than 5 minutes |

One-shot services (`db-init`, `migrate`, `media-init`) exit successfully and are not long-running.

## 7. Logging and restart behavior

- `json-file` logs, 10 MB per file, 5 files per service.
- `restart: unless-stopped` for db, signer, web, worker.
- `restart: "no"` for one-shot services.
- Web, signer, and worker run read-only with `/tmp` tmpfs. Signer and worker also receive a writable
  `node_modules/.cache` tmpfs for the TypeScript runner.
- `cap_drop: ALL` and `no-new-privileges` on web, worker, signer, migrate, seed, and bootstrap.
- Signer and worker run as UID/GID `1001`.

## 8. Validate and deploy commands

These commands must be reviewed and executed only during an approved deployment window. They were
not executed against production in Stage 5D.

```sh
# 1. Prepare host configuration (once)
sudo install -d -m 700 /etc/hau-soc /etc/hau-soc/secrets
sudo cp deploy/production.env.example /etc/hau-soc/production.env
sudo chmod 600 /etc/hau-soc/production.env
# Create each secret file per deploy/secrets/README.md, mode 0600.

# 2. Validate
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml config --quiet

# 3. Build and start foundation
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml build
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml up -d db-init db
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml run --rm migrate

# 4. Start signer, seed the initial Administrator, publish initial status list
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml up -d signer
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml --profile tools run --rm seed
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml --profile tools run --rm bootstrap

# 5. Start the application and worker
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml up -d media-init web worker

# 6. Verify
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/status-lists/status-list-local >/dev/null
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml ps
docker compose --env-file /etc/hau-soc/production.env -f compose.production.yaml logs --tail=100 web worker signer
```

`bootstrap` is idempotent: rerunning it returns `statusListUpdated: false` and never overwrites a
published status list.

## 9. Staging rehearsal command

```sh
docker compose -p hau_soc_staging5d \
  --env-file <staging.env> \
  -f compose.production.yaml \
  -f deploy/staging.override.yaml \
  up -d
```

The staging overlay forces Mailpit transport and never sends external email.
