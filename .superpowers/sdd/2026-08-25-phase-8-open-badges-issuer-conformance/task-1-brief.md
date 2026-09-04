# Task 1: Pin Standards Libraries and Prove the Cryptographic Primitive

Source plan: `/Users/marlontayag/Desktop/SOC Badging System/docs/superpowers/plans/2026-08-25-phase-8-open-badges-issuer-conformance.md`

## Files

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/open-badges/document-loader.ts`
- Create: `src/modules/open-badges/document-loader.test.ts`
- Create: `src/modules/open-badges/proof.ts`
- Create: `src/modules/open-badges/proof.test.ts`
- May create reviewed context fixtures under `src/modules/open-badges/contexts/` as required below.

## Interfaces

- `loadAllowlistedDocument(url: string): Promise<{ documentUrl: string; document: unknown }>`.
- `SignedDocumentSchema`, `SignRequestSchema`, `SignResponseSchema`, `VerifyRequestSchema`, `VerifyResponseSchema`.
- `VerificationOutcome = "VERIFIED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE"`.

## Requirements

1. Read the current official proof vector and package API documents. Record the exact Open Badges certification-guide revision, implementation-guide proof vector, package versions, and context URLs in `proof.test.ts` comments. Do not copy remote contexts into production until official content and digest are reviewed.
2. Install exact dependencies: `@digitalbazaar/data-integrity@2.5.0`, `@digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0`, `@digitalbazaar/ed25519-multikey@1.3.1`, `@digitalbazaar/vc-bitstring-status-list@2.0.1`, `jsonld@9.0.0`.
3. Use strict TDD. Tests must reject `https://attacker.invalid/context` with `JSON-LD context is not allowlisted`; accept `{ operation: "credential.sign", document: validFixture }`; parse `{ outcome: "VERIFIED", keyId: "test-key" }`; and include an official-compatible EdDSA fixture whose proof verification fails after changing the achievement name.
4. Allow exactly reviewed VC v2, Open Badges 3.0.3, Open Badges extensions, Data Integrity, Multikey, and Bitstring Status List contexts. Resolve checked-in reviewed JSON fixtures and never fetch arbitrary remote content.
5. Run focused tests, lint, and typecheck. `npm audit` must report no known vulnerability requiring acceptance.

## Binding global constraints

- Target Issuer-only conformance; use Ed25519 with `eddsa-rdfc-2022`.
- Private keys must never be stored or logged.
- Never expose recipient email/raw identity and never claim certification.
- Preserve strict TDD evidence and existing code conventions.
- Read `/Users/marlontayag/Desktop/SOC Badging System/AGENTS.md` and `/Users/marlontayag/Desktop/SOC Badging System/REQUIREMENTS.md` completely before editing.
- Do not dispatch subagents and do not initialize Git or commit.

## Controller rulings

- Checked-in context fixture files are authorized because the loader requirement cannot be met without them.
- A minimal proof verification helper in `proof.ts` is authorized if necessary to demonstrate tamper detection before the signer task.
