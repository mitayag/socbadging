import { describe, expect, it } from "vitest";

import type { OpenBadgeCredentialSnapshot } from "@/modules/issuance/types";

import {
  buildOpenBadgeCredential,
  hashOpenBadgeEmailIdentifier,
  normalizeOpenBadgeEmailIdentifier,
  type SignedCredentialBuildInput,
} from "./credential-builder";

const snapshot: OpenBadgeCredentialSnapshot = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "https://badges.example.test/credentials/public-credential-1",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  name: "Secure Systems Foundations",
  issuer: {
    id: "https://badges.example.test/api/issuers/hau-soc",
    type: ["Profile"],
    name: "HAU School of Computing",
    image: { id: "https://badges.example.test/images/hau-soc.png", type: "Image" },
  },
  validFrom: "2026-08-25T01:02:03.456Z",
  validUntil: "2027-08-25T01:02:03.456Z",
  credentialSubject: {
    type: ["AchievementSubject"],
    identifier: [
      {
        type: "IdentityObject",
        identityHash: "4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
        identityType: "email",
        hashed: true,
      },
    ],
    achievement: {
      id: "https://badges.example.test/achievements/raw-template-db-id-SENTINEL",
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
};

function input(overrides: Partial<SignedCredentialBuildInput> = {}): SignedCredentialBuildInput {
  return {
    snapshot,
    recipientEmail: " Juan.DelaCruz@Example.edu ",
    signingKey: {
      controllerUrl: "https://badges.example.test/api/issuers/hau-soc",
      verificationMethodUrl: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
    },
    statusAllocation: {
      listId: "database-list-id",
      index: 8,
      statusUrl: "https://badges.example.test/api/status-lists/list-1",
    },
    ...overrides,
  };
}

describe("buildOpenBadgeCredential", () => {
  it("builds the complete canonical unsigned credential from an immutable snapshot", () => {
    expect(buildOpenBadgeCredential(input())).toEqual({
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
        image: { id: "https://badges.example.test/images/hau-soc.png", type: "Image" },
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
          ...snapshot.credentialSubject.achievement,
          id: "https://badges.example.test/achievements/c03479779f8c5a9a767e90cfaa65d8845e060191a54476a8f324bb2dd55ed988",
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
    });
  });

  it("normalizes the UTF-8 email hash input and emits the normative identity form", () => {
    expect(normalizeOpenBadgeEmailIdentifier(" Juan.DelaCruz@Example.edu ")).toBe(
      "juan.delacruz@example.edu",
    );
    expect(hashOpenBadgeEmailIdentifier(" Juan.DelaCruz@Example.edu ")).toBe(
      "sha256$4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
    );
    expect(buildOpenBadgeCredential(input()).credentialSubject.identifier).toEqual([
      {
        type: "IdentityObject",
        identityHash: "sha256$4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
        identityType: "emailAddress",
        hashed: true,
      },
    ]);
  });

  it("omits validUntil when the source snapshot has no expiration", () => {
    const withoutExpiration = structuredClone(snapshot);
    delete withoutExpiration.validUntil;

    expect(buildOpenBadgeCredential(input({ snapshot: withoutExpiration }))).not.toHaveProperty(
      "validUntil",
    );
  });

  it("does not serialize raw recipient, allocation, or persistence identifiers", () => {
    const serialized = JSON.stringify(buildOpenBadgeCredential(input()));

    expect(serialized).not.toContain("student@example.edu");
    expect(serialized).not.toContain("2026-00001");
    expect(serialized).not.toContain("database-list-id");
    expect(serialized).not.toContain("studentId");
    expect(serialized).not.toContain("badgeTemplateId");
    expect(serialized).not.toContain("issuerUserId");
    expect(serialized).not.toContain("raw-template-db-id-SENTINEL");
    expect(serialized).not.toContain("Juan.DelaCruz@Example.edu");
  });

  it("rejects an issuer that does not match the signing-key controller", () => {
    expect(() =>
      buildOpenBadgeCredential(
        input({
          signingKey: {
            controllerUrl: "https://badges.example.test/api/issuers/other",
            verificationMethodUrl: "https://badges.example.test/api/issuers/other/keys/key-1",
          },
        }),
      ),
    ).toThrow("Credential issuer must match the signing-key controller");
  });

  it("rejects a noncanonical signing-key URL", () => {
    expect(() =>
      buildOpenBadgeCredential(
        input({
          signingKey: {
            controllerUrl: snapshot.issuer.id,
            verificationMethodUrl: "https://attacker.invalid/keys/key-1",
          },
        }),
      ),
    ).toThrow("Signing key URL must be canonical for the issuer controller");
  });

  it("accepts the canonical key path for a root issuer controller", () => {
    const rootSnapshot = structuredClone(snapshot);
    rootSnapshot.issuer.id = "https://issuer.example/";

    expect(() =>
      buildOpenBadgeCredential(
        input({
          snapshot: rootSnapshot,
          signingKey: {
            controllerUrl: "https://issuer.example/",
            verificationMethodUrl: "https://issuer.example/keys/key-1",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects nested key paths and HTTP status resources", () => {
    expect(() =>
      buildOpenBadgeCredential(
        input({
          signingKey: {
            controllerUrl: snapshot.issuer.id,
            verificationMethodUrl:
              "https://badges.example.test/api/issuers/hau-soc/keys/key-1/forged",
          },
        }),
      ),
    ).toThrow("Signing key URL must be canonical for the issuer controller");
    expect(() =>
      buildOpenBadgeCredential(
        input({
          statusAllocation: {
            listId: "database-list-id",
            index: 8,
            statusUrl: "http://badges.example.test/api/status-lists/list-1",
          },
        }),
      ),
    ).toThrow();
  });

  it.each([
    ["uppercase encoded slash", "key-1%2Fforged"],
    ["lowercase encoded slash", "key-1%2fforged"],
    ["encoded backslash", "key-1%5Cforged"],
    ["encoded dot", "key-1%2E"],
    ["literal dot segment", "./key-1"],
    ["encoded dot-dot segment", "%2E%2E/key-1"],
    ["double-encoded slash", "key-1%252Fforged"],
    ["malformed percent escape", "key-1%zzforged"],
    ["duplicate slash", "key-1//forged"],
    ["empty segment", ""],
    ["raw backslash", "key-1\\forged"],
  ])("rejects an ambiguous %s in the signing-key path", (_label, keyPath) => {
    expect(() =>
      buildOpenBadgeCredential(
        input({
          signingKey: {
            controllerUrl: snapshot.issuer.id,
            verificationMethodUrl: `${snapshot.issuer.id}/keys/${keyPath}`,
          },
        }),
      ),
    ).toThrow();
  });

  it("rejects a controller with duplicate trailing slashes", () => {
    const ambiguousSnapshot = structuredClone(snapshot);
    ambiguousSnapshot.issuer.id = "https://badges.example.test/api/issuers/hau-soc//";

    expect(() =>
      buildOpenBadgeCredential(
        input({
          snapshot: ambiguousSnapshot,
          signingKey: {
            controllerUrl: "https://badges.example.test/api/issuers/hau-soc//",
            verificationMethodUrl: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
          },
        }),
      ),
    ).toThrow();
  });
});
