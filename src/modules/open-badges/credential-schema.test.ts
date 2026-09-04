import { describe, expect, it } from "vitest";

import {
  SignedOpenBadgeCredentialSchema,
  SignedStatusListCredentialSchema,
} from "./credential-schema";

const signedCredential = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
  ],
  id: "https://badges.example.test/credentials/public-credential-1",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  name: "Secure Systems Foundations",
  issuer: {
    id: "https://badges.example.test/api/issuers/hau-soc",
    type: ["Profile"],
    name: "HAU School of Computing",
    image: {
      id: "https://badges.example.test/images/hau-soc.png",
      type: "Image",
    },
  },
  validFrom: "2026-08-25T01:02:03.456Z",
  validUntil: "2027-08-25T01:02:03.456Z",
  credentialSubject: {
    type: ["AchievementSubject"],
    identifier: [
      {
        type: "IdentityObject",
        identityHash: "sha256$4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
        identityType: "emailAddress",
        hashed: true,
      },
    ],
    achievement: {
      id: "https://badges.example.test/achievements/security-foundations",
      type: ["Achievement"],
      name: "Secure Systems Foundations",
      description: "Recognizes secure systems fundamentals.",
      criteria: { narrative: "Complete every assessed activity." },
      image: {
        id: "https://badges.example.test/api/media/badges/security-foundations.png",
        type: "Image",
      },
      tag: ["Security", "Linux"],
      alignment: [
        {
          type: ["Alignment"],
          targetName: "NICE Framework",
          targetUrl: "https://niccs.cisa.gov/workforce-development/nice-framework",
        },
      ],
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
    created: "2026-08-25T01:02:04.000Z",
    proofValue: "z3FXQqBNXUtsjQ",
  },
};

const signedStatusList = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "https://badges.example.test/api/status-lists/list-1",
  type: ["VerifiableCredential", "BitstringStatusListCredential"],
  issuer: "https://badges.example.test/api/issuers/hau-soc",
  validFrom: "2026-08-25T01:02:03.456Z",
  credentialSubject: {
    id: "https://badges.example.test/api/status-lists/list-1#list",
    type: "BitstringStatusList",
    statusPurpose: "revocation",
    encodedList: "uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA",
  },
  proof: signedCredential.proof,
};

describe("canonical Open Badges schemas", () => {
  it("accepts a complete privacy-minimized signed OpenBadgeCredential", () => {
    expect(SignedOpenBadgeCredentialSchema.parse(signedCredential)).toEqual(signedCredential);
  });

  it("rejects unknown top-level fields", () => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({ ...signedCredential, studentId: "student-1" }),
    ).toMatchObject({ success: false });
  });

  it("rejects unapproved or reordered contexts", () => {
    for (const context of [
      [signedCredential["@context"][0], signedCredential["@context"][1]],
      [...signedCredential["@context"], "https://attacker.invalid/context"],
      [
        signedCredential["@context"][1],
        signedCredential["@context"][0],
        signedCredential["@context"][2],
      ],
    ]) {
      expect(
        SignedOpenBadgeCredentialSchema.safeParse({ ...signedCredential, "@context": context }),
      ).toMatchObject({ success: false });
    }
  });

  it("rejects the wrong schema identifier or status purpose", () => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        credentialSchema: [
          { ...signedCredential.credentialSchema[0], id: "https://attacker.invalid/schema" },
        ],
      }),
    ).toMatchObject({ success: false });
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        credentialStatus: { ...signedCredential.credentialStatus, statusPurpose: "suspension" },
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects a signing key outside the issuer controller", () => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        proof: {
          ...signedCredential.proof,
          verificationMethod: "https://attacker.invalid/api/issuers/other/keys/key-1",
        },
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects legacy recipient identity hash and type values", () => {
    const identifier = signedCredential.credentialSubject.identifier[0]!;
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        credentialSubject: {
          ...signedCredential.credentialSubject,
          identifier: [
            {
              ...identifier,
              identityHash: identifier.identityHash.replace("sha256$", ""),
              identityType: "email",
            },
          ],
        },
      }),
    ).toMatchObject({ success: false });
  });

  it("requires HTTPS for every Phase 8 public resource", () => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        id: "http://badges.example.test/credentials/public-credential-1",
      }),
    ).toMatchObject({ success: false });
  });

  it("accepts a root issuer controller and rejects nested key-path confusion", () => {
    const rootIssuerCredential = {
      ...signedCredential,
      issuer: { ...signedCredential.issuer, id: "https://issuer.example/" },
      proof: {
        ...signedCredential.proof,
        verificationMethod: "https://issuer.example/keys/key-1",
      },
    };
    expect(SignedOpenBadgeCredentialSchema.safeParse(rootIssuerCredential)).toMatchObject({
      success: true,
    });
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        proof: {
          ...signedCredential.proof,
          verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/key-1/forged",
        },
      }),
    ).toMatchObject({ success: false });
  });

  it.each([
    ["uppercase encoded slash", "key-1%2Fforged"],
    ["lowercase encoded slash", "key-1%2fforged"],
    ["uppercase encoded backslash", "key-1%5Cforged"],
    ["lowercase encoded backslash", "key-1%5cforged"],
    ["encoded dot", "key-1%2E"],
    ["literal dot segment", "./key-1"],
    ["encoded dot-dot segment", "%2E%2E/key-1"],
    ["double-encoded slash", "key-1%252Fforged"],
    ["malformed percent escape", "key-1%zzforged"],
    ["duplicate slash", "key-1//forged"],
    ["empty key segment", ""],
    ["raw backslash", "key-1\\forged"],
  ])("rejects an ambiguous %s in a verification-method path", (_label, keyPath) => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        proof: {
          ...signedCredential.proof,
          verificationMethod: `https://badges.example.test/api/issuers/hau-soc/keys/${keyPath}`,
        },
      }),
    ).toMatchObject({ success: false });
  });

  it.each([
    ["duplicate trailing slash", "https://badges.example.test/api/issuers/hau-soc//"],
    ["duplicate internal slash", "https://badges.example.test/api//issuers/hau-soc"],
    ["encoded slash", "https://badges.example.test/api/issuers/hau%2Fsoc"],
    ["encoded backslash", "https://badges.example.test/api/issuers/hau%5Csoc"],
    ["encoded dot", "https://badges.example.test/api/issuers/hau%2Esoc"],
    ["literal dot segment", "https://badges.example.test/api/issuers/./hau-soc"],
    ["encoded dot-dot segment", "https://badges.example.test/api/issuers/%2E%2E/hau-soc"],
    ["double-encoded slash", "https://badges.example.test/api/issuers/hau%252Fsoc"],
    ["malformed percent escape", "https://badges.example.test/api/issuers/hau%zzsoc"],
  ])("rejects an ambiguous %s in a public resource URL", (_label, issuerId) => {
    expect(
      SignedOpenBadgeCredentialSchema.safeParse({
        ...signedCredential,
        issuer: { ...signedCredential.issuer, id: issuerId },
      }),
    ).toMatchObject({ success: false });
  });

  it.each([
    ["unsafe protocol", { ...signedCredential, id: "javascript:alert(1)" }],
    [
      "URL credentials",
      { ...signedCredential, id: "https://username:password@badges.example.test/credentials/1" },
    ],
    ["invalid validFrom", { ...signedCredential, validFrom: "August 25, 2026" }],
    ["non-increasing validUntil", { ...signedCredential, validUntil: "2026-08-25T01:02:03.456Z" }],
  ])("rejects %s", (_label, document) => {
    expect(SignedOpenBadgeCredentialSchema.safeParse(document)).toMatchObject({ success: false });
  });

  it("rejects raw recipient identifiers wherever the public subject could expose them", () => {
    for (const rawField of [
      { email: "student@example.edu" },
      { studentNumber: "2026-00001" },
      { id: "student-internal-id" },
    ]) {
      expect(
        SignedOpenBadgeCredentialSchema.safeParse({
          ...signedCredential,
          credentialSubject: { ...signedCredential.credentialSubject, ...rawField },
        }),
      ).toMatchObject({ success: false });
    }
  });

  it("accepts the canonical signed Bitstring Status List credential", () => {
    expect(SignedStatusListCredentialSchema.parse(signedStatusList)).toEqual(signedStatusList);
  });

  it.each([
    ["non-GZIP data", "unotgzip"],
    ["an undersized expanded list", "uH4sIAAAAAAAAA2NgAAD_EtlBAgAAAA"],
    ["an oversized encoded input", `u${"A".repeat(180_001)}`],
  ])("rejects %s in a published status credential", (_label, encodedList) => {
    expect(
      SignedStatusListCredentialSchema.safeParse({
        ...signedStatusList,
        credentialSubject: { ...signedStatusList.credentialSubject, encodedList },
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects a status-list issuer/controller mismatch", () => {
    expect(
      SignedStatusListCredentialSchema.safeParse({
        ...signedStatusList,
        issuer: "https://badges.example.test/api/issuers/other",
      }),
    ).toMatchObject({ success: false });
  });
});
