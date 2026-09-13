# Phase 8 — Task 1 Report: Pin Standards Libraries and Prove the Cryptographic Primitive

## Status

Implemented. No Git repository is present, so no commit was created.

## Requirements mapping

- **FR-015 / Open Badges 3.0 Alignment:** exact JSON-LD standards dependencies, a local-only reviewed-context document loader, strict signer transport schemas, and an Ed25519 `eddsa-rdfc-2022` proof-vector verification are now available.
- **P1 cryptographic signing:** establishes the tested primitive required by the later isolated signer task; this task does not add application issuance or signing-key storage.
- **Security and privacy constraints:** the loader never fetches a URL, the test uses only the official published vector public key, and no private key, recipient email, or raw identity is stored or logged.

## Official context reviewed

- **Open Badges Specification Conformance and Certification Guide v3.0 Final**, current revision **2026-06-15**. The **2025-12-12** revision introduced the issuer JSON-LD safe-mode requirement. The guide requires `eddsa-rdfc-2022` for the selected Linked Data Proof mechanism.
- **Open Badges Implementation Guide v3.0 Final**, **Final Release (2026-06-15; document-version field blank)**, chapter “Linked Data Proof Test Vector for Open Badges 3.0.” The fixture is the guide’s public-key vector; it has VC v2 plus Open Badges 3.0.3 contexts, the published Multikey verification method, `DataIntegrityProof`, `assertionMethod`, and `eddsa-rdfc-2022` proof value.
- Package API documentation reviewed from the installed exact releases for `@digitalbazaar/data-integrity`, `@digitalbazaar/eddsa-rdfc-2022-cryptosuite`, `@digitalbazaar/ed25519-multikey`, `@digitalbazaar/vc-bitstring-status-list`, and `jsonld`.

## Implementation

- Added exact direct dependencies:
  - `@digitalbazaar/data-integrity@2.5.0`
  - `@digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0`
  - `@digitalbazaar/ed25519-multikey@1.3.1`
  - `@digitalbazaar/vc-bitstring-status-list@2.0.1`
  - `jsonld@9.0.0`
  - `jsonld-signatures@11.6.0`
- Added `loadAllowlistedDocument(url)`. It has an exact six-URL allowlist and returns static checked-in JSON only; an unrecognized URL throws `JSON-LD context is not allowlisted` and no network API is used.
- Checked in reviewed JSON-LD fixtures for VC v2, Open Badges 3.0.3, Open Badges extensions, Data Integrity v2, Multikey v1, and Bitstring Status List v1.
- Added strict Zod schemas for signed documents and signer transport requests/responses. `VerificationOutcome` is exactly `VERIFIED | INVALID_PROOF | VERIFICATION_UNAVAILABLE`.
- Added a narrowly scoped public-vector proof helper. It uses the published public Multikey only, local contexts only, and confirms that changing `credentialSubject.achievement.name` invalidates the proof.

## Context integrity record

The following official URLs were downloaded and reviewed on 2026-08-25. `apply_patch` normalizes line endings and terminal newlines, so the checked-in fixture digest is recorded separately where it differs from the remote byte stream; the parsed JSON content is unchanged.

| URL                                                          | Official source SHA-256                                            | Checked-in fixture SHA-256                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `https://www.w3.org/ns/credentials/v2`                       | `59955ced6697d61e03f2b2556febe5308ab16842846f5b586d7f1f7adec92734` | `91ed601715548afb33b32f1ffdfba6453cbd11e8a3df6d7419b889edee82a6fb` |
| `https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json` | `3d34f4d4ef1bce691106e63798beb5e7b862ba841423f5ee1e53ab7ddf3bca84` | `3d34f4d4ef1bce691106e63798beb5e7b862ba841423f5ee1e53ab7ddf3bca84` |
| `https://purl.imsglobal.org/spec/ob/v3p0/extensions.json`    | `87c06c81bc2317663bf288d740d94fddd2818c4342b186270ff6371dfaa63f93` | `2d013f981d1f4516081a6a04e55468ba2b071d4153b794f19a79715c45a89a5e` |
| `https://w3id.org/security/data-integrity/v2`                | `67f21e6e33a6c14e5ccfd2fc7865f7474fb71a04af7e94136cb399dfac8ae8f4` | `0f77743daf5b4e8fc067fc5ba5b21044283053aa717fc6b0219843bed3b00363` |
| `https://w3id.org/security/multikey/v1`                      | `ba2c182de2d92f7e47184bcca8fcf0beaee6d3986c527bf664c195bbc7c58597` | `ba2c182de2d92f7e47184bcca8fcf0beaee6d3986c527bf664c195bbc7c58597` |
| `https://www.w3.org/ns/credentials/status/v1`                | `fda5add353231e6a6884a46b12e6c75464281900cb348284d9c360f62381d9f7` | `fda5add353231e6a6884a46b12e6c75464281900cb348284d9c360f62381d9f7` |

## Strict TDD evidence

### RED

Tests were written before either production module existed. The required focused command was run:

```text
npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts

FAIL src/modules/open-badges/document-loader.test.ts
Error: Failed to resolve import "./document-loader" ... Does the file exist?
FAIL src/modules/open-badges/proof.test.ts
Error: Failed to resolve import "./proof" ... Does the file exist?
Test Files 2 failed; Tests no tests
```

This was the expected missing-implementation failure. The tests cover the non-allowlisted URL, all six allowlisted local contexts, the required signing request and verification response parsing, and the tamper-detection proof vector.

### GREEN

After the minimal loader, schemas, reviewed fixtures, and proof-vector helper were added:

```text
npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts
Test Files 2 passed (2)
Tests 5 passed (5)
```

During final gate execution, TypeScript exposed a Zod discriminated-union narrowing issue in the helper. Root cause: a `{ success: false }` fallback widened `success` to `boolean`, preventing access to `parsedProof.data`. The helper now returns immediately after each failed parse; focused tests and typecheck then passed.

## Verification results

| Command                                                                                             | Result                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts` | PASS — 2 files, 5 tests                          |
| `npx prettier --check` for the four TypeScript files                                                | PASS                                             |
| `npm run lint`                                                                                      | PASS — zero warnings/errors                      |
| `npm run typecheck`                                                                                 | PASS                                             |
| `npm audit --omit=dev`                                                                              | PASS — `found 0 vulnerabilities`                 |
| `npm test`                                                                                          | PASS — 86 files, 516 tests                       |
| `npm run build`                                                                                     | PASS — Next.js 16.3.0 production build completed |

`npm run format` was also run. It remains non-zero because two pre-existing, out-of-task Markdown files are not formatted: `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/progress.md` and `docs/superpowers/plans/2026-08-25-phase-8-open-badges-issuer-conformance.md`. All Task 1 TypeScript source/test files are Prettier-clean. The JSON snapshots are intentionally kept as reviewed standards artifacts rather than re-formatted, because formatting changes their byte digests.

## Files changed

- `package.json`
- `package-lock.json`
- `src/modules/open-badges/document-loader.ts`
- `src/modules/open-badges/document-loader.test.ts`
- `src/modules/open-badges/proof.ts`
- `src/modules/open-badges/proof.test.ts`
- `src/modules/open-badges/contexts/bitstring-status-list-v1.json`
- `src/modules/open-badges/contexts/data-integrity-v2.json`
- `src/modules/open-badges/contexts/multikey-v1.json`
- `src/modules/open-badges/contexts/open-badges-3.0.3.json`
- `src/modules/open-badges/contexts/open-badges-extensions.json`
- `src/modules/open-badges/contexts/vc-v2.json`

## Self-review

- Verified that every unknown context is rejected before any possible network access.
- Verified that the allowlist is limited to the six reviewed standards contexts required by this task.
- Verified the official public vector succeeds and the achievement-name mutation returns `false` with the identical proof.
- Verified exact direct dependency pins in both manifest and lockfile, zero production audit findings, no schema/migration requirement, and no authorization boundary is introduced.
- Verified no secret or raw recipient identity was introduced; the official test vector uses only a publicly documented test public key.
- Git is absent by workspace design; no repository was initialized and no commit was attempted.

## Concerns / follow-up

- The vector verifier is intentionally limited to the published proof vector and public key. The generic signer/verifier, real key resolution, restrictive private-key handling, and issuance integration are deliberately deferred to Tasks 3–5.
- The workspace-wide formatter remains blocked by the two pre-existing Markdown files named above. They were left unchanged to avoid altering shared plan/progress artifacts outside this task.
- The full Vitest run emitted Node's existing `DEP0129` `_channel` deprecation warning, while all 516 tests passed. It is not introduced by the Task 1 modules.

## Fix Round 1 — review corrections

### Changes

- Corrected the proof-vector provenance in `src/modules/open-badges/proof.test.ts`: the authoritative designation is **Open Badges Implementation Guide v3.0 Final, Final Release (2026-06-15; document-version field blank)**.
- Constrained `SignedDocumentSchema` so `@context` is one reviewed context URL or a non-empty array containing only the six reviewed URLs. Inline JSON-LD contexts and unreviewed URLs cannot pass `SignRequestSchema`.
- Added the reproducible direct dependency `jsonld-signatures@11.6.0`; `package-lock.json` records the same exact version.

### TDD evidence

Test file: `src/modules/open-badges/proof.test.ts`.

First RED command:

```text
npm test -- src/modules/open-badges/proof.test.ts
```

Exact outcome:

```text
Test Files 1 failed (1)
Tests 2 failed | 3 passed (5)
FAIL ... rejects a credential.sign request with an unreviewed context URL
AssertionError: expected { success: true, ... } to match object { success: false }
FAIL ... rejects a credential.sign request with an inline JSON-LD context
AssertionError: expected { success: true, ... } to match object { success: false }
```

After constraining the context schema, the preservation test for a single reviewed context was added before its compatibility adjustment. Second RED command:

```text
npm test -- src/modules/open-badges/proof.test.ts
```

Exact outcome:

```text
Test Files 1 failed (1)
Tests 1 failed | 5 passed (6)
FAIL ... accepts a credential.sign request with one reviewed context URL
AssertionError: expected { success: false, ... } to match object { success: true }
```

The schema was then changed to allow either one reviewed URL or a non-empty array of reviewed URLs. Focused GREEN command:

```text
npm test -- src/modules/open-badges/proof.test.ts
```

Exact output:

```text
Test Files 1 passed (1)
Tests 6 passed (6)
```

### Final focused gates

Test files: `src/modules/open-badges/document-loader.test.ts`, `src/modules/open-badges/proof.test.ts`.

```text
npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts
Test Files 2 passed (2)
Tests 8 passed (8)

npm run lint
eslint . --max-warnings=0
(exit 0)

npm run typecheck
tsc --noEmit
(exit 0)

npm audit
found 0 vulnerabilities
```
