# Stage 5D Nginx Proxy Manager Preparation

**Status:** Prepared; live NPM validation pending (no NPM instance detected on this host).  
**Existing proxy hosts/certificates modified:** No.

## 1. Port decision

- Dedicated host port: **3001**.
- Internal application port: **3000** (unchanged).
- Binding: `127.0.0.1:3001` by default (`APP_BIND_ADDRESS=127.0.0.1`,
  `APP_HOST_PORT=3001`).
- Port `3001` was verified unused before preparation.

## 2. NPM on the same VM

Create a Proxy Host:

| Field                 | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Domain Names          | `badges.hau.edu.ph` (final approved hostname)                           |
| Scheme                | `http`                                                                  |
| Forward Hostname/IP   | `host.docker.internal` (Docker Desktop) or the host gateway IP on Linux |
| Forward Port          | `3001`                                                                  |
| Block Common Exploits | Enabled                                                                 |
| Websockets Support    | **Off** (not required by this application)                              |
| Access List           | Restrict to the public internet as intended; no admin bypass            |

On Linux Docker Engine, either add `host.docker.internal:host-gateway` to the NPM container or use the
host's Docker bridge address (commonly `172.17.0.1`) instead of `host.docker.internal`. Do not expose
`3001` on a public interface.

Because NPM is the only route to the app and overwrites `X-Forwarded-For`, set `TRUST_PROXY=true` in
`/etc/hau-soc/production.env`.

## 3. NPM on another machine

The application must not be publicly reachable. Choose one:

1. **Private host binding:** set `APP_BIND_ADDRESS` to a dedicated private interface address (for
   example the private management IP) and firewall port `3001` so only the NPM host can connect.
2. **Private network:** place NPM and the app on a restricted private network/VPN and route only from
   NPM to the app. Do not add a public DNS record for the app port.

Keep `APP_HOST_PORT=3001` for either option.

## 4. TLS and headers

- Use NPM's Let's Encrypt certificate for the final hostname.
- Enable **Force SSL** and **HTTP/2** as appropriate for the institution.
- NPM supplies `X-Forwarded-For`, `X-Forwarded-Proto`, and `Host`; do not override them.
- Add the app-specific advanced configuration from
  `deploy/nginx-proxy-manager/advanced.conf.example`:
  - `client_max_body_size 8m;`
  - `proxy_read_timeout 120s;`
  - `proxy_send_timeout 120s;`
  - optional HSTS only after the hostname has been stable and validated.
- WebSockets are not required. Leave NPM WebSockets support off.

## 5. Verification after NPM proxy-host creation

```sh
curl -I https://badges.hau.edu.ph/login
curl -fsS https://badges.hau.edu.ph/api/health
curl -fsS https://badges.hau.edu.ph/api/status-lists/status-list-local >/dev/null
curl -fsS https://badges.hau.edu.ph/api/issuers/hau-soc >/dev/null
```

Verify:

- HTTP redirects to HTTPS.
- `/api/health` reports `readiness: ready`, signer ready, worker heartbeat fresh.
- Public credential and status-list URLs work without authentication.
- Private routes redirect to login.
- Rate limiting is not bypassed by spoofed forwarding headers (`TRUST_PROXY=true` requires NPM to
  overwrite the header, which it does).
- No MariaDB, worker, or signer port is reachable from the NPM host or network.

## 6. What was not changed

No NPM proxy host, certificate, access list, or global NPM configuration was created or modified in
Stage 5D. Existing applications on the host were not touched.
