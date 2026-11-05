# Stage 5E.1 Signing Acceptance

**Date:** 5 November 2026  
**Production key activated:** No  
**Keys rotated/deleted:** No  
**External status-list verification:** PASS locally

## 1. Verification matrix

| Requirement                          | Local evidence                                                                     | Status                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------- |
| HTTPS issuer identity                | Production checklist uses final HTTPS issuer URL; local issuer remains HTTP        | Pending external HTTPS activation |
| Public signing-key publication       | `/api/issuers/hau-soc/keys/key-local` returns public Multikey metadata             | PASS locally                      |
| Active signing-key selection         | Key-service integration tests and signer health                                    | PASS                              |
| Status-list publication              | `GET /api/status-lists/status-list-local` HTTP 200, signed JSON-LD                 | PASS                              |
| Independent status-list verification | Proof verified externally; revoked index 1, active index 2 clear                   | PASS                              |
| Signing-key backup                   | Encrypted key backup decrypted; signer runtime ready with matching public metadata | PASS                              |
| Signing-key restore                  | Restored key loaded by signer runtime; key ID/fingerprint match                    | PASS                              |
| Key rotation/retirement              | Key-service integration tests cover activation, retirement, history                | PASS locally                      |
| Compromised-key rejection            | Key-service and verifier tests reject compromised keys                             | PASS                              |
| Historical credential verification   | Signed issuance, revocation, replacement, and public proof tests                   | PASS                              |

## 2. Issuer and key evidence

Local development identity:

```text
APP_URL=http://127.0.0.1:3000
ISSUER_URL=http://127.0.0.1:3000/api/issuers/hau-soc
SIGNING_KEY_ID=http://127.0.0.1:3000/api/issuers/hau-soc/keys/key-local
```

These are not production URLs. Production activation requires final HTTPS URLs and a fresh
production key; do not rewrite historical credential proofs.

## 3. Status-list evidence

```json
{
  "proofVerified": true,
  "revokedIndexes": [1],
  "expectedRevoked": 1,
  "expectedActive": 2,
  "status": "PASS"
}
```

The verifier fetched the published status list, issuer profile, and verification method over HTTP,
verified the Data Integrity proof directly with `jsonld-signatures`, and decoded the gzip bitstring
without using the application database verifier.

Synthetic staging also published a fresh signed status list with a disposable key and passed the same
external-style verification.

## 4. Key backup and restore evidence

- `scripts/backup-signing-key.sh` created an AES-256-CBC/PBKDF2 encrypted archive.
- The archive decrypted successfully.
- The extracted private key loaded into the signer runtime.
- Signer health returned `ready` with the expected key ID and `eddsa-rdfc-2022`.
- The private key was never printed or committed.

## 5. Test evidence

Targeted signing/status tests:

```text
Test Files  4 passed (4)
Tests       45 passed (45)
```

Included:

- key lifecycle integration,
- signed individual/batch issuance,
- revocation and status-list regeneration,
- concurrent status publication,
- key selection/compromise rollback,
- historical proof verification.

## 6. Remaining external requirements

1. Generate and vault a fresh production signing key under the approved lifecycle.
2. Set final HTTPS `APP_URL`, `ISSUER_URL`, and `SIGNING_KEY_ID`.
3. Activate the production key and confirm signer health.
4. Publish issuer/key/status-list URLs over final HTTPS and verify from an external network.
5. Verify a controlled issued credential, revocation, and historical credential after rotation.
6. Record key fingerprints, activation dates, custodian, and backup location.

## 7. Verdict

**Signing implementation and local acceptance: PASS.**  
**Production key/HTTPS activation: PENDING APPROVAL.**
