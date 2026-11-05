# Stage 5C Signing-Key and Issuer Lifecycle Report

**Date:** 4 November 2026  
**Keys rotated/deleted:** No  
**Result:** Local proof/key lifecycle PASS; external status-list publication has a documented blocker

## 1. Issuer identity audit

Local configuration:

- `APP_URL=http://127.0.0.1:3000`
- `ISSUER_URL=http://127.0.0.1:3000/api/issuers/hau-soc`
- `SIGNING_KEY_ID=http://127.0.0.1:3000/api/issuers/hau-soc/keys/key-local`

These are development URLs and must not be carried into production. The production plan is:

1. Set `APP_URL` and `ISSUER_URL` to the final HTTPS domain before generating/registering a
   production key.
2. Use `https://<domain>/api/issuers/hau-soc` as the issuer controller.
3. Use `https://<domain>/api/issuers/hau-soc/keys/<key-id>` as the verification method.
4. Publish the issuer profile and public key at stable HTTPS URLs.
5. Never rewrite historical signed credentials; old proofs retain their original
   `verificationMethod` and issuer identifiers.

## 2. Local proof validation

Verified against local signed records:

- Active signed credential page: **“Cryptographically verified.”**
- API JSON-LD: `DataIntegrityProof`, `eddsa-rdfc-2022`, correct
  `verificationMethod`, revocation status purpose.
- Public key endpoint
  `/api/issuers/hau-soc/keys/key-local`: HTTP 200 JSON-LD.
- Credential download, image, PDF, and QR endpoints: HTTP 200 with expected content types.
- Revoked signed credential page: **“Revoked credential”** and proof recognized.
- The verification service resolves the key referenced by the proof, accepts `RETIRED`
  keys for historical verification, and rejects `COMPROMISED` keys.

## 3. Signing-key inventory

| Status      | Count | Used by signed credentials |
| ----------- | ----: | -------------------------- |
| ACTIVE      |     1 | 9                          |
| RETIRED     |    21 | 0                          |
| COMPROMISED |     2 | 0                          |

- All key records contain public multikey material; no private-key, seed, or secret columns
  exist in the database.
- The single ACTIVE key is used by the used status list and all signed credentials.
- No signed credential references a retired or compromised key.
- The active key is local (`key-local`) and must be replaced with a production HTTPS key via
  the approved lifecycle procedure.

## 4. Lifecycle controls

The runbook `docs/runbooks/open-badges-key-lifecycle.md` covers:

- production key generation in a restricted directory;
- `0600` private-file permissions and no repository/laptop generation;
- public-key registration and activation;
- key rotation, retirement, and compromise response;
- public metadata retention for historical verification;
- separate private-key backup and recovery;
- signer health/metadata matching and controlled proof verification.

Key-service tests cover Administrator-only registration/activation/retirement/compromise,
audit records, unique fingerprints and verification URLs, concurrent activation, never
reactivating a compromised key, rollback on audit failure, and foreign-key protection for
referenced keys.

No rotation or deletion was performed in Stage 5C.

## 5. Status-list publication finding — blocker

`GET /api/status-lists/status-list-local` returns **HTTP 503 “Status list unavailable.”**

Root cause (local data):

- The used status list is at version **2**.
- Its allocations retain `statusListVersion` values of **0/1**.
- The public status-list route intentionally fails closed when a revoked allocation’s
  `statusListVersion` does not equal the current list version.
- The local bootstrap script was rerun and incrementing the list version does not refresh
  allocation versions; this is a local bootstrap/data-state issue, not a signed-proof
  tamper.

Impact:

- The application’s own verifier reads the signed status list from the database, so local
  public credential pages still display valid/revoked correctly.
- External Open Badges consumers fetching the signed status-list URL receive 503, preventing
  interoperable status verification.
- This must be remediated before production/external verification.

Remediation options (not executed; requires approval):

1. Regenerate the signed status list through the approved revocation/status-list service so
   allocation versions and the published list version are synchronized, preserving the
   signed bit states.
2. Or correct allocation `statusListVersion` values in a reviewed maintenance change and
   regenerate the signed list. Do not hand-edit signed JSON or rotate keys.
3. Add an integrity check to prevent the bootstrap from incrementing the list version without
   updating allocation versions.
4. Re-run the status-list endpoint and proof checks after remediation.

## 6. Verdict

**Local signing/proof validation: PASS.**  
**Key lifecycle documentation/controls: PASS locally.**  
**External status-list availability: BLOCKED by the version/allocation mismatch above.**  
**Production key execution: PENDING APPROVAL** — no rotation, deletion, or production key
generation was performed.
