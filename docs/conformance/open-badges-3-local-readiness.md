# Open Badges 3 Local Readiness Evidence

> Local readiness evidence only. This product is not 1EdTech certified.

- Generated: 2026-09-13T00:00:00.000Z
- Readiness: **READY**
- Certified: **false**

## Reviewed Documents

- Open Badges specification: 3.0 Final
- Certification guide: 3.0 Final, revision 2026-06-15
- Implementation guide: 3.0 Final, revision 2026-06-15
- Errata: Open Badges 3.0 errata reviewed 2026-08-25

## Libraries

- `@digitalbazaar/data-integrity@2.5.0`
- `@digitalbazaar/ed25519-multikey@1.3.1`
- `@digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0`
- `@digitalbazaar/vc-bitstring-status-list@2.0.1`
- `jsonld@9.0.0`
- `jsonld-signatures@11.6.0`

## Reviewed Fixture Digests

- `bitstring-status-list-v1.json`: `0a531050cde587e3fe126efe107e2671fcf35c33bd02f21b214172fedd96b35f`
- `data-integrity-v2.json`: `0f77743daf5b4e8fc067fc5ba5b21044283053aa717fc6b0219843bed3b00363`
- `multikey-v1.json`: `ba2c182de2d92f7e47184bcca8fcf0beaee6d3986c527bf664c195bbc7c58597`
- `open-badges-3.0.3.json`: `3d34f4d4ef1bce691106e63798beb5e7b862ba841423f5ee1e53ab7ddf3bca84`
- `open-badges-extensions.json`: `2d013f981d1f4516081a6a04e55468ba2b071d4153b794f19a79715c45a89a5e`
- `vc-v2.json`: `19ec34cb299205bfe6415caa144492b6e1c3aae2de96fb6161e130ead5cd0a5a`

## Automated Gates

| Category | Gate                                               | Result | Evidence                                                                                                             |
| -------- | -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| docker   | Secure signer runtime and production build         | PASS   | Task 10 healthy and mismatched-key Docker smoke passed; Node 22 production build passed                              |
| proof    | Desktop and mobile acceptance                      | PASS   | Playwright full suite: 30 of 30 tests passed across desktop and 390x844 mobile projects                              |
| proof    | EdDSA proof creation and verification              | PASS   | Node 22 unit/component suite: 104 files, 743 tests passed; tamper and persisted-key binding checks passed            |
| schema   | Open Badges credential schema and JSON-LD contexts | PASS   | Canonical credential schema suite: 40 tests passed; pinned context fixtures are digest-listed below                  |
| status   | Signed revocation status lifecycle                 | PASS   | MariaDB 11.8 integration suite: 13 files, 99 tests passed; full browser suite verified signed status-bit publication |

## Remaining External Milestones

Activate stable public HTTPS identifiers, run the current official 1EdTech suite, complete the
required submission and review, and wait for written approval before using certification wording
or marks.
