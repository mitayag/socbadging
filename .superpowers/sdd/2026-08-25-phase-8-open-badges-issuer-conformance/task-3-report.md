# Phase 8 — Task 3 Report: Internal Signer and Key Generator

## Status

Implemented and verified. No Git repository is present, so no commit was created.

## Requirements mapping

- **P1 cryptographic signing / Open Badges 3.0 Proof:** generated canonical Ed25519 Multikey material and added local `eddsa-rdfc-2022` signing and verification through the exact pinned Digital Bazaar packages.
- **FR-015 Credential Export:** added the internal signed-document transport and typed signer client needed to produce signed JSON/JSON-LD credentials in later issuance tasks.
- **Security and privacy NFRs:** enforced private-key file isolation, restrictive modes, no-follow opens, key/public/fingerprint matching, authenticated internal requests, 1 MiB request/response limits, bounded timeouts, strict local JSON-LD context loading, typed non-secret errors, and non-secret structured logs.
- **Structured logs and health NFR:** exposed a minimal readiness contract containing only `status`, `keyId`, and `cryptosuite`.

This task does not change an issuance or revocation record, add a protected application feature, or change the database schema. Therefore it requires no audit mutation, application authorization test, or migration.

## Implementation

### Key generation and CLI

- `generateEd25519KeyPair()` uses `@digitalbazaar/ed25519-multikey@1.3.1` and returns only the requested private multibase, public multibase, and public fingerprint contract.
- The CLI requires both `--private-key-path` and `--public-metadata-path`, requires different explicit targets, rejects either existing target before generation, and also uses exclusive/no-follow creation to close races.
- The private file is explicitly changed to mode `0600` through its open file handle and contains only the private multibase envelope. Public metadata contains algorithm, cryptosuite, public multikey, and fingerprint.
- Partial CLI writes are removed on failure. Successful output contains only the two resolved paths and fingerprint; private material is never printed.

### Runtime

- The runtime opens the key with `O_NOFOLLOW`, requires a regular file with no group/world permission bits, caps the private file at 16 KiB, and parses a strict Zod envelope.
- Startup validates canonical public/private exports, requires the configured fingerprint to equal the canonical public multikey, and signs/verifies an in-memory challenge to prove the mounted private key matches the configured public key.
- Initialization failure returns an unready, fail-closed runtime. Signing and verification cannot execute while unready.
- Signing and verification use `@digitalbazaar/data-integrity@2.5.0`, `@digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0`, and the Task 1 allowlisted local document loader. No network document loading is available.
- Signed proofs contain `DataIntegrityProof`, `eddsa-rdfc-2022`, `assertionMethod`, the configured key ID, and a multibase proof value. Tampering deterministically returns `INVALID_PROOF`.
- Log fields are limited to validated UUID correlation IDs, key IDs, operation names, safe outcomes, cryptosuite, and durations. Documents, recipient values, private material, public multikey material, bearer tokens, and parser/crypto details are omitted.

### HTTP server, client, and process entrypoint

- The built-in Node HTTP server provides `GET /health`, `POST /v1/sign`, and `POST /v1/verify`.
- POST operations use SHA-256 digest plus `timingSafeEqual` bearer comparison, strict Task 1 Zod schemas, and a 1 MiB request limit. Responses are also limited to 1 MiB.
- Missing/wrong tokens return the same 401 response. Oversize payloads return 413, unsupported endpoint operations return 400, unready runtime calls return 503, and all error bodies are typed and non-secret.
- The client uses `AbortSignal.timeout(SIGNER_TIMEOUT_MS)`, bounds streamed responses to 1 MiB, validates response schemas, and maps timeouts/transport/oversize failures to `SIGNER_UNAVAILABLE`.
- Runtime key config and HTTP bearer config are separated by the environment loader. The process binds exactly `0.0.0.0:3101`; no Compose file or host port was added.

## Strict TDD evidence

### RED 1 — key generator and runtime modules absent

Command:

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts
```

Observed expected failure:

```text
Test Files 2 failed (2)
Tests no tests
Failed to resolve import "./key-generator"
Failed to resolve import "./runtime"
```

The first tests defined matching generated material, restrictive mode readiness, malformed/mismatched key rejection, context rejection, required proof fields, tamper classification, and log redaction before either production module existed.

### GREEN 1 — key generator and runtime

After the minimal key generator/runtime implementation and the required Node test environment declaration:

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts
Test Files 2 passed (2)
Tests 9 passed (9)
```

The Node declaration was necessary because the repository default is JSDOM; JSDOM's cross-realm `Uint8Array` is intentionally rejected by the pinned Node Ed25519 implementation.

### RED 2 — CLI, HTTP server/client, and environment APIs absent

Command:

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts src/signer/server.test.ts src/modules/signing/signer-client.test.ts src/config/env.test.ts
```

Observed expected failures:

```text
Test Files 4 failed | 1 passed (5)
Tests 4 failed | 13 passed (17)
Cannot find module './server'
Cannot find module './signer-client'
loadSignerServiceConfig is not a function
loadSignerClientConfig is not a function
generate-signing-key.ts was absent
```

### GREEN 2 — complete focused surface

After the minimal CLI/server/client/environment implementation:

```text
Test Files 5 passed (5)
Tests 24 passed (24)
```

### RED/GREEN security follow-ups

Two self-review tests were added before their fixes:

```text
npm test -- src/signer/runtime.test.ts src/modules/signing/signer-client.test.ts
Test Files 2 failed (2)
Tests 2 failed | 10 passed (12)
```

- A direct caller's unsafe correlation string appeared in captured log fields.
- A malformed HTTP 200 response leaked a raw `ZodError` instead of a typed client failure.

After UUID-only correlation logging and safe response parsing, both files passed with 12 tests.

A canonicalization-safe-mode regression was then written first:

```text
npm test -- src/signer/runtime.test.ts
Test Files 1 failed (1)
Tests 1 failed | 10 passed (11)
```

The pinned JSON-LD implementation correctly rejected an undefined term, but its raw validation error escaped. The runtime now maps that failure to typed `INVALID_DOCUMENT`; the final runtime file passes 11 tests.

### RED/GREEN real-process boundary regression

The first matching-key process smoke unexpectedly reported `unready`. Non-secret diagnostics proved all cryptographic and file checks succeeded: regular file, mode `0600`, bounded size, fingerprint equality, canonical import/export, challenge signature match, and pinned-library loading.

Root cause: the service environment loader returned bearer-token and runtime-key fields in one flat object. Passing it to the runtime's intentionally strict schema caused the extra token field to be rejected before initialization. A regression changed the expected environment shape first:

```text
npm test -- src/config/env.test.ts
Test Files 1 failed (1)
Tests 1 failed | 4 passed (5)
```

The environment contract now returns `{ token, runtime }`, and the entrypoint sends only `runtime` to the signer runtime. The focused environment suite then passed with 5 tests. Strict runtime parsing was preserved; it was not weakened to accept the bearer secret.

### Final focused GREEN

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts src/signer/server.test.ts src/modules/signing/signer-client.test.ts src/config/env.test.ts
Test Files 5 passed (5)
Tests 28 passed (28)
```

## Local process smoke evidence

Two separately generated disposable key directories were used. Private material was never printed or passed on a command line; shell variables contained public metadata only.

### Matching metadata

The real `npx tsx src/signer.ts` process logged ready while listening on the required address and port. An assertion over the real HTTP response produced:

```json
{
  "status": "ready",
  "keyId": "https://badges.example.test/api/issuers/hau-soc/keys/smoke-ready",
  "cryptosuite": "eddsa-rdfc-2022"
}
```

HTTP status was 200, and the assertion required the exact sorted key set `cryptosuite,keyId,status`.

### Mismatched fingerprint metadata

The second real process used the generated private/public pair with a deliberately wrong fingerprint. Its asserted response was:

```json
{
  "httpStatus": 503,
  "status": "unready",
  "keyId": "https://badges.example.test/api/issuers/hau-soc/keys/smoke-mismatch",
  "cryptosuite": "eddsa-rdfc-2022"
}
```

Both processes were stopped cleanly. All four disposable private/public files and both temporary directories were explicitly removed afterward. Port 3101 was rechecked and released.

## Final verification gates

| Command                                                                                             | Result                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Focused Task 3 + env tests                                                                          | PASS — 5 files, 28 tests                             |
| Targeted Prettier check for every Task 3-related TypeScript file                                    | PASS                                                 |
| `npm run lint`                                                                                      | PASS — zero warnings/errors                          |
| `npm run typecheck`                                                                                 | PASS                                                 |
| `npm test`                                                                                          | PASS — 91 files, 545 tests                           |
| `DATABASE_URL=mysql://build:build@127.0.0.1:3306/build APP_URL=http://localhost:3000 npm run build` | PASS — Next.js 16.3.0 production build completed     |
| Matching-key local process                                                                          | PASS — HTTP 200, `ready`, exact three-field health   |
| Wrong-fingerprint local process                                                                     | PASS — HTTP 503, `unready`, exact three-field health |

`npm run format` was run and remains non-zero only for five pre-existing/unrelated files:

- `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/progress.md`
- `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/task-1-report.md`
- `docs/superpowers/plans/2026-08-25-phase-8-open-badges-issuer-conformance.md`
- `src/modules/open-badges/contexts/bitstring-status-list-v1.json`
- `src/modules/open-badges/contexts/vc-v2.json`

All Task 3-related TypeScript files pass their explicit Prettier check. The full unit run emitted the existing Node `DEP0129` `_channel` deprecation warning; all 545 tests passed.

## Files added or changed

### Added

- `src/modules/signing/key-generator.ts`
- `src/modules/signing/key-generator.test.ts`
- `scripts/generate-signing-key.ts`
- `src/signer/runtime.ts`
- `src/signer/runtime.test.ts`
- `src/signer/server.ts`
- `src/signer/server.test.ts`
- `src/signer.ts`
- `src/modules/signing/signer-client.ts`
- `src/modules/signing/signer-client.test.ts`
- This report.

### Modified

- `src/config/env.ts`
- `src/config/env.test.ts`
- `src/modules/open-badges/proof.ts` — exports the existing schema-derived signed document and verify response types for the runtime/client boundary.
- `src/types/ed25519-multikey.d.ts` — completes the pinned package's local declarations for secret-key import and signer/verifier methods.

## Self-review

- Confirmed private material appears only in the generated private file and in-memory cryptographic objects. It is absent from database modules, public metadata, HTTP health, logs, stdout/stderr, and client/server error objects.
- Confirmed startup checks the actual private/public match with a signature challenge; string-format checks alone cannot produce readiness.
- Confirmed permissive file modes, non-files, symlinks, oversized files, malformed secret multikeys, mismatched public keys, and mismatched fingerprints cannot produce a ready runtime.
- Confirmed server authentication is checked before request parsing, token comparison uses fixed-size digests with `timingSafeEqual`, and auth logs never include presented or expected bearer values.
- Confirmed both inbound bodies and outbound/client responses are capped at exactly 1 MiB.
- Confirmed the client uses the required native `AbortSignal.timeout`, validates every successful response, and emits only typed safe errors.
- Confirmed JSON-LD resolution is restricted to the Task 1 checked-in allowlist plus the in-memory configured controller/key documents. Unknown remote contexts cannot be fetched.
- Confirmed health exposes exactly three non-secret fields in both ready and unready states.
- Confirmed `src/signer.ts` binds `0.0.0.0:3101`; no Docker/Compose host port or other deployment file was modified.
- Confirmed no database, `.env` file, live service data, SMTP configuration, Git initialization, commit, or subagent was touched.

## Concerns / follow-up

- Compose service wiring, read-only Docker secret mounting, web readiness integration, and the explicit absence of a signer host port remain Task 10 work. This task only supplies the process that binds the internal service address.
- `SIGNING_KEY_ID` is validated as a URL and is deterministically used as the proof verification method. A key ID is public metadata, not cryptographically derivable from Ed25519 bytes; the cryptographically enforceable startup checks are the configured public multikey/fingerprint and private/public challenge match.
- This runtime verifies against its currently mounted/configured public key. Historical retired/compromised public-key resolution and public credential verification remain the later Task 8 lifecycle responsibility.
- The repository-wide formatting gate remains non-zero because of the five pre-existing files listed above; no unrelated plan/report or reviewed standards snapshot was reformatted.

---

## Fix Round 1 — Accepted Important Findings

### Status

All five accepted Important findings were fixed with failing regressions first. The two Minor findings (listen/shutdown handling and inode-safe CLI cleanup) remain deferred by explicit ruling.

Public `keyId` and `cryptosuite` remain in structured logs as explicitly ruled. Multikey bytes, private material, bearer tokens, documents, recipient values, and raw parser/cryptographic/transport errors remain excluded.

### Finding 1 — post-header timeout and transport failures

**Test file:** `src/modules/signing/signer-client.test.ts`

Two real Node HTTP servers start a 200 response and then either stall until `AbortSignal.timeout()` fires or disconnect midstream with a private transport detail.

RED:

```text
npm test -- src/modules/signing/signer-client.test.ts
Test Files 1 failed (1)
Tests 2 failed | 3 passed (5)

maps a timeout while reading a started response to SIGNER_UNAVAILABLE
Received: TimeoutError "The operation was aborted due to timeout"

maps a midstream disconnect to SIGNER_UNAVAILABLE
Received: TypeError "terminated" with UND_ERR_SOCKET cause
```

The response body is now consumed inside the typed transport boundary. Existing `SignerClientError` values are preserved; any other body-reader/cancel/transport failure maps to the non-secret `SignerClientError("SIGNER_UNAVAILABLE")`.

GREEN:

```text
npm test -- src/modules/signing/signer-client.test.ts
Test Files 1 passed (1)
Tests 5 passed (5)
```

### Finding 2 — unsigned or wrong-key sign responses

**Test file:** `src/modules/open-badges/proof.test.ts`

The transport now has distinct schema-derived contracts:

- `UnsignedDocumentSchema` rejects any defined proof and is required by `SignRequestSchema`.
- `SignedDocumentSchema` requires one `DataIntegrityProof` using `eddsa-rdfc-2022`, `assertionMethod`, a URL verification method, and a non-empty base58btc multibase proof value.
- `SignResponseSchema` rejects responses where `document.proof.verificationMethod !== keyId`.
- `VerifyRequestSchema` accepts only the signed contract.

RED:

```text
npm test -- src/modules/open-badges/proof.test.ts
Test Files 1 failed (1)
Tests 3 failed | 6 passed (9)

rejects an already-proved document as signing input
Expected success false; received true

rejects a successful sign response without a Data Integrity proof
Expected success false; received true

rejects a successful sign response whose proof uses another key ID
Expected success false; received true
```

GREEN:

```text
npm test -- src/modules/open-badges/proof.test.ts
Test Files 1 passed (1)
Tests 9 passed (9)
```

The runtime signs only `UnsignedDocumentSchema` inputs and validates its own output through the strengthened `SignResponseSchema`. The client inherits the same unsigned-input/signed-output/key-binding checks.

### Finding 3 — noncanonical legacy private-key serialization

**Test files:**

- `src/modules/signing/key-generator.test.ts`
- `src/signer/runtime.test.ts`

The generator regression independently imports its result through the pinned package and compares it with an explicit `canonicalize: true` secret export. The runtime regression creates a legacy 64-byte secret encoding, corrupts its unused trailing bytes, and proves it cannot produce readiness even though the first 32 seed bytes still sign against the configured public key.

RED:

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts
Test Files 2 failed (2)
Tests 2 failed | 14 passed (16)

generated.privateKeyMultibase did not equal the canonical 32-byte export
legacy secret with corrupted trailing bytes produced status "ready"
```

The generator now exports with `canonicalize: true`. Runtime canonicalizes the already-imported secret and compares that canonical encoding to the mounted value before its sign/verify challenge. Any legacy 64-byte or altered-trailing encoding therefore fails readiness.

GREEN:

```text
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts
Test Files 2 passed (2)
Tests 16 passed (16)
```

### Finding 4 — missing bearer comparison short-circuit

**Test file:** `src/signer/server.test.ts`

The regression instruments only the fixed-size digest comparator boundary and proves it executes once for each missing, wrong, and correct bearer value. Existing real HTTP cases continue to prove identical missing/wrong 401 status and `{ "error": "UNAUTHORIZED" }` bodies.

RED:

```text
npm test -- src/signer/server.test.ts
Test Files 1 failed (1)
Tests 1 failed | 5 passed (6)
Expected constantTimeBearerTokenMatches to be a function; received undefined
```

`constantTimeBearerTokenMatches` now hashes both the presented value (empty when missing/malformed) and expected value to fixed 32-byte SHA-256 digests, then always invokes `timingSafeEqual`. There is no missing-token or presented-length short-circuit.

GREEN:

```text
npm test -- src/signer/server.test.ts
Test Files 1 passed (1)
Tests 6 passed (6)
```

### Finding 5 — private-file size TOCTOU and unbounded read

**Test file:** `src/signer/runtime.test.ts`

The bounded-reader regression supplies a 12-byte source through deliberately short reads with a 10-byte maximum. It asserts rejection after exactly `MAX+1` actual bytes and proves no read window extends beyond the fixed `MAX+1` buffer.

RED:

```text
npm test -- src/signer/runtime.test.ts
Test Files 1 failed (1)
Tests 1 failed | 12 passed (13)
Expected readBoundedOpenFile to be a function; received undefined
```

`readBoundedOpenFile` allocates exactly `MAX+1`, reads in bounded windows from the already-open no-follow descriptor, stops at EOF, and rejects when actual content exceeds `MAX`. `readPrivateKeyFile` retains the fast metadata-size rejection but no longer trusts it to bound the subsequent read.

GREEN:

```text
npm test -- src/signer/runtime.test.ts
Test Files 1 passed (1)
Tests 13 passed (13)
```

### Cross-file fixture correction

The first combined run correctly exposed that the signer-client response-limit test still supplied an unsigned document to `verifyCredential`. Because verification input is now required to be signed, that fixture failed locally before reaching its intended oversized-response boundary. The test was changed to use a schema-valid signed fixture; no production weakening was made. The server test fake was likewise separated into unsigned request and signed runtime-response fixtures.

### Fix Round 1 focused verification

```text
npm test -- src/modules/open-badges/proof.test.ts src/modules/signing/key-generator.test.ts src/modules/signing/signer-client.test.ts src/signer/runtime.test.ts src/signer/server.test.ts src/config/env.test.ts
Test Files 6 passed (6)
Tests 42 passed (42)
```

### Fix Round 1 process smoke

A new disposable key was generated through the real CLI. A separate pinned-package assertion imported the generated file and confirmed its private multibase exactly equaled `export({ secretKey: true, canonicalize: true })`; only `{ "canonicalPrivateEncoding": true }` was printed.

The real `npx tsx src/signer.ts` process then reported ready on `0.0.0.0:3101`. An authenticated HTTP round trip produced:

```json
{
  "health": "ready",
  "signHttpStatus": 200,
  "proofBoundToKeyId": true,
  "verifyOutcome": "VERIFIED"
}
```

The smoke asserted the proof type, cryptosuite, purpose, proof value, and exact equality between `proof.verificationMethod` and the response `keyId`. The disposable private/public files were explicitly removed, the temporary directory was removed, and port 3101 was confirmed released.

### Fix Round 1 final gates

| Command                                                                                             | Result                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Focused six-file signer/proof/env suite                                                             | PASS — 6 files, 42 tests                         |
| Targeted Prettier check for every Fix Round 1 source/test/declaration                               | PASS                                             |
| `npm run lint`                                                                                      | PASS — zero warnings/errors                      |
| `npm run typecheck`                                                                                 | PASS                                             |
| `npm test`                                                                                          | PASS — 91 files, 553 tests                       |
| `DATABASE_URL=mysql://build:build@127.0.0.1:3306/build APP_URL=http://localhost:3000 npm run build` | PASS — Next.js 16.3.0 production build completed |
| Canonical CLI + real signer sign/verify smoke                                                       | PASS                                             |

`npm run format` still reports only the same five pre-existing/unrelated files listed in the original report. Every Fix Round 1 file passes the targeted Prettier gate. The full unit run emitted the existing Node `DEP0129` warning; all 553 tests passed.

### Fix Round 1 files changed

- `src/modules/open-badges/proof.ts`
- `src/modules/open-badges/proof.test.ts`
- `src/modules/signing/key-generator.ts`
- `src/modules/signing/key-generator.test.ts`
- `src/modules/signing/signer-client.ts`
- `src/modules/signing/signer-client.test.ts`
- `src/signer/runtime.ts`
- `src/signer/runtime.test.ts`
- `src/signer/server.ts`
- `src/signer/server.test.ts`
- `src/types/ed25519-multikey.d.ts`
- `src/types/base58-universal.d.ts` (new test-facing declaration for the already-installed transitive package used to build the corrupt legacy regression fixture)
- This report.

### Fix Round 1 self-review and concerns

- Confirmed the response-stream catch does not expose `TimeoutError`, Undici socket causes, private transport messages, or raw reader errors.
- Confirmed unsigned sign responses, malformed proof shapes, wrong cryptosuite/purpose/value types, and response/proof key mismatch fail schema validation.
- Confirmed canonical 32-byte seed output remains fully sign/verify compatible while all legacy 64-byte secret encodings fail readiness, including corrupted unused trailing bytes.
- Confirmed missing, malformed, wrong, and correct bearer values all reach one fixed-length digest comparison; missing/wrong external responses remain identical.
- Confirmed private-file consumption is capped by one `MAX+1` allocation and reads only from the descriptor already opened with `O_NOFOLLOW`.
- Confirmed the accepted logging ruling: public `keyId` and `cryptosuite` remain; secret/public multikey bytes, tokens, documents, recipients, and raw errors remain absent.
- Confirmed no `.env`, database, Compose file, SMTP setting, Git repository, commit, or subagent was touched.
- Deferred by ruling: listen/shutdown handling and inode-safe cleanup after a CLI partial-write race remain for final review and were not changed in this round.
