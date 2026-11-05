# Stage 5D Production Environment Checklist

**Template:** `deploy/production.env.example`  
**Target path:** `/etc/hau-soc/production.env` (mode `0600`)  
**Secrets:** `/etc/hau-soc/secrets/` (mode `0700`, files `0600`)

Do not copy `.env`, development passwords, local signing keys, or Mailpit settings into production.

## 1. Required non-secret values

| Variable                            | Example                                                          | Required     | Notes                                                                |
| ----------------------------------- | ---------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| `APP_BIND_ADDRESS`                  | `127.0.0.1`                                                      | Yes          | Loopback when NPM is local; private interface otherwise              |
| `APP_HOST_PORT`                     | `3001`                                                           | Yes          | Dedicated NPM-facing host port                                       |
| `APP_URL`                           | `https://badges.hau.edu.ph`                                      | Yes          | Canonical HTTPS origin; used for cookies/origin checks               |
| `ISSUER_URL`                        | `https://badges.hau.edu.ph/api/issuers/hau-soc`                  | Yes          | Must match the issuer controller                                     |
| `ISSUER_NAME`                       | `Holy Angel University — School of Computing`                    | Yes          | Public issuer display name                                           |
| `ISSUER_LOGO_PATH`                  | `/images/hausoclogo.png`                                         | Yes          | Safe root-relative path                                              |
| `TRUST_PROXY`                       | `true`                                                           | Yes          | Only with NPM overwriting forwarding headers                         |
| `MARIADB_DATABASE`                  | `badging`                                                        | Yes          | Database name                                                        |
| `MARIADB_USER`                      | `badging`                                                        | Yes          | Application DB user                                                  |
| `MARIADB_BINLOG_RETENTION_DAYS`     | `14`                                                             | Yes          | PITR window                                                          |
| `SIGNING_KEY_ID`                    | `https://badges.hau.edu.ph/api/issuers/hau-soc/keys/key-2026-01` | Yes          | Public verification method                                           |
| `SIGNING_PUBLIC_MULTIKEY`           | `z6Mk...`                                                        | Yes          | Public only                                                          |
| `SIGNING_KEY_FINGERPRINT`           | `z6Mk...`                                                        | Yes          | Public only                                                          |
| `SIGNING_CRYPTOSUITE`               | `eddsa-rdfc-2022`                                                | Yes          | Fixed cryptosuite                                                    |
| `SIGNER_TIMEOUT_MS`                 | `5000`                                                           | Yes          | Signer request timeout                                               |
| `EMAIL_DELIVERY_MODE`               | `brevo`                                                          | Yes          | Production provider                                                  |
| `EXTERNAL_EMAIL_ENABLED`            | `true`                                                           | Yes          | Enables Brevo transport                                              |
| `CONTROLLED_ACCEPTANCE_ONLY`        | `false`                                                          | Yes          | Set `true` only for approved acceptance                              |
| `EXTERNAL_EMAIL_ALLOWLIST`          | `authorized-recipient@hau.edu.ph`                                | Yes*         | Current code requires a non-empty exact-recipient list in Brevo mode |
| `BREVO_SMTP_HOST`                   | `smtp-relay.brevo.com`                                           | Yes          | Port 587 STARTTLS                                                    |
| `BREVO_SMTP_PORT`                   | `587`                                                            | Yes          | Required by config validation                                        |
| `BREVO_SMTP_USER`                   | provider login                                                   | Yes          | Non-secret username                                                  |
| `BREVO_SENDER`                      | `HAU SOC Badging System <badges@hau.edu.ph>`                     | Yes          | Approved sender                                                      |
| `BREVO_WEBHOOK_ENABLED`             | `true`                                                           | Yes          | Enables `/api/webhooks/brevo`                                        |
| `NOTIFICATION_*`                    | defaults                                                         | Yes          | Worker cadence/retry settings                                        |
| `BOOTSTRAP_ADMIN_NAME`              | `System Administrator`                                           | Seed only    | Initial Administrator display name                                   |
| `BOOTSTRAP_ADMIN_EMAIL`             | `admin@hau.edu.ph`                                               | Seed only    | Initial Administrator login                                          |
| `SECRETS_DIR`                       | `/etc/hau-soc/secrets`                                           | Yes          | Compose secret file directory                                        |
| `BACKUP_ROOT`                       | `/var/backups/hau-soc`                                           | Host scripts | Backup destination                                                   |
| `BACKUP_RETENTION_DAYS`             | `30`                                                             | Host scripts | DB/media retention                                                   |
| `SIGNING_KEY_BACKUP_RETENTION_DAYS` | `365`                                                            | Host scripts | Key backup retention                                                 |
| `BACKUP_ENCRYPTION_PASSPHRASE_FILE` | `/etc/hau-soc/backup-passphrase`                                 | Host scripts | Key-backup encryption                                                |

Stage 5E.1 added explicit LOCAL/STAGING/PRODUCTION recipient policies. Production no longer needs an
allowlist, but every delivery must match an immutable issuance/student envelope and pass suppression
checks. See `STAGE5E1-RECIPIENT-POLICY.md`.

## 2. Required secret files

All files live under `SECRETS_DIR`, mode `0600`:

| File                       | Value                                                    |
| -------------------------- | -------------------------------------------------------- |
| `database_url`             | `mysql://badging:<password>@db:3306/badging`             |
| `db_password`              | Same DB password as in the URL (URL-encoded in the URL)  |
| `db_root_password`         | Unique MariaDB root password                             |
| `signer_token`             | Long random internal bearer token                        |
| `signing_key`              | Private key JSON generated by the approved key lifecycle |
| `brevo_smtp_password`      | Brevo SMTP password/API key                              |
| `brevo_webhook_secret`     | Brevo webhook HMAC secret                                |
| `bootstrap_admin_password` | One-time initial Administrator password                  |

Generate random values:

```sh
sudo install -d -m 700 /etc/hau-soc/secrets
sudo sh -c 'openssl rand -base64 48 > /etc/hau-soc/secrets/signer_token'
sudo sh -c 'openssl rand -base64 48 > /etc/hau-soc/secrets/db_password'
sudo sh -c 'openssl rand -base64 48 > /etc/hau-soc/secrets/db_root_password'
sudo sh -c 'openssl rand -base64 48 > /etc/hau-soc/secrets/brevo_webhook_secret'
sudo sh -c 'openssl rand -base64 48 > /etc/hau-soc/secrets/bootstrap_admin_password'
sudo chmod 600 /etc/hau-soc/secrets/*
```

Then create `database_url` using the same `db_password` value and database host `db`. Never use
`localhost` inside Compose.

## 3. Session and authentication secrets

The application uses database-backed opaque session tokens and does not require a static
`AUTH_SECRET`/`NEXTAUTH_SECRET`. Production authentication secrets are therefore:

- the unique `signer_token`;
- the database credentials;
- the one-time `bootstrap_admin_password`;
- the TLS private key managed by NPM (outside this application).

After the first Administrator sign-in, rotate the bootstrap password through the account flow and
record the rotation. Sessions and password-reset tokens are hashed in MariaDB.

## 4. Signing identity checklist

1. Generate a fresh production key on a controlled system, not a laptop or the repository.
2. Record `SIGNING_KEY_ID`, public multikey, and fingerprint from the public metadata only.
3. Place the private key in `SECRETS_DIR/signing_key`, owner readable by UID 1001.
4. Confirm `ISSUER_URL` equals the key controller.
5. Never reuse local `key-local`, E2E, or smoke-test keys.
6. Never put private key material in `production.env`.

## 5. Public verification URL

`APP_URL` plus `/credentials/<publicId>` is the public verification URL. `APP_URL` plus
`/api/status-lists/<listId>` is the public status-list URL. Both must be HTTPS and externally
reachable through NPM before production issuance.

## 6. Preflight checklist

- [ ] `/etc/hau-soc/production.env` exists, mode `0600`, no local values.
- [ ] All eight secret files exist, mode `0600`.
- [ ] `database_url` uses host `db` and matches `db_password`.
- [ ] Signing key is a fresh production key and its public metadata matches.
- [ ] `APP_URL`/`ISSUER_URL`/`SIGNING_KEY_ID` use the final HTTPS domain.
- [ ] NPM proxy host and certificate are approved and installed.
- [ ] Brevo sender/domain verification and webhook registration are complete.
- [ ] Authorized recipient/allowlist decision is approved.
- [ ] Backups tested; encryption passphrase stored separately.
- [ ] Monitoring and on-call destinations configured.
- [ ] No secret exists in git, shell history, Compose output, or logs.
