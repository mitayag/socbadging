# Task 4: Build Canonical Credentials and Bitstring Status Lists

## Files

- Create `src/modules/open-badges/credential-schema.ts` and test.
- Create `src/modules/open-badges/credential-builder.ts` and test.
- Create `src/modules/open-badges/status-list.ts` and test.
- Create `src/modules/verification/services/status-list-service.ts` and MariaDB integration test.
- Modify `src/modules/issuance/services/snapshot-schemas.ts`.

## Interfaces

- `buildOpenBadgeCredential(input: SignedCredentialBuildInput): UnsignedOpenBadgeCredential`.
- `buildStatusListEntry(allocation): BitstringStatusListEntry`.
- `encodeRevocationList(indices: number[], capacity: number): string`.
- `readRevocationStatus(encodedList: string, index: number): boolean`.
- `regenerateSignedStatusList(tx, listId, signer): Promise<SignedStatusListCredential>`.

## Requirements

1. Strict TDD complete expected credential: official contexts; canonical credential, issuer, key, schema, and status URLs; `validFrom`; optional `validUntil`; hashed identity; achievement criteria/image/tags/alignments; no email, student number, or internal IDs.
2. Strict status-list tests cover indices 0, 7, 8, maximum capacity boundary, deterministic encoding, invalid index rejection, concurrent revocations preserving both bits, and expiration never setting revocation.
3. Reject unknown top-level fields, unapproved contexts, incorrect status purpose/schema IDs, issuer/controller mismatch, unsafe URLs, invalid timestamps, and raw recipient identifiers.
4. Use Bitstring Status List purpose exactly `revocation` and store the fully signed status-list document only after successful signer regeneration.
5. Run focused Open Badges/snapshot unit tests plus the real MariaDB status-list integration test against the dedicated disposable database. Legacy snapshot tests must remain unchanged.

## Binding constraints

- Use Task 1 strict context/proof contracts and Task 3 signer client.
- Use Task 2 status-list/allocation/key persistence and restrictive transaction behavior.
- Historical snapshots remain immutable; recipient data is privacy-minimized.
- Signer failure must not persist a partially regenerated status list.
- Every schema/database behavior has real MariaDB integration evidence; no new Prisma schema change is planned here.
- Read AGENTS.md and REQUIREMENTS.md completely before editing.
- Do not touch live DB, real `.env`, SMTP settings, initialize Git, commit, or dispatch subagents.

## Test database

Use only process-scoped `TEST_DATABASE_URL=mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test`. This is the dedicated no-volume disposable MariaDB container; never use the live Compose database.
