import { describe, expect, it } from "vitest";

import { buildPublicCredentialJson, serializePublicCredentialJson } from "./public-credential-json";
import type { PublicCredential, PublicOpenBadgeCredential } from "../types";

const publicId = "abcdefghijklmnopqrstuvwxyzABCDEF";

function detail(overrides: Partial<PublicCredential> = {}): PublicCredential {
  return {
    publicId,
    status: "ACTIVE",
    issuedAt: "2026-08-12T08:30:15.250Z",
    expiresAt: null,
    revokedAt: null,
    revocationReason: null,
    recipientDisplayName: "Maria S.",
    achievement: {
      id: "https://badges.example.edu/achievements/badge-template-public",
      type: ["Achievement"],
      name: "Secure Systems Foundations",
      description: "Recognizes secure systems fundamentals.",
      criteria: { narrative: "Complete the secure systems assessment." },
      image: {
        id: "https://badges.example.edu/api/media/badges/secure-systems.png",
        type: "Image",
      },
      skills: ["Security"],
      tag: ["Security"],
      alignment: [
        {
          type: ["Alignment"],
          targetName: "NICE Framework",
          targetUrl: "https://niccs.cisa.gov/framework",
        },
      ],
      class: {
        courseCode: "CS 401",
        title: "Secure Systems",
        section: "A",
        term: "First Semester",
        academicYear: "2026-2027",
      },
    },
    issuer: {
      name: "Holy Angel University — School of Computing",
      url: "https://issuer.example.edu",
      logoUrl: "https://badges.example.edu/images/hausoclogo.png",
    },
    credential: {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      id: `http://localhost:3000/credentials/${publicId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      name: "Secure Systems Foundations",
      issuer: {
        id: "https://issuer.example.edu",
        type: ["Profile"],
        name: "Holy Angel University — School of Computing",
        image: { id: "https://badges.example.edu/images/hausoclogo.png", type: "Image" },
      },
      validFrom: "2026-08-12T08:30:15.250Z",
      credentialSubject: {
        type: ["AchievementSubject"],
        identifier: [
          {
            type: "IdentityObject",
            identityHash: "a".repeat(64),
            identityType: "email",
            hashed: true,
          },
        ],
        achievement: {
          id: "https://badges.example.edu/achievements/badge-template-public",
          type: ["Achievement"],
          name: "Secure Systems Foundations",
          description: "Recognizes secure systems fundamentals.",
          criteria: { narrative: "Complete the secure systems assessment." },
          image: {
            id: "https://badges.example.edu/api/media/badges/secure-systems.png",
            type: "Image",
          },
          tag: ["Security"],
          alignment: [
            {
              type: ["Alignment"],
              targetName: "NICE Framework",
              targetUrl: "https://niccs.cisa.gov/framework",
            },
          ],
        },
      },
    },
    supportContact: "support@hau.edu.ph",
    sharingEnabled: true,
    ...overrides,
  } as PublicCredential;
}

describe("buildPublicCredentialJson", () => {
  it("preserves the existing Open Badges context, types, issuer, achievement, and hashed email identity", () => {
    const result = buildPublicCredentialJson(detail());

    expect(result["@context"]).toEqual([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]);
    expect(result.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
    expect(result.id).toBe(`http://localhost:3000/credentials/${publicId}`);
    expect(result.issuer).toEqual(detail().credential.issuer);
    expect(result.credentialSubject.achievement).toEqual(
      detail().credential.credentialSubject.achievement,
    );
    expect(result.credentialSubject.identifier).toEqual([
      {
        type: "IdentityObject",
        identityHash: "a".repeat(64),
        identityType: "email",
        hashed: true,
      },
    ]);
  });

  it("adds deterministic lifecycle metadata outside immutable assertion fields for revoked credentials", () => {
    const result = buildPublicCredentialJson(
      detail({
        status: "REVOKED",
        expiresAt: "2026-09-11T08:30:15.250Z",
        revokedAt: "2026-08-20T09:30:00.000Z",
        revocationReason: "Academic-integrity finding.",
      }),
    );

    expect(
      (result as PublicOpenBadgeCredential)["https://hau.edu.ph/ns/credential-lifecycle"],
    ).toEqual({
      status: "REVOKED",
      expiresAt: "2026-09-11T08:30:15.250Z",
      revokedAt: "2026-08-20T09:30:00.000Z",
      revocationReason: "Academic-integrity finding.",
      unsigned: true,
      certified: false,
    });
    expect(result).not.toHaveProperty("proof");
  });

  it("records expired lifecycle state and dates without a fabricated revocation", () => {
    const result = buildPublicCredentialJson(
      detail({ status: "EXPIRED", expiresAt: "2026-08-01T12:00:00.000Z" }),
    );

    expect(
      (result as PublicOpenBadgeCredential)["https://hau.edu.ph/ns/credential-lifecycle"],
    ).toEqual({
      status: "EXPIRED",
      expiresAt: "2026-08-01T12:00:00.000Z",
      unsigned: true,
      certified: false,
    });
  });

  it("returns an isolated JSON object without mutating the public detail", () => {
    const source = detail();
    const result = buildPublicCredentialJson(source);
    result.credentialSubject.identifier[0]!.identityHash = "b".repeat(64);
    result.credentialSubject.achievement.tag?.push("Mutation");

    expect(source.credential.credentialSubject.identifier[0]!.identityHash).toBe("a".repeat(64));
    expect(source.credential.credentialSubject.achievement.tag).toEqual(["Security"]);
  });

  it("recursively omits every private sentinel and raw database-only field", () => {
    const serialized = JSON.stringify(buildPublicCredentialJson(detail()));

    for (const privateSentinel of [
      "maria@example.edu",
      "2026-00001",
      "student-id-private",
      "issuance-id-private",
      "issuer-user-private",
      "Prof. Private",
      "badges/private-source.png",
      "class-roster-private",
    ]) {
      expect(serialized).not.toContain(privateSentinel);
    }
  });
});

describe("serializePublicCredentialJson", () => {
  it("returns the persisted signed credential byte-for-byte without adding lifecycle fields", () => {
    const signed = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
        "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
      ],
      id: `https://badges.example.test/credentials/${publicId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      name: "Secure Systems Foundations",
      issuer: {
        id: "https://badges.example.test/api/issuers/hau-soc",
        type: ["Profile"],
        name: "HAU SOC",
        image: { id: "https://badges.example.test/logo.png", type: "Image" },
      },
      validFrom: "2026-08-12T08:30:15.250Z",
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
          name: "Secure Systems Foundations",
          description: "Recognizes secure systems fundamentals.",
          criteria: { narrative: "Complete the secure systems assessment." },
          image: { id: "https://badges.example.test/badge.png", type: "Image" },
        },
      },
      credentialStatus: {
        id: "https://badges.example.test/api/status-lists/list-1#8",
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "8",
        statusListCredential: "https://badges.example.test/api/status-lists/list-1",
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
        verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        proofValue: "z3FXQqBNXUtsjQ",
      },
    };
    const source = { ...detail(), signedCredentialJson: signed } as unknown as PublicCredential;

    expect(serializePublicCredentialJson(source)).toBe(JSON.stringify(signed));
  });

  it("serializes the same public representation deterministically", () => {
    const source = detail();

    expect(serializePublicCredentialJson(source)).toBe(
      JSON.stringify(buildPublicCredentialJson(source)),
    );
    expect(serializePublicCredentialJson(source)).toBe(serializePublicCredentialJson(source));
  });
});
