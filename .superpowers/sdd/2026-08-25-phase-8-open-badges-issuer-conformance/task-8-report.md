# Phase 8 — Task 8 Report: Public Issuer Documents and Credential Verification

## Scope

Implemented the Task 8 public verification boundary:

- Canonical, dynamic public issuer Profile at `/api/issuers/hau-soc`.
- Canonical public Multikey documents at `/api/issuers/hau-soc/keys/[keyId]`.
- Public documents contain only verification material. Retired keys remain resolvable; compromised keys expose only the public trust state and timestamp.
- Server-side verification classifies `VERIFIED`, `REVOKED`, `EXPIRED`, `INVALID_PROOF`, and `VERIFICATION_UNAVAILABLE`.
- Signed credential JSON-LD and downloads use the persisted signed JSON without lifecycle rewrites; legacy documents retain the previous unsigned projection.
- Human credential pages receive only a safe, server-computed verification result and render an accessible modern-light Cryptographic Verification panel.

## TDD evidence

### RED

Added the issuer/key route, verifier, immutable-download, and panel tests first. The required focused command was run before implementation:

```text
npm test -- src/app/api/issuers/issuer-routes.test.ts src/modules/verification/services/credential-verifier.test.ts src/app/api/credentials/public-credential-routes.test.ts src/components/verification/cryptographic-verification.test.tsx src/components/verification/public-credential.test.tsx src/modules/verification/services/public-credential-json.test.ts
```

It failed as intended: the three new production modules/routes could not be resolved; the signed-byte test rejected the unrecognized signed field; and the public-card test could not find a cryptographic result. These failures proved the tests exercised absent behavior rather than existing behavior.

### GREEN

After the minimal implementation and formatting:

```text
npm test -- src/modules/verification src/app/api/credentials src/app/api/issuers src/components/verification
8 files passed, 75 tests passed

npm run lint
exit 0

npm run typecheck
exit 0

npm test
99 files passed, 684 tests passed

npm run build
exit 0
```

The production build emitted the two known `proof.ts` dynamic-dependency warnings and otherwise completed successfully.

## Requirement mapping

| Requirement               | Evidence                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-012                    | Existing non-sequential public IDs remain the sole public lookup identifier; public route failures are generic.                                                                   |
| FR-013                    | Public page adds a server-computed proof/status/time result; public issuer/key/status documents are reachable by canonical IDs.                                                   |
| FR-015                    | Signed records return the immutable persisted JSON-LD byte-for-byte for both inline and download views. Legacy records retain their explicitly unsigned compatibility projection. |
| FR-016                    | Revocation is resolved from the referenced signed status list; status failure fails closed and does not claim verification.                                                       |
| FR-020                    | No issuance/revocation mutation was added; the verification boundary consumes the existing Task 7 audited lifecycle records.                                                      |
| P1 signing / privacy NFRs | Tests cover valid/tampered/controller/key/time/status/key-trust cases and verify that public UI/documents exclude emails, student numbers, private keys, and internal notes.      |

## Decisions and remaining external checkpoints

- A retired key can validate an historical credential. A compromised key fails closed as `INVALID_PROOF`, while the public Multikey document shows its non-secret trust state.
- Verification is server-side. Browser props include only the result, optional public key URL, and checked-at timestamp; signed documents and key/status records are not sent as private service data.
- The signer is reused for cryptographic proof checks. If it or the signed status list is unavailable, the outcome is `VERIFICATION_UNAVAILABLE`.
- The issuer has **not** been described as Open Badges certified. Stable public HTTPS activation and the official 1EdTech conformance submission/review remain external milestones.

## Fix round 1 — public-key verification and JSON-LD conformance

Reviewer findings identified three root causes:

1. The original public verification adapter delegated proof verification to the signer client. Its runtime has only the currently mounted key, so it cannot verify a historical retired key and makes public verification depend on private signer configuration.
2. The public status lookup used the credential-provided list ID/index without requiring it to equal the issuance's persisted allocation.
3. The issuer `verificationMethod` and custom key-trust fields were not defined by their JSON-LD contexts; JSON-LD safe-mode expansion dropped them.

### RED

New tests failed before the fix:

- `verifyEddsaRdfc2022Proof` was absent.
- Safe-mode JSON-LD expansion rejected the issuer's undeclared `verificationMethod` and the key's undeclared trust timestamp fields.
- A persisted signed-record regression surfaced the DTO boundary mismatch where a `Date` verification timestamp failed the public ISO-date schema.

### Implementation

- Added an in-process EdDSA RDFC 2022 verifier that accepts the persisted public Multikey (`id`, controller, and `publicKeyMultibase`) and never calls the signer client or reads private material. It validates supplied public material, supports retired keys, and rejects a mismatched database-published public key.
- Kept infrastructure/cryptographic execution errors typed as `VERIFICATION_UNAVAILABLE`; a negative proof result remains `INVALID_PROOF`.
- Bound a credential's status-list URL and index to the persisted allocation before status-bit evaluation. A mismatch fails closed as `VERIFICATION_UNAVAILABLE`.
- Defined `verificationMethod` and the `keyTrust` extension with protected JSON-LD contexts. Safe-mode expansion is now tested for both Profile and Multikey documents.
- Added regression evidence that a persisted signed credential survives service validation, public DTO Zod validation, serializer, inline route, and download route without byte changes or recipient email/student number exposure.

### GREEN

```text
node node_modules/vitest/vitest.mjs run src/modules/open-badges src/modules/verification src/app/api/credentials src/app/api/issuers src/components/verification
13 files passed, 160 tests passed

node node_modules/eslint/bin/eslint.js . --max-warnings=0
exit 0

node node_modules/typescript/bin/tsc --noEmit
exit 0
```

### Final verification and environment note

- Independent fix-round re-review approved Task 8 with no Critical, Important, or Minor findings.
- The project Node 22 Docker image passed lint, typecheck, and the production build. The build
  includes the canonical issuer and key routes and retains the known dynamic-dependency warnings
  from `src/modules/open-badges/proof.ts`.
- The complete MariaDB integration suite passed: 12 files, 80 tests.
- Docker's ARM64 Vitest worker exhausted its heap while serializing
  `batch-validation.test.ts`. The remaining 98 files / 663 tests passed in Node 22, and the
  isolated file passed under the bundled runtime with 26 tests. Together these provide passing
  evidence for every current unit/component file: 99 files, 689 tests.
- The normal host NPM executable remains unavailable. No unrelated application source was changed
  to work around the local toolchain condition.
