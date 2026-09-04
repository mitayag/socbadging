import { describe, expect, it } from "vitest";

import {
  SignRequestSchema,
  SignResponseSchema,
  VerifyResponseSchema,
  verifyEddsaRdfc2022Proof,
  verifyOfficialEddsaRdfc2022ProofVector,
} from "./proof";

/*
 * Standards provenance reviewed 2026-08-25:
 * - Open Badges Specification Conformance and Certification Guide v3.0 Final,
 *   revision 2026-06-15. Issuer safe-mode requirement was added in the
 *   2025-12-12 revision; supported Linked Data Proof is eddsa-rdfc-2022.
 * - Open Badges Implementation Guide v3.0 Final, Final Release (2026-06-15;
 *   document-version field blank), "Linked Data Proof Test Vector for Open
 *   Badges 3.0".
 * - Direct package versions: @digitalbazaar/data-integrity@2.5.0,
 *   @digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0,
 *   @digitalbazaar/ed25519-multikey@1.3.1,
 *   @digitalbazaar/vc-bitstring-status-list@2.0.1, jsonld@9.0.0.
 * - Reviewed context URLs (local fixtures only):
 *   https://www.w3.org/ns/credentials/v2
 *   https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json
 *   https://purl.imsglobal.org/spec/ob/v3p0/extensions.json
 *   https://w3id.org/security/data-integrity/v2
 *   https://w3id.org/security/multikey/v1
 *   https://www.w3.org/ns/credentials/status/v1
 */

const proofVector = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "http://example.com/credentials/3527",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: {
    id: "https://example.edu/issuers/565049",
    type: ["Profile"],
    url: "https://www.imsglobal.org",
    name: "Example Corp",
  },
  validFrom: "2010-01-01T00:00:00Z",
  name: "Teamwork Badge",
  credentialSubject: {
    id: "did:example:ebfeb1f712ebc6f1c276e12ec21",
    type: ["AchievementSubject"],
    achievement: {
      id: "https://example.com/achievements/21st-century-skills/teamwork",
      type: ["Achievement"],
      criteria: {
        narrative:
          "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management.",
      },
      description:
        "This badge recognizes the development of the capacity to collaborate within a group environment.",
      name: "Teamwork",
    },
  },
  proof: {
    type: "DataIntegrityProof",
    created: "2010-01-01T19:23:24Z",
    verificationMethod:
      "https://example.edu/issuers/565049#z6MkjZRZv3aez3r18pB1RBFJR1kwUVJ5jHt92JmQwXbd5hwi",
    cryptosuite: "eddsa-rdfc-2022",
    proofPurpose: "assertionMethod",
    proofValue:
      "z5x9aCBYovW3CQCbKdNyhEm7ffYSw1YpEdPywQJoNbzDD2gkzQDKJ1sYKJaWvqZtkMtSbz35HcbgXVEDYHxCzgkCr",
  },
};

const unsignedProofVector = structuredClone(proofVector);
delete (unsignedProofVector as { proof?: unknown }).proof;

describe("Open Badges signing transport", () => {
  it("accepts a credential.sign request for a valid Open Badge fixture", () => {
    expect(
      SignRequestSchema.safeParse({ operation: "credential.sign", document: unsignedProofVector }),
    ).toMatchObject({ success: true });
  });

  it("rejects an already-proved document as signing input", () => {
    expect(
      SignRequestSchema.safeParse({ operation: "credential.sign", document: proofVector }),
    ).toMatchObject({ success: false });
  });

  it("rejects a successful sign response without a Data Integrity proof", () => {
    const unsigned = structuredClone(proofVector);
    delete (unsigned as { proof?: unknown }).proof;

    expect(
      SignResponseSchema.safeParse({
        document: unsigned,
        keyId: proofVector.proof.verificationMethod,
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects a successful sign response whose proof uses another key ID", () => {
    expect(
      SignResponseSchema.safeParse({
        document: proofVector,
        keyId: "https://example.edu/issuers/565049#another-key",
      }),
    ).toMatchObject({ success: false });
  });

  it("accepts a credential.sign request with one reviewed context URL", () => {
    const requestWithSingleReviewedContext = {
      ...structuredClone(unsignedProofVector),
      "@context": "https://www.w3.org/ns/credentials/v2",
    };

    expect(
      SignRequestSchema.safeParse({
        operation: "credential.sign",
        document: requestWithSingleReviewedContext,
      }),
    ).toMatchObject({ success: true });
  });

  it("rejects a credential.sign request with an unreviewed context URL", () => {
    const requestWithUnreviewedContext = {
      ...structuredClone(unsignedProofVector),
      "@context": [...proofVector["@context"], "https://attacker.invalid/context"],
    };

    expect(
      SignRequestSchema.safeParse({
        operation: "credential.sign",
        document: requestWithUnreviewedContext,
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects a credential.sign request with an inline JSON-LD context", () => {
    const requestWithInlineContext = {
      ...structuredClone(unsignedProofVector),
      "@context": [...proofVector["@context"], { attacker: "https://attacker.invalid/context" }],
    };

    expect(
      SignRequestSchema.safeParse({
        operation: "credential.sign",
        document: requestWithInlineContext,
      }),
    ).toMatchObject({ success: false });
  });

  it("parses a verified response with its signing key identifier", () => {
    expect(VerifyResponseSchema.parse({ outcome: "VERIFIED", keyId: "test-key" }).outcome).toBe(
      "VERIFIED",
    );
  });
});

describe("EdDSA RDFC 2022 proof verification", () => {
  it("verifies with an explicitly supplied public Multikey and rejects a different published key", async () => {
    const key = {
      id: proofVector.proof.verificationMethod,
      controller: "https://example.edu/issuers/565049",
      publicKeyMultibase: "z6MkjZRZv3aez3r18pB1RBFJR1kwUVJ5jHt92JmQwXbd5hwi",
    };

    await expect(verifyEddsaRdfc2022Proof(proofVector, key)).resolves.toBe(true);
    await expect(
      verifyEddsaRdfc2022Proof(proofVector, {
        ...key,
        publicKeyMultibase: "z6MkiB4Qx6sBqCzHHCgbFt2kwNZECmSoVvW5gxcqQZExvxGC",
      }),
    ).resolves.toBe(false);
  });

  it("rejects the official-compatible proof after its achievement name is changed", async () => {
    const tampered = structuredClone(proofVector);
    tampered.credentialSubject.achievement.name = "Tampered Teamwork";

    await expect(verifyOfficialEddsaRdfc2022ProofVector(proofVector)).resolves.toBe(true);
    await expect(verifyOfficialEddsaRdfc2022ProofVector(tampered)).resolves.toBe(false);
  });
});
