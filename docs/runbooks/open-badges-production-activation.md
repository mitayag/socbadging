# Open Badges Production Activation

This checklist activates a locally verified issuer on its final public domain. It does not itself
grant 1EdTech certification.

## Final HTTPS identity

1. Select the permanent public HTTPS origin before production issuance. Set `APP_URL`, `ISSUER_URL`,
   verification-method, credential, and status-list URLs beneath it. Never issue production
   credentials with localhost, private names, temporary tunnels, or staging URLs; issued identifiers
   are immutable.
2. Configure DNS and a publicly trusted TLS certificate at the reverse proxy. Redirect HTTP to
   HTTPS. Keep `TRUST_PROXY=false` unless the proxy overwrites forwarding headers.
3. From an external network, retrieve the issuer profile, public Multikey, representative
   credential, status list, and human verification page without authentication. Confirm private
   recipient and operational data are absent.

## Fresh production key and retrieval demonstration

1. Follow the key-lifecycle runbook to generate a fresh production key on a controlled system. Do
   not reuse development, test, demonstration, or smoke-test keys.
2. Register and activate its public metadata. Configure the read-only Compose secret and unique
   internal token through the deployment secret store.
3. Build and start `db`, `migrate`, `signer`, and `web`. Confirm no signer host port exists and
   `/api/health` reports the exact production key ID and `eddsa-rdfc-2022` without key material.
4. Issue, externally retrieve, download, verify, revoke, and status-check controlled individual and
   batch credentials.

## Official conformance checkpoint

1. Record the release commit, dependency versions, final domain, public issuer/key/status URLs, and
   the Task 11 local conformance report.
2. Run the currently applicable official 1EdTech Open Badges 3.0 suite against the production HTTPS
   issuer. Preserve complete evidence and resolve every required failure; local tests are supporting
   evidence, not a substitute.
3. Use an institution-approved conformance recipient, never a real student's private data.
4. Demonstrate external retrieval and validation of proof, issuer/controller binding, dates, and
   revocation state.
5. Submit through the official 1EdTech process and retain submission ID, scope/version, findings,
   approval date, and renewal obligations.

Until written approval covers the deployed product/version, say only **Open Badges 3.0-aligned** or
**local conformance readiness evidence**. Do not use “Open Badges certified,” certification marks,
or equivalent wording. After approval, legal/product owners must confirm permitted wording, mark
usage, scope, and expiry before changing public copy.
