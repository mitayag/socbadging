import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCredentialSnapshots,
  calculateExpiresAt,
  generatePublicId,
  hashRecipientEmail,
  type CredentialSnapshotInput,
} from "./credential-snapshot";

const issuedAt = new Date("2026-08-12T08:30:15.250Z");

function createInput(overrides: Partial<CredentialSnapshotInput> = {}): CredentialSnapshotInput {
  return {
    publicId: "abcdefghijklmnopqrstuvwxABCDEFGH",
    issuedAt,
    expiresAt: new Date("2026-09-11T08:30:15.250Z"),
    recipient: {
      studentId: "student-1",
      studentNumber: "2026-00001",
      displayName: "Juan Dela Cruz",
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: " Juan.DelaCruz@Example.edu ",
    },
    achievement: {
      badgeTemplateId: "badge-template-1",
      name: "Secure Systems Foundations",
      description: "Recognizes secure systems fundamentals.",
      criteria: "Complete the secure systems assessment.",
      imagePath: "badges/secure-systems.png",
      skills: ["Security", "Linux"],
      alignment: [
        {
          targetName: "NICE Framework",
          targetUrl: "https://niccs.cisa.gov/workforce-development/nice-framework",
        },
      ],
      templateUpdatedAt: new Date("2026-08-10T12:00:00.000Z"),
      class: {
        id: "class-1",
        courseCode: "CS 401",
        title: "Secure Systems",
        section: "A",
        term: "First Semester",
        academicYear: "2026-2027",
      },
      expiresAfterDays: 30,
    },
    issuer: { issuerUserId: "faculty-1", issuerUserName: "Prof. Reyes" },
    ...overrides,
  };
}

describe("credential snapshot helpers", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://badges.hau.edu.ph");
    vi.stubEnv("ISSUER_NAME", undefined);
    vi.stubEnv("ISSUER_URL", "");
    vi.stubEnv("ISSUER_LOGO_PATH", undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates distinct 32-character URL-safe public IDs", () => {
    const first = generatePublicId();
    const second = generatePublicId();

    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).not.toBe(first);
  });

  it("hashes normalized recipient email as lowercase SHA-256 hex", () => {
    expect(hashRecipientEmail("  Juan.DelaCruz@EXAMPLE.edu  ")).toBe(
      "4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
    );
    expect(hashRecipientEmail("juan.delacruz@example.edu")).toBe(
      "4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
    );
  });

  it("calculates expiration with exact UTC milliseconds without mutating the issue date", () => {
    const source = new Date("2026-02-28T23:59:59.123Z");

    expect(calculateExpiresAt(source, 2)?.toISOString()).toBe("2026-03-02T23:59:59.123Z");
    expect(source.toISOString()).toBe("2026-02-28T23:59:59.123Z");
  });

  it("returns no expiration when the template has no expiration rule", () => {
    expect(calculateExpiresAt(issuedAt, null)).toBeNull();
  });

  it("serializes the configured issuer defaults and canonical identifiers", () => {
    const snapshots = buildCredentialSnapshots(createInput());

    expect(snapshots.issuer).toEqual({
      name: "Holy Angel University — School of Computing",
      url: "https://badges.hau.edu.ph",
      logoUrl: "https://badges.hau.edu.ph/images/hausoclogo.png",
      issuerUserId: "faculty-1",
      issuerUserName: "Prof. Reyes",
    });
    expect(snapshots.achievement.id).toBe(
      "https://badges.hau.edu.ph/achievements/badge-template-1",
    );
    expect(snapshots.achievement.image).toEqual({
      id: "https://badges.hau.edu.ph/api/media/badges/secure-systems.png",
      type: "Image",
    });
    expect(snapshots.credential.id).toBe(
      "https://badges.hau.edu.ph/credentials/abcdefghijklmnopqrstuvwxABCDEFGH",
    );
  });

  it("uses a configured issuer URL without changing the canonical application logo URL", () => {
    vi.stubEnv("ISSUER_URL", "https://issuer.hau.edu.ph/profile");
    vi.stubEnv("ISSUER_LOGO_PATH", "/images/issuer-logo.png");

    const snapshots = buildCredentialSnapshots(createInput());

    expect(snapshots.issuer.url).toBe("https://issuer.hau.edu.ph/profile");
    expect(snapshots.issuer.logoUrl).toBe("https://badges.hau.edu.ph/images/issuer-logo.png");
    expect(snapshots.credential.issuer.id).toBe("https://issuer.hau.edu.ph/profile");
  });

  it("uses a validated issuer presentation snapshot for a newly issued credential", () => {
    const snapshots = buildCredentialSnapshots({
      ...createInput(),
      issuerPresentation: {
        issuerName: "HAU School of Computing Credentials",
        issuerUrl: "https://issuer.example.edu/profile",
        issuerLogoPath: "/images/current-issuer-logo.png",
      },
    });

    expect(snapshots.issuer).toMatchObject({
      name: "HAU School of Computing Credentials",
      url: "https://issuer.example.edu/profile",
      logoUrl: "https://badges.hau.edu.ph/images/current-issuer-logo.png",
    });
    expect(snapshots.credential.issuer).toMatchObject({
      id: "https://issuer.example.edu/profile",
      name: "HAU School of Computing Credentials",
      image: { id: "https://badges.hau.edu.ph/images/current-issuer-logo.png" },
    });
  });

  it.each([
    "/images/%2e%2e/admin",
    "/images/%2Fadmin",
    "/images/%5cadmin",
    "/images/logo.png?next=/admin",
    "/images/logo.png#admin",
  ])("rejects unsafe encoded issuer logo paths: %s", (logoPath) => {
    vi.stubEnv("ISSUER_LOGO_PATH", logoPath);

    expect(() => buildCredentialSnapshots(createInput())).toThrow(
      "ISSUER_LOGO_PATH must be a safe root-relative path",
    );
  });

  it.each(["../../admin", "badges/../../admin", "badges/%2e%2e/admin"])(
    "rejects a badge media key that could escape the stable media route: %s",
    (imagePath) => {
      expect(() =>
        buildCredentialSnapshots(
          createInput({ achievement: { ...createInput().achievement, imagePath } }),
        ),
      ).toThrow("Badge media path must remain under the stable media route");
    },
  );

  it("keeps recipient email private and uses only its hash in the credential", () => {
    const snapshots = buildCredentialSnapshots(createInput());
    const credentialJson = JSON.stringify(snapshots.credential);

    expect(snapshots.recipient.email).toBe(" Juan.DelaCruz@Example.edu ");
    expect(credentialJson).not.toContain("Juan.DelaCruz@Example.edu");
    expect(snapshots.credential.credentialSubject.identifier).toEqual([
      {
        type: "IdentityObject",
        identityHash: "4dc19b33bb93216e5f00f0d9bd4381377e2d9860359bbfb82faf48bacde30524",
        identityType: "email",
        hashed: true,
      },
    ]);
  });

  it("uses the required Open Badges context and credential type literals", () => {
    const credential = buildCredentialSnapshots(createInput()).credential;

    expect(credential["@context"]).toEqual([
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]);
    expect(credential.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
  });

  it("preserves criteria, image, tags, and alignment while omitting absent optional values", () => {
    const snapshots = buildCredentialSnapshots(createInput());
    const achievement = snapshots.credential.credentialSubject.achievement;

    expect(achievement.criteria).toEqual({ narrative: "Complete the secure systems assessment." });
    expect(achievement.image).toEqual({
      id: "https://badges.hau.edu.ph/api/media/badges/secure-systems.png",
      type: "Image",
    });
    expect(achievement.tag).toEqual(["Security", "Linux"]);
    expect(achievement.alignment).toEqual([
      {
        type: ["Alignment"],
        targetName: "NICE Framework",
        targetUrl: "https://niccs.cisa.gov/workforce-development/nice-framework",
      },
    ]);

    const withoutOptionalMetadata = buildCredentialSnapshots(
      createInput({
        achievement: {
          ...createInput().achievement,
          skills: [],
          alignment: undefined,
          expiresAfterDays: null,
        },
        expiresAt: null,
      }),
    );
    const optionalAchievement = withoutOptionalMetadata.credential.credentialSubject.achievement;

    expect(optionalAchievement).not.toHaveProperty("tag");
    expect(optionalAchievement).not.toHaveProperty("alignment");
    expect(withoutOptionalMetadata.credential).not.toHaveProperty("validUntil");
  });

  it("returns isolated snapshots that do not change when input is later mutated", () => {
    const input = createInput();
    const snapshots = buildCredentialSnapshots(input);

    input.recipient.email = "changed@example.edu";
    input.achievement.skills.push("Mutated");
    input.achievement.class.title = "Changed class";
    input.issuedAt.setUTCFullYear(2030);

    expect(snapshots.recipient.email).toBe(" Juan.DelaCruz@Example.edu ");
    expect(snapshots.achievement.skills).toEqual(["Security", "Linux"]);
    expect(snapshots.achievement.class.title).toBe("Secure Systems");
    expect(snapshots.credential.validFrom).toBe("2026-08-12T08:30:15.250Z");
  });
});
