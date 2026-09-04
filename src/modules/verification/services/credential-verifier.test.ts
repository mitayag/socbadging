import { describe, expect, it } from "vitest";

import { verifyPublicCredential, type VerificationDependencies } from "./credential-verifier";

const keyId = "https://badges.example.test/api/issuers/hau-soc/keys/key-1";
const issuerId = "https://badges.example.test/api/issuers/hau-soc";
const statusListId = "https://badges.example.test/api/status-lists/list-1";

function document(overrides: Record<string, unknown> = {}) {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
    ],
    id: "https://badges.example.test/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: "Secure Systems",
    issuer: {
      id: issuerId,
      type: ["Profile"],
      name: "HAU SOC",
      image: { id: "https://badges.example.test/logo.png", type: "Image" },
    },
    validFrom: "2026-08-25T00:00:00.000Z",
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject",
          identityHash: `sha256$${"a".repeat(64)}`,
          identityType: "emailAddress",
          hashed: true,
        },
      ],
      achievement: {
        id: "https://badges.example.test/achievements/secure",
        type: ["Achievement"],
        name: "Secure Systems",
        description: "Completed secure systems.",
        criteria: { narrative: "Complete assessment." },
        image: { id: "https://badges.example.test/badge.png", type: "Image" },
      },
    },
    credentialStatus: {
      id: `${statusListId}#8`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "8",
      statusListCredential: statusListId,
    },
    credentialSchema: [
      {
        id: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
        type: "1EdTechJsonSchemaValidator2019",
      },
    ],
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: keyId,
      proofValue: "z3FXQqBNXUtsjQ",
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<VerificationDependencies> = {}): VerificationDependencies {
  return {
    now: () => new Date("2026-08-26T00:00:00.000Z"),
    getIssuer: async () => ({ id: issuerId, verificationMethod: [keyId] }),
    getKey: async () => ({
      id: keyId,
      controller: issuerId,
      type: "Multikey",
      publicKeyMultibase: "z6MkhYk",
      trustState: "ACTIVE",
    }),
    getStatusList: async () => ({ revoked: false }),
    verifyProof: async () => true,
    ...overrides,
  };
}

describe("verifyPublicCredential", () => {
  it("returns VERIFIED only after proof, issuer, key, status, and time checks pass", async () => {
    await expect(verifyPublicCredential(document(), dependencies())).resolves.toMatchObject({
      outcome: "VERIFIED",
      keyId,
    });
  });

  it.each([
    [
      "tampered document",
      document({ name: "Tampered" }),
      dependencies({ verifyProof: async () => false }),
      "INVALID_PROOF",
    ],
    [
      "wrong controller",
      document(),
      dependencies({
        getKey: async () => ({
          id: keyId,
          controller: "https://attacker.example/issuer",
          type: "Multikey",
          publicKeyMultibase: "z6MkhYk",
          trustState: "ACTIVE",
        }),
      }),
      "INVALID_PROOF",
    ],
    [
      "wrong key",
      document({
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/other",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      }),
      dependencies(),
      "INVALID_PROOF",
    ],
    [
      "future validFrom",
      document({ validFrom: "2026-08-27T00:00:00.000Z" }),
      dependencies(),
      "INVALID_PROOF",
    ],
    [
      "expired date",
      document({ validUntil: "2026-08-25T12:00:00.000Z" }),
      dependencies(),
      "EXPIRED",
    ],
    [
      "revoked status",
      document(),
      dependencies({ getStatusList: async () => ({ revoked: true }) }),
      "REVOKED",
    ],
    [
      "status unavailable",
      document(),
      dependencies({
        getStatusList: async () => {
          throw new Error("offline");
        },
      }),
      "VERIFICATION_UNAVAILABLE",
    ],
    [
      "compromised key",
      document(),
      dependencies({
        getKey: async () => ({
          id: keyId,
          controller: issuerId,
          type: "Multikey",
          publicKeyMultibase: "z6MkhYk",
          trustState: "COMPROMISED",
        }),
      }),
      "INVALID_PROOF",
    ],
  ] as const)("fails closed for %s", async (_name, candidate, deps, outcome) => {
    await expect(verifyPublicCredential(candidate, deps)).resolves.toMatchObject({ outcome });
  });

  it("accepts a valid proof from a published retired key", async () => {
    await expect(
      verifyPublicCredential(
        document(),
        dependencies({
          getKey: async () => ({
            id: keyId,
            controller: issuerId,
            type: "Multikey",
            publicKeyMultibase: "z6MkhYk",
            trustState: "RETIRED",
          }),
        }),
      ),
    ).resolves.toMatchObject({ outcome: "VERIFIED" });
  });

  it("returns VERIFICATION_UNAVAILABLE when public-key proof verification has an operational outage", async () => {
    await expect(
      verifyPublicCredential(
        document(),
        dependencies({
          verifyProof: async () => {
            throw new Error("cryptographic dependency unavailable");
          },
        }),
      ),
    ).resolves.toMatchObject({ outcome: "VERIFICATION_UNAVAILABLE" });
  });

  it("does not assign a verified result to legacy unsigned documents", async () => {
    const legacy = { ...document() };
    delete (legacy as { proof?: unknown }).proof;
    await expect(verifyPublicCredential(legacy, dependencies())).resolves.toMatchObject({
      outcome: "INVALID_PROOF",
    });
  });
});
