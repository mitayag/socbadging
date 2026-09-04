import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  issuanceUpdate: vi.fn(),
  lockingQuery: vi.fn(),
  transaction: vi.fn(),
  notificationCreate: vi.fn(),
  systemSettingFindUnique: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import {
  CredentialUnavailableError,
  revokeCredential,
  revokeCredentialForAction,
} from "./revocation-service";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty One",
  email: "faculty@example.edu",
  role: "FACULTY",
};
const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};

const issuance = {
  id: "issuance-1",
  publicId: "abcdefghijklmnopqrstuvwxyzABCDEF",
  classId: "class-1",
  status: "ACTIVE",
  expiresAt: null,
  revocationReason: null,
  revokedAt: null,
  recipientSnapshotJson: {
    studentId: "student-1",
    studentNumber: "2026-00001",
    displayName: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.edu",
  },
  achievementSnapshotJson: {
    badgeTemplateId: "badge-1",
    id: "https://badges.example.edu/achievements/badge-1",
    type: ["Achievement"],
    name: "Secure Systems",
    description: "Achievement description",
    criteria: { narrative: "Complete the assessment" },
    imagePath: "badges/secure.png",
    image: { id: "https://badges.example.edu/images/secure.png", type: "Image" },
    skills: ["Security"],
    templateUpdatedAt: "2026-08-01T00:00:00.000Z",
    class: {
      id: "class-1",
      courseCode: "CS401",
      title: "Secure Systems",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
    },
    expiresAfterDays: null,
  },
  issuerSnapshotJson: {
    name: "HAU SOC",
    url: "https://badges.example.edu",
    logoUrl: "https://badges.example.edu/images/logo.png",
    issuerUserId: "faculty-1",
    issuerUserName: "Faculty One",
  },
  credentialJson: {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: "https://badges.example.edu/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: "Secure Systems",
    issuer: {
      id: "https://badges.example.edu",
      type: ["Profile"],
      name: "HAU SOC",
      image: { id: "https://badges.example.edu/images/logo.png", type: "Image" },
    },
    validFrom: "2026-08-01T00:00:00.000Z",
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
        id: "https://badges.example.edu/achievements/badge-1",
        type: ["Achievement"],
        name: "Secure Systems",
        description: "Achievement description",
        criteria: { narrative: "Complete the assessment" },
        image: { id: "https://badges.example.edu/images/secure.png", type: "Image" },
      },
    },
  },
};

function activeUser(actor: Actor, overrides: Record<string, unknown> = {}) {
  return { id: actor.id, role: actor.role, status: "ACTIVE", deletedAt: null, ...overrides };
}

function ownedClass(overrides: Record<string, unknown> = {}) {
  return { id: issuance.classId, ownerUserId: faculty.id, ...overrides };
}

function createTransactionFixture() {
  const tx = {
    $queryRaw: mocks.lockingQuery,
    auditLog: { create: mocks.auditCreate },
    badgeIssuance: { update: mocks.issuanceUpdate },
    notificationDelivery: { create: mocks.notificationCreate },
    systemSetting: { findUnique: mocks.systemSettingFindUnique },
  };
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
}

function lockingRead(query: { strings?: readonly string[] }) {
  const sql = query.strings?.join(" ") ?? "";
  if (sql.includes("FROM users")) return Promise.resolve([activeUser(faculty)]);
  if (sql.includes("FROM badge_issuances")) return Promise.resolve([issuance]);
  if (sql.includes("FROM classes")) return Promise.resolve([ownedClass()]);
  return Promise.reject(new Error(`Unexpected locking query: ${sql}`));
}

describe("revokeCredential", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createTransactionFixture();
    mocks.lockingQuery.mockImplementation(lockingRead);
    mocks.issuanceUpdate.mockResolvedValue({ id: issuance.id, publicId: issuance.publicId });
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
    mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
    mocks.systemSettingFindUnique.mockResolvedValue({ supportContact: null });
  });

  it.each([
    ["a blank reason", "   "],
    ["an overlong reason", "x".repeat(1001)],
    ["a control-character reason", "Academic\nreview"],
  ])("rejects %s before opening a transaction", async (_caseName, reason) => {
    await expect(revokeCredential(faculty, { issuanceId: issuance.id, reason })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed issuance ID before opening a transaction", async () => {
    await expect(
      revokeCredential(faculty, { issuanceId: "../../private", reason: "Academic review" }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["an anonymous actor", null],
    ["an unsupported actor role", { ...faculty, role: "STUDENT" }],
  ])("denies %s without writes", async (_caseName, actor) => {
    await expect(
      revokeCredential(actor as Actor | null, {
        issuanceId: issuance.id,
        reason: "Academic review",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a suspended actor", activeUser(faculty, { status: "SUSPENDED" })],
    ["a deleted actor", activeUser(faculty, { status: "DELETED", deletedAt: new Date() })],
    ["a role-changed actor", activeUser(faculty, { role: "ADMIN" })],
  ])("fails closed for %s before writes", async (_caseName, currentActor) => {
    mocks.lockingQuery.mockImplementation((query) => {
      const sql = query.strings?.join(" ") ?? "";
      return sql.includes("FROM users") ? Promise.resolve([currentActor]) : lockingRead(query);
    });

    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "Academic review" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("allows an active owning Faculty member and locks current actor, issuance, and class rows", async () => {
    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "  Academic review  " }),
    ).resolves.toEqual({
      issuanceId: issuance.id,
      publicId: issuance.publicId,
      alreadyRevoked: false,
    });

    const sql = mocks.lockingQuery.mock.calls.map(([query]) => query.strings?.join(" "));
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining("FROM users"),
        expect.stringContaining("FROM badge_issuances"),
        expect.stringContaining("FROM classes"),
      ]),
    );
    expect(sql.every((statement) => statement.includes("FOR UPDATE"))).toBe(true);
    expect(mocks.issuanceUpdate).toHaveBeenCalledWith({
      where: { id: issuance.id },
      data: {
        status: "REVOKED",
        revocationReason: "Academic review",
        revokedAt: expect.any(Date),
      },
      select: { id: true, publicId: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: faculty.id,
        action: "badge.revoked",
        entityType: "BadgeIssuance",
        entityId: issuance.id,
        contextJson: {
          issuanceId: issuance.id,
          publicId: issuance.publicId,
          classId: issuance.classId,
          reasonLength: 15,
          reasonCategory: "short",
        },
      },
    });
    expect(JSON.stringify(mocks.issuanceUpdate.mock.calls)).not.toContain("recipientSnapshotJson");
    expect(JSON.stringify(mocks.issuanceUpdate.mock.calls)).not.toContain("credentialJson");
    expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain("Academic review");
  });

  it("returns the authoritative locked class ID only through the server action helper", async () => {
    await expect(
      revokeCredentialForAction(faculty, {
        issuanceId: issuance.id,
        reason: "Academic review",
      }),
    ).resolves.toEqual({
      issuanceId: issuance.id,
      publicId: issuance.publicId,
      classId: issuance.classId,
      alreadyRevoked: false,
    });
  });

  it("allows an active Administrator to revoke a credential outside their classes", async () => {
    mocks.lockingQuery.mockImplementation((query) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return Promise.resolve([activeUser(administrator)]);
      if (sql.includes("FROM classes"))
        return Promise.resolve([ownedClass({ ownerUserId: faculty.id })]);
      return lockingRead(query);
    });

    await expect(
      revokeCredential(administrator, {
        issuanceId: issuance.id,
        reason: "Administrative correction",
      }),
    ).resolves.toMatchObject({ alreadyRevoked: false });
    expect(mocks.issuanceUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a missing issuance", null, ownedClass()],
    ["a non-owned class", issuance, ownedClass({ ownerUserId: "faculty-2" })],
  ])(
    "returns the same safe unavailable failure for %s",
    async (_caseName, lockedIssuance, classRow) => {
      mocks.lockingQuery.mockImplementation((query) => {
        const sql = query.strings?.join(" ") ?? "";
        if (sql.includes("FROM users")) return Promise.resolve([activeUser(faculty)]);
        if (sql.includes("FROM badge_issuances"))
          return Promise.resolve(lockedIssuance ? [lockedIssuance] : []);
        if (sql.includes("FROM classes")) return Promise.resolve([classRow]);
        return lockingRead(query);
      });

      await expect(
        revokeCredential(faculty, { issuanceId: issuance.id, reason: "Academic review" }),
      ).rejects.toBeInstanceOf(CredentialUnavailableError);
      expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("makes an already revoked credential a no-op without changing its original reason or time", async () => {
    mocks.lockingQuery.mockImplementation((query) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM badge_issuances")) {
        return Promise.resolve([
          {
            ...issuance,
            status: "REVOKED",
            revocationReason: "Original reason",
            revokedAt: new Date(),
          },
        ]);
      }
      return lockingRead(query);
    });

    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "Replacement reason" }),
    ).resolves.toEqual({
      issuanceId: issuance.id,
      publicId: issuance.publicId,
      alreadyRevoked: true,
    });
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("permits a persisted expired credential to be revoked", async () => {
    mocks.lockingQuery.mockImplementation((query) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM badge_issuances")) {
        return Promise.resolve([
          { ...issuance, status: "EXPIRED", expiresAt: new Date("2020-01-01") },
        ]);
      }
      return lockingRead(query);
    });

    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "Credential review" }),
    ).resolves.toMatchObject({ alreadyRevoked: false });
  });

  it("permits an active credential whose expiration is already past to be revoked", async () => {
    mocks.lockingQuery.mockImplementation((query) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM badge_issuances")) {
        return Promise.resolve([
          { ...issuance, status: "ACTIVE", expiresAt: new Date("2020-01-01") },
        ]);
      }
      return lockingRead(query);
    });

    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "Credential review" }),
    ).resolves.toMatchObject({ alreadyRevoked: false });
  });

  it("fails closed only for the exact MariaDB snapshot-conflict error", async () => {
    mocks.lockingQuery.mockRejectedValueOnce({
      code: "P2010",
      meta: { code: "1020" },
    });

    await expect(
      revokeCredential(faculty, { issuanceId: issuance.id, reason: "Academic review" }),
    ).rejects.toBeInstanceOf(CredentialUnavailableError);
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
