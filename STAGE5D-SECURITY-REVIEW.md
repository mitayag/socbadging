# Stage 5D Security Review

**Date:** 5 November 2026  
**Scope:** Production Compose, Dockerfile, secrets, networks, reverse proxy preparation, signer
isolation, rate limiting, headers, and dependencies  
**Production deployed:** No

## 1. Controls verified in staging

| Control                          | Result                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| Web non-root runtime             | PASS — runner user `nextjs` (UID 1001)                                 |
| Web read-only root filesystem    | PASS                                                                   |
| Web capability drop              | PASS — `cap_drop: ALL`, `no-new-privileges`                            |
| Signer non-root                  | PASS — UID/GID 1001                                                    |
| Signer read-only root filesystem | PASS                                                                   |
| Signer public exposure           | PASS — no published ports; internal network only                       |
| Worker non-root/read-only/caps   | PASS — UID 1001, read-only, `cap_drop: ALL`                            |
| Database public exposure         | PASS — no published ports; internal network only                       |
| Secrets in image/templates       | PASS — file secrets only; templates contain placeholders               |
| Secrets in logs                  | PASS by inspection — structured logging redacts email/secret-like keys |
| Public status-list proof         | PASS — independent external verification                               |
| Worker heartbeat health          | PASS                                                                   |
| Production dependency audit      | PASS — `npm audit --omit=dev` reports 0 vulnerabilities                |

## 2. Critical/high findings

| Severity | Finding                                                                                               | Impact                                                                                                  | Required action                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| High     | Brevo mode currently requires an exact-recipient allowlist and the worker refuses unlisted recipients | Broad production email cannot be sent until an approved application/config change is made               | Approve and implement a production recipient policy before enabling normal sending                                          |
| High     | Nginx Proxy Manager is not installed/validated on this host                                           | HTTPS/proxy path is documented but not live-tested                                                      | Create the proxy host and certificate in an approved change window                                                          |
| High     | Production signing key and final HTTPS issuer identity are not activated                              | Production credentials cannot be issued safely                                                          | Execute the approved key/issuer activation runbook                                                                          |
| High     | Brevo sender/domain/webhook registration is external                                                  | Email and webhook behavior are unverified in production                                                 | Complete provider and DNS approval                                                                                          |
| Medium   | Web is attached to the `egress` bridge                                                                | Web has outbound network access; a compromised web process could make outbound connections              | Remove web from `egress` on platforms where internal-network port publishing works, or restrict egress at the host firewall |
| Medium   | MariaDB retains the image's default capability set                                                    | DB container has more privileges than needed, though it is internal-only and `no-new-privileges` is set | Trial a reduced capability set on the approved platform; keep DB off all public networks                                    |
| Medium   | Docker Compose file secrets are bridged into process environment                                      | Same-UID process inspection can read secret environment variables                                       | Keep containers read-only/non-root, minimize processes, restrict host access, rotate secrets on exposure                    |
| Medium   | `log-bin-trust-function-creators=1` is enabled for migrations with binlogging                         | Allows the application DB user to create triggers with binlog; required for this schema                 | Scope the DB user to the application database and review before changing                                                    |
| Low      | Logs use local `json-file` rotation only                                                              | No central tamper-resistant log store                                                                   | Ship logs to an access-controlled collector; alert on security events                                                       |
| Low      | WebSockets are not required                                                                           | NPM WebSockets should remain off                                                                        | Keep disabled unless a future feature requires it                                                                           |

No critical finding was identified in the prepared production configuration.

## 3. Container privilege review

Staging inspection:

| Service  | User                               | Read-only | Capabilities  | Ports                    |
| -------- | ---------------------------------- | --------- | ------------- | ------------------------ |
| `web`    | `nextjs` (1001)                    | Yes       | dropped all   | `127.0.0.1:3001 -> 3000` |
| `signer` | `1001:1001`                        | Yes       | dropped all   | none                     |
| `worker` | `1001:1001`                        | Yes       | dropped all   | none                     |
| `db`     | image default (`mysql` internally) | No        | image default | none                     |

`web`, `signer`, and `worker` use `no-new-privileges`. The signer has no host port and no egress
network. The database has no host port and is only on the internal network.

## 4. Secret handling

- Production secrets are file-based Compose secrets under `/run/secrets`.
- MariaDB uses `MARIADB_PASSWORD_FILE` and `MARIADB_ROOT_PASSWORD_FILE`.
- Application containers use the minimal entrypoint bridge; secrets are not copied into images.
- The signing key is mounted read-only and excluded from DB/media backups.
- Templates and reports contain placeholders only; no production secret was generated or activated.
- Rotate `signer_token`, webhook secret, SMTP password, and DB passwords through the documented
  procedure after suspected exposure.

## 5. Network isolation

- `internal` network has no gateway; DB, signer, migration, seed, and bootstrap cannot reach the
  internet.
- Worker has `internal` for DB and `egress` for Brevo SMTP.
- Web has `internal` for DB/signer and `egress` because Docker Desktop did not publish an
  internal-only port during staging. Remove web from `egress` if the target platform publishes from
  the internal network.
- Only the web port is published, bound to loopback by default.
- NPM on another machine requires a private binding/firewall or restricted private network.

## 6. TLS and proxy headers

- NPM terminates TLS with a publicly trusted certificate.
- `TRUST_PROXY=true` is safe only when NPM is the sole path and overwrites `X-Forwarded-For`.
- Application security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, and route-specific CSP/no-store headers.
- HSTS should be enabled only after the final HTTPS hostname is stable.
- NPM `client_max_body_size` must be raised to support badge/import payloads (example: 8 MB).

## 7. Rate limiting

The application uses MariaDB-backed fixed-window rate limits for login, reset, account, public HTML,
public JSON, import, export, and media. Production should keep NPM's optional rate limiting as
defense-in-depth only; do not rely on it to replace application authorization. Ensure NPM is the only
source that can set forwarding headers before enabling `TRUST_PROXY`.

## 8. Signer isolation

- Separate container, non-root, read-only filesystem, no capabilities, no published port, no egress.
- Only web can reach `signer:3101` over the internal network.
- Private key file is mode `0600`, owned/readable by UID 1001.
- Signer rejects unsafe key file permissions and mismatched public metadata.
- No private key, seed, or token is stored in MariaDB or logs.

## 9. Credential and PII handling

- Public credential pages minimize recipient identity and do not expose recipient email.
- Notification logs and DTOs mask recipient email.
- Backup archives contain private data and must be encrypted/access-controlled.
- Monitoring uses counts and a synthetic canary; do not use real student credentials as canaries.

## 10. Dependency vulnerabilities

`npm audit --omit=dev`: **0 critical, 0 high, 0 moderate, 0 low**.

Full `npm audit` (including build/test tooling) reports dev-only advisories in tools such as Vite.
Those packages are not present in the production runner image, which contains the standalone Next.js
output and production dependencies. Continue rechecking after tooling upgrades.

## 11. Security verdict

**Prepared production configuration: PASS for staging use.**  
**Production security sign-off: BLOCKED** by the high findings above (external activation and the
exact-recipient allowlist limitation). No critical finding was found, and the container/signing
isolation controls passed staging inspection.
