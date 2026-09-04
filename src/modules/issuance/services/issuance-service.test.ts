import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  buildCredentialSnapshots: vi.fn(),
  calculateExpiresAt: vi.fn(),
  generatePublicId: vi.fn(),
  issuanceCreate: vi.fn(),
  issueSignedBadge: vi.fn(),
  notificationCreate: vi.fn(),
  systemSettingFindUnique: vi.fn(),
}));

vi.mock("./credential-snapshot", () => ({
  buildCredentialSnapshots: mocks.buildCredentialSnapshots,
  calculateExpiresAt: mocks.calculateExpiresAt,
  generatePublicId: mocks.generatePublicId,
}));

vi.mock("./signed-issuance-service", () => ({
  issueSignedBadge: mocks.issueSignedBadge,
  issueSignedBadgeForTest: mocks.issueSignedBadge,
}));

import {
  createBadgeIssuanceInTransaction,
  getIssuerPresentationForTransaction,
  issueBadge,
} from "./issuance-service";

const faculty: Actor = {
  id: "faculty-1",
  name: "Prof. Reyes",
  email: "reyes@hau.edu.ph",
  role: "FACULTY",
};
const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@hau.edu.ph",
  role: "ADMIN",
};
const request = { classId: "class-1", badgeTemplateId: "badge-1", studentId: "student-1" };
const classRecord = {
  id: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE" as const,
  courseCode: "CS 401",
  title: "Secure Systems",
  section: "A",
  term: "First Semester",
  academicYear: "2026-2027",
};
const badgeTemplate = {
  id: "badge-1",
  classId: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE" as const,
  name: "Secure Systems Foundations",
  description: "Recognizes secure systems fundamentals.",
  criteria: "Complete the secure systems assessment.",
  imagePath: "badges/secure-systems.png",
  metadataJson: {
    skills: ["Security", "Linux"],
    alignment: { name: "NICE Framework", url: "https://niccs.cisa.gov/nice-framework" },
  },
  expiresAfterDays: 30,
  updatedAt: new Date("2026-08-10T12:00:00.000Z"),
};
const student = {
  id: "student-1",
  studentNumber: "2026-00001",
  firstName: "Juan",
  lastName: "Dela Cruz",
  email: "juan@example.edu",
};
const enrollment = {
  classId: "class-1",
  studentId: "student-1",
  enrollmentStatus: "ACTIVE" as const,
};
const issuer = {
  id: "faculty-1",
  name: "Database Faculty",
  role: "FACULTY" as const,
  status: "ACTIVE" as const,
};
const issuedAt = new Date("2026-08-12T08:30:15.250Z");

function p2002(target: string[] | string) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target },
  });
}

function createTransactionClient() {
  return {
    auditLog: { create: mocks.auditCreate },
    badgeIssuance: { create: mocks.issuanceCreate },
    notificationDelivery: { create: mocks.notificationCreate },
    systemSetting: { findUnique: mocks.systemSettingFindUnique },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.issueSignedBadge.mockResolvedValue({
    issuanceId: "signed-issuance-1",
    publicId: "signed-public-id-1",
    alreadyIssued: false,
  });
  mocks.generatePublicId.mockReturnValue("public-id-1");
  mocks.calculateExpiresAt.mockReturnValue(new Date("2026-09-11T08:30:15.250Z"));
  mocks.buildCredentialSnapshots.mockReturnValue({
    recipient: { ...student, studentId: student.id, displayName: "Juan Dela Cruz" },
    achievement: { ...badgeTemplate, badgeTemplateId: badgeTemplate.id },
    issuer: { name: "Database Faculty", issuerUserId: issuer.id },
    credential: { id: "https://badges.example.test/credentials/public-id-1" },
  });
  mocks.issuanceCreate.mockResolvedValue({ id: "issuance-1", publicId: "public-id-1" });
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
  mocks.systemSettingFindUnique.mockResolvedValue({
    issuerName: "Database-configured HAU",
    issuerUrl: "https://issuer.example.test",
    issuerLogoPath: "/images/database-issuer.png",
    supportContact: null,
    sharingEnabled: true,
  });
});

describe("issueBadge signed boundary", () => {
  it("delegates validated Faculty issuance to the required signed orchestration", async () => {
    await expect(issueBadge(faculty, request)).resolves.toEqual({
      issuanceId: "signed-issuance-1",
      publicId: "signed-public-id-1",
      alreadyIssued: false,
    });
    expect(mocks.issueSignedBadge).toHaveBeenCalledWith(faculty, request);
  });

  it("normalizes validated identifiers before delegation", async () => {
    await issueBadge(faculty, {
      classId: " class-1 ",
      badgeTemplateId: " badge-1 ",
      studentId: " student-1 ",
    });

    expect(mocks.issueSignedBadge).toHaveBeenCalledWith(faculty, request);
  });

  it("rejects an Administrator before the signed mutation boundary", async () => {
    await expect(issueBadge(administrator, request)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.issueSignedBadge).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before the signed mutation boundary", async () => {
    await expect(issueBadge(faculty, { ...request, studentId: " " })).rejects.toThrow();
    expect(mocks.issueSignedBadge).not.toHaveBeenCalled();
  });

  it("ignores runtime signer injection at the production issuance boundary", async () => {
    const signer = {
      signCredential: vi.fn(),
      verifyCredential: vi.fn(),
    };

    await (
      issueBadge as unknown as (
        actor: Actor,
        input: typeof request,
        injectedSigner: typeof signer,
      ) => Promise<unknown>
    )(faculty, request, signer);

    expect(mocks.issueSignedBadge).toHaveBeenCalledWith(faculty, request);
  });

  it("preserves safe signed-issuance failures", async () => {
    const failure = Object.assign(new Error("safe signing failure"), { retryable: true });
    mocks.issueSignedBadge.mockRejectedValueOnce(failure);

    await expect(issueBadge(faculty, request)).rejects.toBe(failure);
  });
});

describe("createBadgeIssuanceInTransaction legacy batch primitive", () => {
  it("preserves immutable source snapshots, identifier-only audit, and notification", async () => {
    const tx = createTransactionClient();

    await expect(
      createBadgeIssuanceInTransaction({
        tx: tx as never,
        classRecord,
        badgeTemplate,
        student,
        enrollment,
        issuer,
        issuerPresentation: {
          issuerName: "Database-configured HAU",
          issuerUrl: "https://issuer.example.test",
          issuerLogoPath: "/images/database-issuer.png",
        },
        issuedAt,
      }),
    ).resolves.toEqual({ issuanceId: "issuance-1", publicId: "public-id-1" });

    expect(mocks.buildCredentialSnapshots).toHaveBeenCalledWith({
      publicId: "public-id-1",
      issuedAt,
      expiresAt: new Date("2026-09-11T08:30:15.250Z"),
      recipient: {
        studentId: "student-1",
        studentNumber: "2026-00001",
        displayName: "Juan Dela Cruz",
        firstName: "Juan",
        lastName: "Dela Cruz",
        email: "juan@example.edu",
      },
      achievement: {
        badgeTemplateId: "badge-1",
        name: "Secure Systems Foundations",
        description: "Recognizes secure systems fundamentals.",
        criteria: "Complete the secure systems assessment.",
        imagePath: "badges/secure-systems.png",
        skills: ["Security", "Linux"],
        alignment: [
          { targetName: "NICE Framework", targetUrl: "https://niccs.cisa.gov/nice-framework" },
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
      issuer: { issuerUserId: "faculty-1", issuerUserName: "Database Faculty" },
      issuerPresentation: {
        issuerName: "Database-configured HAU",
        issuerUrl: "https://issuer.example.test",
        issuerLogoPath: "/images/database-issuer.png",
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "faculty-1",
        action: "badge.issued",
        entityType: "BadgeIssuance",
        entityId: "issuance-1",
        contextJson: {
          classId: "class-1",
          badgeTemplateId: "badge-1",
          studentId: "student-1",
          issuanceId: "issuance-1",
          publicId: "public-id-1",
        },
      },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
  });

  it("retries only public-ID collisions before creating side effects", async () => {
    mocks.generatePublicId.mockReturnValueOnce("collision-id").mockReturnValueOnce("fresh-id");
    mocks.issuanceCreate
      .mockRejectedValueOnce(p2002(["public_id"]))
      .mockResolvedValueOnce({ id: "issuance-2", publicId: "fresh-id" });

    await expect(
      createBadgeIssuanceInTransaction({
        tx: createTransactionClient() as never,
        classRecord,
        badgeTemplate,
        student,
        enrollment,
        issuer,
        issuedAt,
      }),
    ).resolves.toEqual({ issuanceId: "issuance-2", publicId: "fresh-id" });

    expect(mocks.generatePublicId).toHaveBeenCalledTimes(2);
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
  });

  it("does not retry an unrelated unique conflict", async () => {
    mocks.issuanceCreate.mockRejectedValueOnce(p2002(["unrelated_field"]));

    await expect(
      createBadgeIssuanceInTransaction({
        tx: createTransactionClient() as never,
        classRecord,
        badgeTemplate,
        student,
        enrollment,
        issuer,
        issuedAt,
      }),
    ).rejects.toThrow("Unique constraint failed");

    expect(mocks.issuanceCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("does not enqueue a notification when the required audit write fails", async () => {
    mocks.auditCreate.mockRejectedValueOnce(new Error("audit failed"));

    await expect(
      createBadgeIssuanceInTransaction({
        tx: createTransactionClient() as never,
        classRecord,
        badgeTemplate,
        student,
        enrollment,
        issuer,
        issuedAt,
      }),
    ).rejects.toThrow("audit failed");

    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });
});

describe("getIssuerPresentationForTransaction", () => {
  it("reads only the typed issuer-setting fields", async () => {
    await expect(
      getIssuerPresentationForTransaction(createTransactionClient() as never),
    ).resolves.toEqual({
      issuerName: "Database-configured HAU",
      issuerUrl: "https://issuer.example.test",
      issuerLogoPath: "/images/database-issuer.png",
    });
    expect(mocks.systemSettingFindUnique).toHaveBeenCalledWith({
      where: { id: "default" },
      select: {
        issuerName: true,
        issuerUrl: true,
        issuerLogoPath: true,
        supportContact: true,
        sharingEnabled: true,
      },
    });
  });
});
