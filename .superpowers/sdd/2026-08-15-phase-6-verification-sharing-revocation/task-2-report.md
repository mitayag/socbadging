# Task 2 Report — Privacy-Safe Public Credential and JSON-LD Services

## Status

DONE

## Requirement mapping

- **FR-012:** Public reads require the existing 32-character non-sequential base64url public ID and preserve issuance snapshots without mutation.
- **FR-013:** The server-only public credential service exposes an explicit privacy-safe DTO with current active, expired, or revoked status.
- **FR-015:** The JSON/JSON-LD builder preserves issuance-time VC/OpenBadge fields and hashed email identity, adds lifecycle metadata, and explicitly says that output is unsigned and not certified.
- **FR-016:** Revoked status, trimmed public reason, and timestamp are projected without altering the immutable assertion.
- **FR-023:** Task 1 settings contribute only current support contact and `sharingEnabled`; issuer identity remains the issuance-time snapshot.
- **Acceptance 9–13:** Public URL validation, current lifecycle state, recipient privacy, exported JSON, and historical immutability are covered by focused tests.

## Changed files

- `src/modules/issuance/services/snapshot-schemas.ts` — extracted reusable, recursively strict runtime snapshot schemas and safe credential-free HTTP(S) URL validation.
- `src/modules/issuance/services/issuance-query-service.ts` — reuses the extracted snapshot schemas without changing protected query behavior.
- `src/modules/verification/types.ts` — server-only public DTO, lifecycle, JSON-LD schemas, canonical configured-origin credential URL validation, and exported public types.
- `src/modules/verification/services/public-credential-service.ts` — narrow query, safe uniform not-found boundary, validated immutable projections, deterministic identity masking, status derivation, and Task 1 support/sharing integration.
- `src/modules/verification/services/public-credential-service.test.ts` — public-read behavior, privacy, snapshot corruption, URL, canonical-ID, lifecycle, name-masking, cloning, and select tests.
- `src/modules/verification/services/public-credential-json.ts` — immutable JSON-LD cloning, lifecycle extension, explicit unsigned/not-certified state, and deterministic serialization.
- `src/modules/verification/services/public-credential-json.test.ts` — Open Badges field preservation, lifecycle metadata, privacy, deterministic serialization, and immutability tests.

No Prisma migration is needed: Task 2 changes no schema.

## Strict TDD evidence

### RED — missing production modules

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts
```

Result: exit **1**. Both suites collected zero tests because `./public-credential-service` and `./public-credential-json` did not yet exist. This was the intentional missing-module failure after the public-service and JSON-LD contracts were written.

### GREEN — initial public service and JSON-LD implementation

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts
```

Result: exit **0** — **4 files, 62 tests passed** after the initial implementation. The privacy assertion was corrected to permit the immutable public achievement URL while retaining checks for every prohibited internal/private sentinel.

### RED/GREEN — invalid recipient name fallback

After adding the invalid name case before code:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts
```

Result: exit **1** — **1 failed, 23 passed**. The old masking function returned `<script> S.` instead of the safe `Recipient` fallback.

After adding Unicode-safe name validation and fallback, the focused service/JSON/query/snapshot suite passed: exit **0**, **4 files, 63 tests passed**.

### RED/GREEN — independent privacy review hardening

An independent recursive privacy review identified permissive snapshot schemas, unsafe URL schemes, and an origin-incomplete credential ID check. The following cases were first added as failing tests:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts
```

Result: exit **1** — **3 failed, 24 passed**. Records with an unexpected raw snapshot field, an `javascript:` issuer URL, and an untrusted credential origin were incorrectly accepted.

The schemas were then made recursively strict; every public snapshot URL now requires credential-free HTTP(S); the public credential schema now requires the exact configured `APP_URL` origin and `/credentials/{publicId}` URL. GREEN evidence:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts
npm run typecheck
```

Result: both exit **0** — **4 files, 66 tests passed**; TypeScript completed with no errors.

### RED/GREEN — final recursive schema-depth check

The final self-review found two nested `criteria` objects that were still permissive. A nested unexpected-key case was written first:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts
```

Result: exit **1** — **1 failed, 27 passed**. A raw nested criteria field was silently stripped instead of failing closed. Both criteria schemas were made strict. The final focused/regression check then passed: exit **0**, **4 files, 67 tests passed**.

## Privacy self-review

The public service is the only projection boundary. It selects lifecycle values plus the four immutable snapshots, validates each before use, manually constructs the DTO, and invokes a strict DTO schema. Recursive sentinel tests assert that the DTO and JSON do not contain email, student number/ID, internal issuance ID, issuer user ID/name, roster ID, private image path, or raw database JSON.

The JSON builder clones only the validated OpenBadge fields and adds the lifecycle extension. It never receives recipient/raw snapshot objects and does not add a `proof`. Runtime schemas reject unexpected nested JSON keys, unsafe URL protocols/credentials, mismatched public IDs, and a credential ID whose origin differs from configured `APP_URL`.

## Final verification commands

| Command                                                                                                                                                                                                                                                                   | Result                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `npm test -- src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts` | exit 0 — 4 files, 67 tests passed             |
| `npm run format`                                                                                                                                                                                                                                                          | exit 0                                        |
| `npm run lint`                                                                                                                                                                                                                                                            | exit 0                                        |
| `npm run typecheck`                                                                                                                                                                                                                                                       | exit 0                                        |
| `npm test`                                                                                                                                                                                                                                                                | exit 0 — 47 files, 353 tests passed           |
| `npm audit`                                                                                                                                                                                                                                                               | exit 0 — 0 vulnerabilities                    |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`                                                                                                                                                                 | exit 0 — optimized production build completed |

## Assumptions

- The existing `generatePublicId()` contract is authoritative, so a public ID is exactly 32 base64url characters.
- A valid one-token recipient name is displayed as that token; whitespace-only or syntactically invalid first/last name data falls back to `Recipient`. Valid non-Latin names remain supported and use the first Unicode character of the last name as the initial.
- Issuance credential IDs are canonical only when they exactly match the currently configured `APP_URL` origin and `/credentials/{publicId}` path. This matches the existing issuance snapshot builder.
- A revoked public record without a nonblank bounded reason or timestamp is corrupted and fails closed.

## Concerns

- Node emits the existing `[DEP0129] _channel is deprecated` warning during the full unit suite; it does not cause a test failure.

## Fix Round 2 — Corruption Logging and Combining-Mark Identity Safety

### Review findings addressed

1. Corrupt public snapshot/projection records now produce a server-only log event with only the constant event name and already-public `publicId`, then return the same `PublicCredentialNotFoundError` as every other public not-found case. The logger never receives raw snapshots, parse errors, validation payloads, or recipient/issuer data.
2. Recipient name parts must begin with a Unicode letter. This rejects a leading combining mark that would otherwise produce an invisible last initial, while preserving valid precomposed and non-Latin names.

### Strict TDD evidence

The new tests were written first and run before implementation:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts
```

Result: exit **1** — **2 failed, 28 passed**. A last name beginning with a combining mark produced an invisible initial, and corrupt recipient JSON returned the uniform not-found error without the required safe server-side log.

After the narrow service changes:

```text
npm test -- src/modules/verification/services/public-credential-service.test.ts
```

Result: exit **0** — **1 file, 30 tests passed**.

### Final fix-round verification

| Command                                                                                                                                                                                                                                                                   | Result                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `npm test -- src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts` | exit 0 — 4 files, 69 tests passed             |
| `npm run format`                                                                                                                                                                                                                                                          | exit 0                                        |
| `npm run lint`                                                                                                                                                                                                                                                            | exit 0                                        |
| `npm run typecheck`                                                                                                                                                                                                                                                       | exit 0                                        |
| `npm test`                                                                                                                                                                                                                                                                | exit 0 — 47 files, 355 tests passed           |
| `npm audit`                                                                                                                                                                                                                                                               | exit 0 — 0 vulnerabilities                    |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`                                                                                                                                                                 | exit 0 — optimized production build completed |
