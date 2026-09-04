import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { prisma } from "@/platform/db/prisma";

import { issueBadgeForTest as issueBadge } from "./issuance-service";
import { CredentialUnavailableError, revokeCredential } from "./revocation-service";
import type { SignedIssuanceSigner } from "./signed-issuance-service";

const auditFailureTrigger = "task4_revocation_audit_failure";
const testHookKey = Symbol.for("hau-soc-badging.revocation-test-hooks");
const controllerUrl = "https://revocation.example.test/";
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://badges.example.test";

type Fixture = {
  actor: Actor;
  classId: string;
  badgeTemplateId: string;
  studentId: string;
  studentEmail: string;
  issuanceId: string;
  keyId: string;
  listId: string;
  publicId: string;
  userId: string;
  replacementUserIds: string[];
};

type RevocationTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeClassLock?: () => Promise<void>;
};

let fixture: Fixture;

function uniqueId(label: string) {
  return `task4-${label}-${crypto.randomUUID()}`;
}

function createSigner(verificationMethodUrl: string): SignedIssuanceSigner {
  return {
    signCredential: async (document) =>
      ({
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: verificationMethodUrl,
          proofValue: "z3FXQqBNXUtsjQ",
        },
      }) as SignedOpenBadgeCredential,
    verifyCredential: async () => ({ outcome: "VERIFIED", keyId: verificationMethodUrl }),
  };
}

function installHooks(hooks: RevocationTestHooks) {
  (globalThis as typeof globalThis & { [testHookKey]?: RevocationTestHooks })[testHookKey] = hooks;
}

function clearHooks() {
  delete (globalThis as typeof globalThis & { [testHookKey]?: RevocationTestHooks })[testHookKey];
}

async function dropTestTriggers() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${auditFailureTrigger}`);
}

async function createFixture(): Promise<Fixture> {
  const userId = uniqueId("faculty");
  const classId = uniqueId("class");
  const badgeTemplateId = uniqueId("badge");
  const studentId = uniqueId("student");
  const studentEmail = `${studentId}@example.test`;
  const keyId = uniqueId("key");
  const listId = uniqueId("list");
  const verificationMethodUrl = `${controllerUrl}keys/${keyId}`;
  const email = `${userId}@example.test`;
  const actor: Actor = { id: userId, name: "Database Faculty", email, role: "FACULTY" };

  await prisma.user.create({
    data: {
      id: userId,
      name: "Database Faculty",
      email,
      normalizedEmail: email,
      passwordHash: "not-used-by-integration-test",
      role: "FACULTY",
      status: "ACTIVE",
    },
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: userId,
      courseCode: "T4-401",
      title: "Task Four Integration",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: uniqueId("student-number"),
      firstName: "Integration",
      lastName: "Student",
      email: studentEmail,
    },
  });
  await prisma.classStudent.create({ data: { classId, studentId, enrollmentStatus: "ACTIVE" } });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: userId,
      name: "Transactional Revocation",
      description: "Proves revocation transaction behavior against MariaDB.",
      criteria: "Revoke once with an active authorized actor.",
      imagePath: "badges/task-4-integration.png",
      status: "ACTIVE",
    },
  });
  await prisma.systemSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      issuerName: "Revocation Integration Issuer",
      issuerUrl: controllerUrl,
      issuerLogoPath: "/images/hausoclogo.png",
      sharingEnabled: true,
    },
    update: {
      issuerName: "Revocation Integration Issuer",
      issuerUrl: controllerUrl,
      issuerLogoPath: "/images/hausoclogo.png",
    },
  });
  await prisma.signingKey.create({
    data: {
      id: keyId,
      verificationMethodUrl,
      controllerUrl,
      algorithm: "Ed25519",
      cryptosuite: "eddsa-rdfc-2022",
      publicMultikey: `z${crypto.randomUUID().replaceAll("-", "")}`,
      fingerprint: uniqueId("fingerprint"),
      status: "ACTIVE",
      activatedAt: new Date("2026-08-25T00:00:00.000Z"),
    },
  });
  await prisma.credentialStatusList.create({
    data: {
      id: listId,
      publicUrl: `https://badges.example.test/api/status-lists/${listId}`,
      purpose: "revocation",
      capacity: 131_072,
    },
  });
  const issued = await issueBadge(
    actor,
    { classId, badgeTemplateId, studentId },
    createSigner(verificationMethodUrl),
  );
  return {
    actor,
    classId,
    badgeTemplateId,
    studentId,
    studentEmail,
    issuanceId: issued.issuanceId,
    keyId,
    listId,
    publicId: issued.publicId,
    userId,
    replacementUserIds: [],
  };
}

async function createFixtureManagedReplacementFaculty() {
  const id = uniqueId("replacement-owner");
  const email = `${id}@example.test`;
  await prisma.user.create({
    data: {
      id,
      name: "Replacement Faculty",
      email,
      normalizedEmail: email,
      passwordHash: "not-used-by-integration-test",
      role: "FACULTY",
      status: "ACTIVE",
    },
  });
  fixture.replacementUserIds.push(id);
  return { id, email };
}

async function removeFixture(item: Fixture) {
  await prisma.auditLog.deleteMany({ where: { actorUserId: item.userId } });
  await prisma.notificationDelivery.deleteMany({ where: { issuance: { classId: item.classId } } });
  await prisma.badgeIssuance.updateMany({
    where: { classId: item.classId },
    data: { signedCredentialJson: Prisma.DbNull, signingKeyId: null, serializerVersion: null },
  });
  await prisma.credentialStatusAllocation.deleteMany({
    where: { issuance: { classId: item.classId } },
  });
  await prisma.badgeIssuance.deleteMany({ where: { classId: item.classId } });
  await prisma.credentialStatusList.deleteMany({ where: { id: item.listId } });
  await prisma.signingKey.deleteMany({ where: { id: item.keyId } });
  await prisma.classStudent.deleteMany({ where: { classId: item.classId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: item.badgeTemplateId } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.student.deleteMany({ where: { id: item.studentId, email: item.studentEmail } });
  await prisma.user.deleteMany({
    where: { id: { in: [item.userId, ...item.replacementUserIds] } },
  });
  await prisma.systemSetting.deleteMany({ where: { id: "default" } });
}

beforeEach(async () => {
  clearHooks();
  await dropTestTriggers();
  fixture = await createFixture();
});

afterEach(async () => {
  clearHooks();
  await dropTestTriggers();
  await removeFixture(fixture);
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

describe("revokeCredential MariaDB transactions", () => {
  it("atomically writes only lifecycle fields and one privacy-safe badge.revoked audit", async () => {
    const before = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: fixture.issuanceId },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).resolves.toEqual({
      issuanceId: fixture.issuanceId,
      publicId: fixture.publicId,
      alreadyRevoked: false,
    });

    const [after, audits] = await Promise.all([
      prisma.badgeIssuance.findUniqueOrThrow({ where: { id: fixture.issuanceId } }),
      prisma.auditLog.findMany({
        where: { actorUserId: fixture.userId, action: "badge.revoked" },
        select: { contextJson: true },
      }),
    ]);
    expect(after).toMatchObject({ status: "REVOKED", revocationReason: "Academic review" });
    expect(after.revokedAt).toBeInstanceOf(Date);
    expect(after.recipientSnapshotJson).toEqual(before.recipientSnapshotJson);
    expect(after.achievementSnapshotJson).toEqual(before.achievementSnapshotJson);
    expect(after.issuerSnapshotJson).toEqual(before.issuerSnapshotJson);
    expect(after.credentialJson).toEqual(before.credentialJson);
    expect(after.signedCredentialJson).toEqual(before.signedCredentialJson);
    expect(after.signingKeyId).toBe(before.signingKeyId);
    expect(after.serializerVersion).toBe(before.serializerVersion);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.contextJson).toEqual({
      issuanceId: fixture.issuanceId,
      publicId: fixture.publicId,
      classId: fixture.classId,
      reasonLength: 15,
      reasonCategory: "short",
    });
  });

  it("rolls back status and lifecycle fields when the audit insert fails", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${auditFailureTrigger} BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task 4 forced audit failure'`,
    );

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).rejects.toThrow();
    await expect(
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.issuanceId },
        select: { status: true, revocationReason: true, revokedAt: true },
      }),
    ).resolves.toEqual({ status: "ACTIVE", revocationReason: null, revokedAt: null });
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(0);
  });

  it("serializes repeated concurrent revocations to one update and one audit", async () => {
    const results = await Promise.all([
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ]);
    expect(results.map((result) => result.alreadyRevoked).sort()).toEqual([false, true]);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(1);
  });

  it("preserves the original reason and timestamp when a repeated request supplies a different reason", async () => {
    await revokeCredential(fixture.actor, {
      issuanceId: fixture.issuanceId,
      reason: "Academic review",
    });
    const initial = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: fixture.issuanceId },
      select: { revocationReason: true, revokedAt: true },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Replacement explanation that must not overwrite history",
      }),
    ).resolves.toMatchObject({ alreadyRevoked: true });
    await expect(
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.issuanceId },
        select: { revocationReason: true, revokedAt: true },
      }),
    ).resolves.toEqual(initial);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(1);
  });

  it("fails closed when a suspension commits before the authoritative actor lock", async () => {
    installHooks({
      beforeActorLock: async () => {
        await prisma.user.update({ where: { id: fixture.userId }, data: { status: "SUSPENDED" } });
      },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).rejects.toThrow("account is no longer active");
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(0);
  });

  it("fails closed when the actor role changes before the authoritative actor lock", async () => {
    installHooks({
      beforeActorLock: async () => {
        await prisma.user.update({ where: { id: fixture.userId }, data: { role: "ADMIN" } });
      },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).rejects.toThrow("account is no longer active");
    await expect(
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.issuanceId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "ACTIVE" });
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(0);
  });

  it("maps a real MariaDB snapshot-conflict lock failure to the safe unavailable result", async () => {
    installHooks({
      beforeActorLock: async (tx) => {
        await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id
          FROM users
          WHERE id = ${fixture.userId}
        `);
        await prisma.user.update({
          where: { id: fixture.userId },
          data: { name: "Concurrent state change" },
        });
      },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).rejects.toBeInstanceOf(CredentialUnavailableError);
    await expect(
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.issuanceId },
        select: { status: true, revocationReason: true, revokedAt: true },
      }),
    ).resolves.toEqual({ status: "ACTIVE", revocationReason: null, revokedAt: null });
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(0);
  });

  it("fails closed when ownership changes before the authoritative class lock", async () => {
    const replacement = await createFixtureManagedReplacementFaculty();
    expect(fixture.replacementUserIds).toEqual([replacement.id]);
    installHooks({
      beforeClassLock: async () => {
        await prisma.class.update({
          where: { id: fixture.classId },
          data: { ownerUserId: replacement.id },
        });
      },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Academic review",
      }),
    ).rejects.toBeInstanceOf(CredentialUnavailableError);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.revoked" } }),
    ).resolves.toBe(0);
  });

  it("immediately projects the persisted revoked state on the public service", async () => {
    await revokeCredential(fixture.actor, {
      issuanceId: fixture.issuanceId,
      reason: "Academic review",
    });
    await expect(getPublicCredential(fixture.publicId)).resolves.toMatchObject({
      publicId: fixture.publicId,
      status: "REVOKED",
      revocationReason: "Academic review",
    });
  });

  it("revokes an ACTIVE credential whose expiresAt is already in the past", async () => {
    await prisma.badgeIssuance.update({
      where: { id: fixture.issuanceId },
      data: { status: "ACTIVE", expiresAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    await expect(
      revokeCredential(fixture.actor, {
        issuanceId: fixture.issuanceId,
        reason: "Expired credential review",
      }),
    ).resolves.toMatchObject({ alreadyRevoked: false });
    await expect(
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.issuanceId },
        select: { status: true, revocationReason: true },
      }),
    ).resolves.toEqual({ status: "REVOKED", revocationReason: "Expired credential review" });
  });
});
