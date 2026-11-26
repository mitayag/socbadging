# Stage H — Issuer Configuration Correction

**Date:** 24 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Status:** Prepared — no production change applied  
**Scope:** web configuration only; no key, credential, schema, worker, database, or signer change

## 1. Confirmed failure

```text
GET /api/issuers/hau-soc
HTTP 200
id: https://badges.example.edu/api/issuers/hau-soc
verificationMethod: []

GET /api/issuers/hau-soc/keys/staging-2026-11
HTTP 404 {"error":"Not found"}

Signed status-list proof:
verificationMethod: https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11
```

The signer itself is healthy, and `/api/health` is ready. The public issuer/key routes construct
their controller URL from `APP_URL`; the production value is still the example
`https://badges.example.edu`.

## 2. Source review

| Component                                              | URL source               | Effect                                                           |
| ------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------- |
| `src/app/api/issuers/hau-soc/route.ts`                 | `getServerEnv().APP_URL` | Builds issuer `id`; queries keys by that controller URL          |
| `src/app/api/issuers/hau-soc/keys/[keyId]/route.ts`    | `getServerEnv().APP_URL` | Builds expected verification URL; 404 on controller/URL mismatch |
| `src/modules/issuance/services/credential-snapshot.ts` | `APP_URL` + `ISSUER_URL` | New issuance URLs/issuer metadata only                           |
| `src/modules/verification/types.ts`                    | `APP_URL`                | Public credential URL validation                                 |
| `src/platform/security/origin.ts`                      | `APP_URL`                | Trusted-origin checks for mutating requests                      |

`ISSUER_URL` defaults to `APP_URL` if omitted. The correct production values are:

```text
APP_URL=https://socbadging.hausoc.org
ISSUER_URL=https://socbadging.hausoc.org/api/issuers/hau-soc
```

## 3. Read-only production checks required before change

Do not print secrets.

```sh
WEB=hau_soc_badging_stage2-web-1
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

docker inspect "$WEB" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(APP_URL|ISSUER_URL|ISSUER_NAME|SIGNING_KEY_ID|SIGNING_CRYPTOSUITE)='
```

Expected current finding: `APP_URL` is not `https://socbadging.hausoc.org`.

Inspect the signing-key rows:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, verification_method_url, controller_url, status, retired_at, compromised_at
    FROM signing_keys
    WHERE verification_method_url LIKE '\''%staging-2026-11%'\'';
  "
'
```

Required: `verification_method_url` and `controller_url` use
`https://socbadging.hausoc.org/api/issuers/hau-soc`. If they use `badges.example.edu`, the web-only
env fix alone will not resolve the key; that is a separate data correction requiring approval. Do not
rewrite signed payloads or rotate the key.

Check historical credential host usage:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT
      COUNT(*) AS total,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(issuer_snapshot_json, '\''$.url'\'')) LIKE '\''https://socbadging.hausoc.org%'\'') AS issuer_correct,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(issuer_snapshot_json, '\''$.url'\'')) LIKE '\''https://badges.example.edu%'\'') AS issuer_wrong,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(signed_credential_json, '\''$.proof.verificationMethod'\'')) LIKE '\''https://socbadging.hausoc.org%'\'') AS proof_correct,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(signed_credential_json, '\''$.proof.verificationMethod'\'')) LIKE '\''https://badges.example.edu%'\'') AS proof_wrong,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(credential_json, '\''$.id'\'')) LIKE '\''https://socbadging.hausoc.org/credentials/%'\'') AS url_correct,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(credential_json, '\''$.id'\'')) LIKE '\''https://badges.example.edu/credentials/%'\'') AS url_wrong
    FROM badge_issuances;
  "
'
```

Interpretation:

- `issuer_wrong=0`, `proof_wrong=0`, `url_wrong=0`: historical signed payloads already use the
  correct host; changing env should not invalidate them.
- Any nonzero wrong-host count: those payloads are already externally malformed; changing env will not
  repair stored signatures. They require separate remediation/reissue approval. Do not rewrite them.
- The status-list proof already uses the correct key URL, so fixing the issuer/key route should restore
  its key resolution.

## 4. Minimal proposed change

Change only the web environment values in `/etc/hau-soc/production.env`:

```diff
-APP_URL=https://badges.example.edu
+APP_URL=https://socbadging.hausoc.org
-ISSUER_URL=https://badges.example.edu/api/issuers/hau-soc
+ISSUER_URL=https://socbadging.hausoc.org/api/issuers/hau-soc
```

Preserve all other values and secrets. Then validate and recreate **web only**:

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet

# Preserve current web image/config for rollback.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECORD=/var/tmp/socbadging-stage-h-url-$STAMP
sudo install -d -m 700 "$RECORD"
docker inspect hau_soc_badging_stage2-web-1 | sudo tee "$RECORD/web-before.json" >/dev/null
sudo cp "$ENV_FILE" "$RECORD/production.env.before"

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  up -d --no-deps --no-build web
```

Do not restart db, signer, worker, or migrate. Do not run a migration. Do not change `SIGNING_KEY_ID`
or any signing-key/credential row. Do not reissue credentials.

## 5. Compatibility assessment

- Existing signed credential payloads are stored immutably and are not rewritten by this change.
- New URL generation and public issuer/key resolution use the corrected values.
- Existing credentials with correct stored issuer/proof URLs should continue to verify; the
  selected public-ID checks below confirm this.
- Existing credentials already stored with `badges.example.edu` will not be repaired by this change;
  they require separate remediation/reissue approval.
- The status-list proof already references the correct key URL; after the route fix it should resolve.
- The notification worker's current health is independent of this web change; do not restart it.
- `APP_URL` is also used for trusted-origin checks; correcting it fixes mutating-request origin
  validation.

## 6. Verification after approved change

```sh
BASE=https://socbadging.hausoc.org
curl -fsS "$BASE/api/health"
curl -fsS "$BASE/api/issuers/hau-soc"
curl -fsS -o /dev/null -w 'key_http=%{http_code}\n' \
  "$BASE/api/issuers/hau-soc/keys/staging-2026-11"
curl -fsS "$BASE/api/status-lists/status-list-local"
```

Required:

- health HTTP 200, `readiness=ready`;
- issuer `id=https://socbadging.hausoc.org/api/issuers/hau-soc`;
- nonempty `verificationMethod`;
- key endpoint HTTP 200 with `id`, `controller`, and public multikey;
- status-list proof verificationMethod resolves;
- worker notifications remain ready/fresh.

Then verify a representative existing credential by public ID (read-only):

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT public_id FROM badge_issuances
    WHERE signed_credential_json IS NOT NULL AND status = '\''ACTIVE'\''
    ORDER BY issued_at ASC LIMIT 1;
  "
'
```

Use only the opaque public ID; check page, `/api/credentials/<id>`, status, image/PDF/QR, and
signature/key resolution. Do not expose student PII.

## 7. Rollback

1. Restore the saved `/etc/hau-soc/production.env.before` values for `APP_URL` and `ISSUER_URL`.
2. Recreate **web only** with the same image:
   ```sh
   docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
     up -d --no-deps --no-build web
   ```
3. Verify health/issuer/key/status endpoints.
4. Do not restore the database or rotate keys for this rollback.

## 8. Approval requirement

This is a production web configuration change and web-only recreation. Required:

- Explicit approval for the two env values and web restart.
- Named operator, window, and rollback owner.
- Read-only key/credential host queries reviewed.
- Current backup evidence.
- Confirmation no signing-key, credential, database schema, or signed payload change.

```text
I approve correcting APP_URL and ISSUER_URL to the production URL and recreating only the web
container described in reports/STAGE-H-ISSUER-CORRECTION.md, with operator ________________,
window ________________, and rollback owner ________________.
```

## 9. Current verdict

**Issuer publication: FAIL.**  
**Proposed correction: prepared, not applied.**  
**Existing credential compatibility: PARTIAL — no stored payload is rewritten; historical host usage
must be confirmed read-only.**  
**Full production acceptance: NOT COMPLETE.**

No production configuration, container, database, key, credential, or email was changed.
