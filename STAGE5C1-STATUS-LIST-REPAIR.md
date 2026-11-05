# Stage 5C.1 Public Status-List Repair

**Date:** 4 November 2026  
**Endpoint:** `GET /api/status-lists/status-list-local`  
**Before:** HTTP 503  
**After:** HTTP 200

## 1. Exact cause of HTTP 503

The published list was at version **2**, but the revoked allocation at index 1 remained at
`status_list_version = 1`. The public route fails closed when a revoked allocation was not published
by the current list version.

The local bootstrap rerun had also replaced the signed list with an empty bitstring while leaving
allocation versions behind. The public route therefore rejected both:

- the revoked allocation version mismatch; and
- the signed bit mismatch between the published list and allocation state.

This was publication-data corruption. It was not tampering with signed credential payloads.

## 2. Version and allocation rules

- `CredentialStatusList.version` advances by one on each signed publication.
- `CredentialStatusAllocation.statusListVersion` is the list version that last published that
  allocation state.
- A revoked allocation must equal the current list version.
- A new active allocation may remain at version 0 because its implicit zero bit is already correct.
- An allocation version may never exceed the list version.
- The signed list `id`, proof method, signing key row, and digest must match the stored list.
- Every signed bit must match `is_revoked`.

## 3. Legitimate history vs corruption

Older allocation versions are legitimate when the allocation is active and was created after the last
publication. Older versions are not legitimate for revoked allocations, because the revocation must be
present in the current signed bitstring. Stage 5C.1 confirmed the affected revoked allocation was
corruption of the publication state, not a valid historical reference.

## 4. Repair performed

Added `scripts/repair-status-list.ts`, which:

1. Loads the existing private key through the signer runtime (no rotation).
2. Locks the status list.
3. Rebuilds the bitstring from allocation truth.
4. Signs and persists the canonical list.
5. Advances the list version.
6. Synchronizes every allocation version.
7. Verifies every signed bit and rejects inconsistent versions.
8. Writes a `credential-status-list.repaired` audit record.

Local result:

```text
listId: status-list-local
previousVersion: 2
newVersion: 3
revokedCount: 1
activeCount: 8
signingKeyId: cmvxk7ca000000vpl4skf7eqy
```

All 9 allocations now reference version 3. Only index 1 is revoked; indices 2, 3, 4, 5, 6, 31, 32,
and 33 remain active.

## 5. Bootstrap safety fix

`scripts/bootstrap-local-signing.ts` no longer overwrites a published status list. It now:

- leaves an existing published list untouched;
- returns `statusListUpdated: false` on a rerun;
- refuses inconsistent allocation versions and directs the operator to the repair script;
- refuses to publish over allocations that have no signed list.

A bootstrap rerun after repair was verified: version remained 3 and the endpoint remained HTTP 200.

## 6. Preservation of credentials

- No `badge_issuances` row was modified.
- No signed credential payload was rewritten.
- No signing key was rotated, retired, or deleted.
- No credential or status history was deleted.
- The only new signature is the regenerated status-list publication.

## 7. External-consumer verification

`scripts/verify-status-list-external.ts`:

- fetches the public status list over HTTP;
- resolves the key and issuer profile over HTTP;
- verifies the Data Integrity proof directly with `jsonld-signatures` and the Ed25519 cryptosuite;
- decodes the gzip bitstring without using the application database verifier.

Result:

```json
{
  "proofVerified": true,
  "revokedIndexes": [1],
  "expectedRevoked": 1,
  "expectedActive": 2,
  "status": "PASS"
}
```

## 8. Credential status verification

| Credential                         | HTTP | Observed                   |
| ---------------------------------- | ---- | -------------------------- |
| `B3WePJqL-WtLhZJs05Pdwp3v6u4toY6A` | 200  | Revoked credential         |
| `t6ggxJ0ctxIMi7DzGJaQGYihhtivKo6r` | 200  | Cryptographically verified |

Both credentials reference `http://127.0.0.1:3000/api/status-lists/status-list-local` at indices 1
and 2 respectively.

## 9. Limitations

No affected credential required payload changes. If a future immutable credential references a
publication that cannot be made externally verifiable without changing its signed contents, it must be
documented and handled by controlled reissuance/replacement. Silent modification is prohibited.

## 10. Verdict

**Public status-list repair: PASS locally.**  
The endpoint returns HTTP 200 with a valid signed document, revoked status remains revoked, active
status remains active, credential signatures are intact, and an independent external-style consumer
verifies the proof and bitstring.
