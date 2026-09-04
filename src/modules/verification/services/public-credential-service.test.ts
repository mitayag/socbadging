import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRevocationList } from "@/modules/open-badges/status-list";
import { serializePublicCredentialJson } from "./public-credential-json";

const mocks = vi.hoisted(() => ({
  issuanceFindUnique: vi.fn(),
  getPublicSystemSettings: vi.fn(),
  verifyProof: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    badgeIssuance: { findUnique: mocks.issuanceFindUnique },
  },
}));

vi.mock("@/modules/settings/services/system-settings-service", () => ({
  getPublicSystemSettings: mocks.getPublicSystemSettings,
}));

vi.mock("@/modules/open-badges/proof", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/open-badges/proof")>()),
  verifyEddsaRdfc2022Proof: mocks.verifyProof,
}));

import {
  PublicCredentialNotFoundError,
  effectiveCredentialStatus,
  getPublicCredential,
} from "./public-credential-service";

const publicId = "abcdefghijklmnopqrstuvwxyzABCDEF";

const recipientSnapshot = {
  studentId: "student-id-private",
  studentNumber: "2026-00001",
  displayName: "Maria Santos",
  firstName: "Maria",
  lastName: "Santos",
  email: "maria@example.edu",
};

const achievementSnapshot = {
  badgeTemplateId: "badge-template-private",
  id: "https://badges.example.edu/achievements/badge-template-private",
  type: ["Achievement"],
  name: "Secure Systems Foundations",
  description: "Recognizes secure systems fundamentals.",
  criteria: { narrative: "Complete the secure systems assessment." },
  imagePath: "badges/private-source.png",
  image: { id: "https://badges.example.edu/api/media/badges/secure-systems.png", type: "Image" },
  skills: ["Security"],
  tag: ["Security"],
  alignment: [
    {
      type: ["Alignment"],
      targetName: "NICE Framework",
      targetUrl: "https://niccs.cisa.gov/framework",
    },
  ],
  templateUpdatedAt: "2026-08-10T12:00:00.000Z",
  class: {
    id: "class-roster-private",
    courseCode: "CS 401",
    title: "Secure Systems",
    section: "A",
    term: "First Semester",
    academicYear: "2026-2027",
  },
  expiresAfterDays: null,
};

const issuerSnapshot = {
  name: "Holy Angel University — School of Computing",
  url: "https://issuer.example.edu",
  logoUrl: "https://badges.example.edu/images/hausoclogo.png",
  issuerUserId: "issuer-user-private",
  issuerUserName: "Prof. Private",
};

const credentialSnapshot = {
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
      id: "https://badges.example.edu/achievements/badge-template-private",
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
};

function issuance(overrides: Record<string, unknown> = {}) {
  return {
    publicId,
    status: "ACTIVE",
    issuedAt: new Date("2026-08-12T08:30:15.250Z"),
    expiresAt: null,
    revocationReason: null,
    revokedAt: null,
    recipientSnapshotJson: structuredClone(recipientSnapshot),
    achievementSnapshotJson: structuredClone(achievementSnapshot),
    issuerSnapshotJson: structuredClone(issuerSnapshot),
    credentialJson: structuredClone(credentialSnapshot),
    ...overrides,
  };
}

const publicSettings = {
  issuerName: "Current settings must not overwrite issuer snapshot",
  issuerUrl: "https://current-settings.example.edu",
  issuerLogoPath: "/images/current-settings.png",
  supportContact: "support@hau.edu.ph",
  sharingEnabled: false,
};

const signedIssuerId = "https://badges.example.test/api/issuers/hau-soc";
const signedKeyId = `${signedIssuerId}/keys/key-1`;
const signedStatusListId = "https://badges.example.test/api/status-lists/list-1";

function signedCredential() {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
    ],
    id: `https://badges.example.test/credentials/${publicId}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: "Secure Systems Foundations",
    issuer: {
      id: signedIssuerId,
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
      id: `${signedStatusListId}#8`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "8",
      statusListCredential: signedStatusListId,
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
      verificationMethod: signedKeyId,
      proofValue: "z3FXQqBNXUtsjQ",
    },
  };
}

function signedStatusList() {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: signedStatusListId,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: signedIssuerId,
    validFrom: "2026-08-12T08:30:15.250Z",
    credentialSubject: {
      id: `${signedStatusListId}#list`,
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: encodeRevocationList([], 131_072),
    },
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: signedKeyId,
      proofValue: "z3FXQqBNXUtsjQ",
    },
  };
}

function signedIssuance(allocationIndex = 8) {
  return issuance({
    signedCredentialJson: signedCredential(),
    signingKeyId: "key-1",
    signingKey: {
      verificationMethodUrl: signedKeyId,
      controllerUrl: signedIssuerId,
      publicMultikey: "z6MkhYk",
      status: "RETIRED",
    },
    statusAllocation: {
      index: allocationIndex,
      statusList: {
        publicUrl: signedStatusListId,
        signedCredentialJson: signedStatusList(),
        signingKey: {
          verificationMethodUrl: signedKeyId,
          controllerUrl: signedIssuerId,
          publicMultikey: "z6MkhYk",
          status: "ACTIVE",
        },
      },
    },
  });
}

function restoreAppUrl(previousAppUrl: string | undefined): void {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
}

describe("effectiveCredentialStatus", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it.each([
    [
      "keeps a persisted revocation over a past expiration",
      "REVOKED",
      "2026-08-01T12:00:00.000Z",
      "REVOKED",
    ],
    [
      "derives a persisted expiration from an elapsed expiration date",
      "EXPIRED",
      "2026-08-01T12:00:00.000Z",
      "EXPIRED",
    ],
    ["expires exactly at the current instant", "ACTIVE", "2026-09-01T12:00:00.000Z", "EXPIRED"],
    ["remains active before expiration", "ACTIVE", "2026-09-01T12:00:00.001Z", "ACTIVE"],
    ["remains active without an expiration", "ACTIVE", null, "ACTIVE"],
  ] as const)("%s", (_caseName, status, expiresAt, expected) => {
    expect(
      effectiveCredentialStatus({
        status,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        now,
      }),
    ).toBe(expected);
  });

  it("fails closed for an inconsistent persisted expiration without an expiration date", () => {
    expect(() => effectiveCredentialStatus({ status: "EXPIRED", expiresAt: null, now })).toThrow(
      PublicCredentialNotFoundError,
    );
  });
});

describe("getPublicCredential", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.issuanceFindUnique.mockResolvedValue(issuance());
    mocks.getPublicSystemSettings.mockResolvedValue(publicSettings);
    mocks.verifyProof.mockResolvedValue(true);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["Maria Santos", "Maria", "Santos", "Maria S."],
    ["  María   Santos ", "  María  ", "  Santos ", "María S."],
    ["李 小龍", "李", "小龍", "李 小."],
    ["Madonna", "Madonna", "", "Madonna"],
    ["", "", "", "Recipient"],
    ["<script> Santos", "<script>", "Santos", "Recipient"],
    ["Maria \u0301Santos", "Maria", "\u0301Santos", "Recipient"],
  ])(
    "masks %s deterministically without using the full display name",
    async (_displayName, firstName, lastName, expected) => {
      mocks.issuanceFindUnique.mockResolvedValueOnce(
        issuance({
          recipientSnapshotJson: {
            ...recipientSnapshot,
            displayName: _displayName,
            firstName,
            lastName,
          },
        }),
      );

      await expect(getPublicCredential(publicId)).resolves.toMatchObject({
        recipientDisplayName: expected,
      });
    },
  );

  it("queries by the strict public identifier with only public lifecycle and immutable snapshot fields", async () => {
    await getPublicCredential(publicId);

    expect(mocks.issuanceFindUnique).toHaveBeenCalledWith({
      where: { publicId },
      select: {
        publicId: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        revocationReason: true,
        revokedAt: true,
        recipientSnapshotJson: true,
        achievementSnapshotJson: true,
        issuerSnapshotJson: true,
        credentialJson: true,
        signedCredentialJson: true,
        signingKeyId: true,
        signingKey: {
          select: {
            verificationMethodUrl: true,
            controllerUrl: true,
            publicMultikey: true,
            status: true,
          },
        },
        statusAllocation: {
          select: {
            index: true,
            statusList: {
              select: {
                publicUrl: true,
                signedCredentialJson: true,
                signingKey: {
                  select: {
                    verificationMethodUrl: true,
                    controllerUrl: true,
                    publicMultikey: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it("preserves a persisted signed document through service validation and serialization without PII", async () => {
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://badges.example.test";
    const stored = signedCredential();
    mocks.issuanceFindUnique.mockResolvedValueOnce(signedIssuance());

    try {
      const detail = await getPublicCredential(publicId);
      const inline = serializePublicCredentialJson(detail);

      expect(detail.signedCredentialJson).toEqual(stored);
      expect(inline).toBe(JSON.stringify(stored));
      expect(inline).not.toContain("maria@example.edu");
      expect(inline).not.toContain("2026-00001");
    } finally {
      restoreAppUrl(previousAppUrl);
    }
  });

  it("fails closed when the credential status entry does not match its persisted allocation index", async () => {
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://badges.example.test";
    mocks.issuanceFindUnique.mockResolvedValueOnce(signedIssuance(9));

    try {
      await expect(getPublicCredential(publicId)).resolves.toMatchObject({
        cryptographicVerification: { outcome: "VERIFICATION_UNAVAILABLE" },
      });
    } finally {
      restoreAppUrl(previousAppUrl);
    }
  });

  it("returns a narrow privacy-safe DTO and preserves the issuance-time issuer despite current settings", async () => {
    const detail = await getPublicCredential(publicId);
    const serialized = JSON.stringify(detail);

    expect(detail).toMatchObject({
      publicId,
      status: "ACTIVE",
      recipientDisplayName: "Maria S.",
      issuer: {
        name: "Holy Angel University — School of Computing",
        url: "https://issuer.example.edu",
      },
      supportContact: "support@hau.edu.ph",
      sharingEnabled: false,
    });
    expect(detail).not.toHaveProperty("id");
    expect(detail).not.toHaveProperty("recipient");
    expect(detail).not.toHaveProperty("issuerUserId");
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

  it("clones projected nested values instead of mutating raw database snapshots", async () => {
    const raw = issuance();
    mocks.issuanceFindUnique.mockResolvedValueOnce(raw);

    const detail = await getPublicCredential(publicId);
    detail.achievement.skills.push("Mutation");
    detail.credential.credentialSubject.identifier[0]!.identityHash = "b".repeat(64);

    expect(raw.achievementSnapshotJson).toEqual(achievementSnapshot);
    expect(raw.credentialJson).toEqual(credentialSnapshot);
  });

  it("exposes a trimmed bounded public revocation reason and timestamp without rewriting snapshots", async () => {
    const revokedAt = new Date("2026-08-20T09:30:00.000Z");
    const raw = issuance({
      status: "REVOKED",
      revocationReason: "  Academic-integrity finding.  ",
      revokedAt,
    });
    mocks.issuanceFindUnique.mockResolvedValueOnce(raw);

    await expect(getPublicCredential(publicId)).resolves.toMatchObject({
      status: "REVOKED",
      revokedAt: "2026-08-20T09:30:00.000Z",
      revocationReason: "Academic-integrity finding.",
    });
    expect(raw.credentialJson).toEqual(credentialSnapshot);
  });

  it.each([
    ["a missing identifier", ""],
    ["a sequential-looking identifier", "12345"],
    ["a malformed URL-like identifier", "../../private-record"],
    ["an absent valid identifier", "ZYXWVUTSRQPONMLKJIHGFEDCBA987654"],
  ])("uses the same safe not-found error for %s", async (_caseName, value) => {
    if (value === "ZYXWVUTSRQPONMLKJIHGFEDCBA987654") {
      mocks.issuanceFindUnique.mockResolvedValueOnce(null);
    }

    await expect(getPublicCredential(value)).rejects.toBeInstanceOf(PublicCredentialNotFoundError);
  });

  it("does not query for malformed public identifiers", async () => {
    await expect(getPublicCredential("../../private-record")).rejects.toBeInstanceOf(
      PublicCredentialNotFoundError,
    );
    expect(mocks.issuanceFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a corrupt recipient snapshot",
      { recipientSnapshotJson: { ...recipientSnapshot, email: 42 } },
    ],
    [
      "a corrupt achievement snapshot",
      { achievementSnapshotJson: { ...achievementSnapshot, skills: "no" } },
    ],
    ["a corrupt issuer snapshot", { issuerSnapshotJson: { ...issuerSnapshot, url: "not a URL" } }],
    [
      "a corrupt credential snapshot",
      { credentialJson: { ...credentialSnapshot, type: ["Wrong"] } },
    ],
    [
      "an unexpected field in a raw snapshot",
      { recipientSnapshotJson: { ...recipientSnapshot, rawDatabaseField: "private" } },
    ],
    [
      "an unexpected nested criteria field in a raw snapshot",
      {
        achievementSnapshotJson: {
          ...achievementSnapshot,
          criteria: { ...achievementSnapshot.criteria, rawDatabaseField: "private" },
        },
      },
    ],
    [
      "an unsafe URL scheme in an issuer snapshot",
      { issuerSnapshotJson: { ...issuerSnapshot, url: "javascript:alert(1)" } },
    ],
    [
      "a credential identifier with an untrusted origin",
      {
        credentialJson: {
          ...credentialSnapshot,
          id: `https://untrusted.example/credentials/${publicId}`,
        },
      },
    ],
  ])("fails closed for %s", async (_caseName, overrides) => {
    mocks.issuanceFindUnique.mockResolvedValueOnce(issuance(overrides));

    await expect(getPublicCredential(publicId)).rejects.toBeInstanceOf(
      PublicCredentialNotFoundError,
    );
  });

  it("logs only a minimal server-side corruption event while returning the uniform not-found error", async () => {
    mocks.issuanceFindUnique.mockResolvedValueOnce(
      issuance({ recipientSnapshotJson: { ...recipientSnapshot, email: 42 } }),
    );

    await expect(getPublicCredential(publicId)).rejects.toBeInstanceOf(
      PublicCredentialNotFoundError,
    );
    expect(errorLog).toHaveBeenCalledWith("Public credential snapshot validation failed", {
      event: "public_credential_snapshot_invalid",
      publicId,
    });

    const logged = JSON.stringify(errorLog.mock.calls);
    for (const privateSentinel of [
      "maria@example.edu",
      "2026-00001",
      "student-id-private",
      "issuer-user-private",
      "Prof. Private",
      "badges/private-source.png",
      "recipientSnapshotJson",
    ]) {
      expect(logged).not.toContain(privateSentinel);
    }
  });
});
