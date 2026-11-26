# Stage 5E.2 HTTPS, Proxy, and Signing Validation

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**Production proxy/key changes:** None

## 1. HTTPS and Nginx Proxy Manager

The host has an unrelated `hau-reverse-proxy` container listening on ports 80/443. It was not
modified, inspected for secrets, or reused. No Nginx Proxy Manager instance is installed/running for
this application.

| Requirement                                        | Status  | Evidence                                         |
| -------------------------------------------------- | ------- | ------------------------------------------------ |
| Production Compose binds web to loopback port 3001 | PASS    | `compose.production.yaml` config validation      |
| Internal application port remains 3000             | PASS    | Compose target port 3000                         |
| MariaDB has no published production port           | PASS    | Production Compose                               |
| Signer has no published production port            | PASS    | Production Compose                               |
| Worker has no published production port            | PASS    | Production Compose                               |
| NPM proxy host configured                          | BLOCKED | No NPM instance/access; existing proxy untouched |
| Publicly trusted TLS certificate                   | BLOCKED | No approved domain/certificate                   |
| HTTPS issuer URLs                                  | BLOCKED | Production key/URL activation not approved       |
| Forwarding headers validated externally            | BLOCKED | No NPM route                                     |
| Public credential page over HTTPS                  | BLOCKED | Local HTTP only                                  |
| Public status list over HTTPS                      | BLOCKED | Local HTTP only                                  |

Local HTTP endpoints were validated:

| Endpoint                              | Result                            |
| ------------------------------------- | --------------------------------- |
| `/api/health`                         | 200, database/signer/worker ready |
| `/api/status-lists/status-list-local` | 200, signed JSON-LD               |
| Active credential page                | 200, cryptographically verified   |
| Revoked credential page               | 200, revoked                      |

## 2. Signing identity

| Requirement                               | Status                  | Evidence                                                                                              |
| ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Active local key configured               | PASS                    | Signer health ready, key-local                                                                        |
| Public key publication                    | PASS                    | Local issuer/key endpoints resolve                                                                    |
| Status-list publication                   | PASS                    | HTTP 200; external-style proof verification PASS                                                      |
| Active credential independently verified  | PASS                    | Public page + signed JSON/status list                                                                 |
| Revoked credential independently verified | PASS                    | Revoked page + status bit index 1                                                                     |
| Credential download                       | PASS                    | JSON-LD HTTP 200                                                                                      |
| Credential image                          | PASS                    | `image/jpeg` HTTP 200                                                                                 |
| Credential PDF                            | PASS                    | `application/pdf` HTTP 200                                                                            |
| Credential QR                             | PASS                    | `image/png` HTTP 200; code path encodes canonical verification URL                                    |
| Historical verification compatibility     | PASS (tests)            | 45 targeted signing/revocation/status tests passed; retired keys accepted for historical verification |
| Key rotation/retirement procedures        | PASS (documented/tests) | Key lifecycle tests                                                                                   |
| Compromised-key rejection                 | PASS (tests)            | Key-service/verifier tests                                                                            |
| Production signing key activated          | BLOCKED                 | No approval                                                                                           |
| Production key custody/vault              | BLOCKED                 | No production vault access                                                                            |

The QR endpoint returns a 256×256 PNG. Independent QR decoding was not performed because no QR
decoder is installed; the route directly encodes `APP_URL/credentials/<publicId>`, and the public URL
was independently verified through HTTP.

## 3. External-style status-list verification

```text
proofVerified: true
revokedIndexes: [1]
expectedRevoked: 1
expectedActive: 2
status: PASS
```

The verifier fetched the list, issuer profile, and key over HTTP, verified the Data Integrity proof
with `jsonld-signatures`, and decoded the gzip bitstring independently of the application database
verifier.

## 4. Historical limitation

No local credential references a retired key, so historical verification compatibility is proven by
tests rather than a real production credential. Production historical verification must be rechecked
after the production key is activated and rotated.

## 5. Verdict

**Local HTTPS-adjacent credential/signing validation: PASS.**  
**Production HTTPS/NPM/proxy validation: BLOCKED.**  
**Production signing-key activation/custody: BLOCKED.**
