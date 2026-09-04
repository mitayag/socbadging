# Task 3: Build the Internal Signer and Key Generator

## Files

- Create `src/modules/signing/key-generator.ts` and test.
- Create `scripts/generate-signing-key.ts`.
- Create `src/signer/runtime.ts` and test.
- Create `src/signer/server.ts` and test.
- Create `src/signer.ts`.
- Create `src/modules/signing/signer-client.ts` and test.
- Modify `src/config/env.ts`.

## Interfaces

- `generateEd25519KeyPair(): Promise<{ privateKeyMultibase: string; publicKeyMultibase: string; fingerprint: string }>`.
- Signer `GET /health`, `POST /v1/sign`, `POST /v1/verify`.
- `signCredential(document, correlationId): Promise<SignedOpenBadgeCredential>`.
- `verifyCredential(document, correlationId): Promise<VerifyResponse>`.

## Requirements

1. Strict TDD tests must prove restrictive file modes, malformed/mismatched private keys fail readiness, unknown contexts are rejected, expected proof fields exist, tampering returns `INVALID_PROOF`, and logs omit credential/recipient/key material.
2. Server/client tests must prove missing/wrong bearer tokens return 401, payloads over 1 MiB return 413, unsupported operation returns 400, timeout maps to `SIGNER_UNAVAILABLE`, and health returns only `{ status, keyId, cryptosuite }`.
3. CLI requires explicit `--private-key-path` and `--public-metadata-path`, refuses existing targets, creates private file mode `0600`, prints only paths/fingerprint, and never prints private material.
4. Runtime validates the mounted private key against `SIGNING_KEY_ID`, `SIGNING_PUBLIC_MULTIKEY`, and `SIGNING_KEY_FINGERPRINT` at startup.
5. Use Node built-in HTTP, Zod parsing, constant-time bearer comparison, `AbortSignal.timeout(SIGNER_TIMEOUT_MS)`, response-size limits, and structured non-secret logs.
6. Bind `0.0.0.0:3101` for internal Compose networking only; no host port is added in this task.
7. Run focused tests, lint, typecheck, full unit regression, and a local process smoke test; wrong key metadata must keep health unready.

## Binding constraints

- Use pinned Ed25519 `eddsa-rdfc-2022` and the strict Task 1 local context loader.
- Private keys exist only in explicit secret/file paths, never DB/logs/output; file mode must be enforced.
- Signer failures are typed and non-secret.
- Read AGENTS.md and REQUIREMENTS.md completely before editing.
- Do not touch live database data, real `.env` credentials, or existing Phase 7 SMTP configuration.
- Do not dispatch subagents, initialize Git, or commit.

## Existing interfaces

- Task 1: `src/modules/open-badges/proof.ts` request/response schemas and strict `document-loader.ts`.
- Task 2: public signing-key persistence validates canonical Ed25519 public multikeys; no private data is persisted.
