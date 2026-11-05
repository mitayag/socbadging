# Credential Status-List Architecture

## Publication model

Credentials reference a signed `BitstringStatusListCredential` through
`credentialStatus.statusListCredential` and `credentialStatus.statusListIndex`. The list is published
at `GET /api/status-lists/{listId}` as JSON-LD with a Data Integrity proof using the active signing
key.

Each `CredentialStatusAllocation` records:

- the issuance and its bit index;
- the current revocation bit;
- `statusListVersion`, the list publication version that last included the allocation state.

`CredentialStatusList.version` advances by exactly one each time a list is signed and persisted.
Regeneration is transactional: it locks the list, builds the bitstring from all revoked allocations,
signs it, verifies the signer returned a canonical payload, writes the signed document and digest, and
sets every allocation's `statusListVersion` to the new version.

## Consistency rules

- A revoked allocation makes the published list authoritative only when its
  `statusListVersion` equals the current list `version`. Otherwise the current signed document may
  predate the revocation, so the public endpoint fails closed with `503`.
- A new active allocation may retain `statusListVersion = 0` because an implicit zero bit is already
  correct; it does not require a new publication.
- An allocation version may never exceed the list version.
- The signed document's `id`, proof `verificationMethod`, signing key row, and digest must all match.
- A revoked bit in the signed document must match `is_revoked` for every allocation.

## Stage 5C.1 root cause

The local bootstrap script was rerun after credentials had been revoked. It signed an empty bitstring,
replaced the published list, and incremented `version` from 1 to 2, but did not synchronize allocation
versions. The revoked allocation remained at version 1 while the list was version 2. The public route
therefore returned `503 Status list unavailable`.

This was publication data corruption, not credential corruption. Immutable signed credential
payloads and their status-list references were intact.

## Repair

`scripts/repair-status-list.ts` performs a reviewed, audited regeneration:

1. Loads the configured private signing key through the signer runtime.
2. Locks the status list.
3. Rebuilds the bitstring from current allocation state.
4. Signs and persists the canonical list, advancing the version.
5. Synchronizes every allocation to the new version.
6. Verifies every signed bit against `is_revoked` and rejects inconsistent versions.
7. Writes a `credential-status-list.repaired` audit record.

Run it only against an approved database with the signer key available:

```sh
DATABASE_URL=<approved-database-url> npx tsx scripts/repair-status-list.ts status-list-local
```

The command prints only non-secret summary data. It does not rotate keys, rewrite credentials, or
delete history. Historical signed credential payloads are not modified.

`scripts/bootstrap-local-signing.ts` no longer overwrites an already published status list. A rerun
returns `statusListUpdated: false`; if it detects inconsistent allocation versions it refuses and
directs the operator to the repair script.

## Independent verification

`scripts/verify-status-list-external.ts` acts as an external consumer:

- fetches the public status-list URL over HTTP;
- resolves the proof verification method and issuer profile;
- verifies the Data Integrity proof independently of the application database verifier;
- decodes the gzip bitstring directly; and
- optionally asserts an expected revoked index and an expected active index.

Example:

```sh
EXPECTED_REVOKED_INDEX=1 EXPECTED_ACTIVE_INDEX=2 \
  npx tsx scripts/verify-status-list-external.ts status-list-local
```

## Historical limitations

- If an existing signed credential references a status list that cannot be made externally
  verifiable without changing the credential payload, the credential must not be silently modified.
  Document the affected public IDs and use the controlled reissuance/replacement workflow instead.
- The current local issuer URLs use `http://127.0.0.1`; production activation requires stable HTTPS
  issuer and key URLs. Historical proofs retain their original verification-method identifiers.
- Status-list publication requires exactly one active signing key. A retired key can still verify
  historical lists and credentials.
