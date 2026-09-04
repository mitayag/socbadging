import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getStatusList } from "@/app/api/status-lists/[listId]/route";
import type { Actor } from "@/modules/identity/types";
import type { SignedStatusListCredential } from "@/modules/open-badges/credential-schema";
import { readRevocationStatus } from "@/modules/open-badges/status-list";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import type { StatusListSigner } from "@/modules/verification/services/status-list-service";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { prisma } from "@/platform/db/prisma";

import { issueBadgeForTest as issueBadge } from "./issuance-service";
import { CredentialUnavailableError, revokeCredentialForTest } from "./revocation-service";
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
  additionalStudentIds: string[];
  additionalClassIds: string[];
  additionalBadgeTemplateIds: string[];
};

type RevocationTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeClassLock?: () => Promise<void>;
  beforeStatusListLock?: () => Promise<void>;
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

function createStatusListSigner(verificationMethodUrl: string): StatusListSigner {
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
  };
}

function twoPartyBarrier() {
  let arrivals = 0;
  let release!: () => void;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothArrived;
    },
    arrivals: () => arrivals,
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
    additionalStudentIds: [],
    additionalClassIds: [],
    additionalBadgeTemplateIds: [],
  };
}

function revokeCredential(actor: Actor, input: { issuanceId: string; reason: string }) {
  return revokeCredentialForTest(
    actor,
    input,
    createStatusListSigner(`${controllerUrl}keys/${fixture.keyId}`),
  );
}

async function issueSecondCredential(): Promise<{ issuanceId: string; publicId: string }> {
  const studentId = uniqueId("second-student");
  const email = `${studentId}@example.test`;
  fixture.additionalStudentIds.push(studentId);
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: uniqueId("second-student-number"),
      firstName: "Second",
      lastName: "Student",
      email,
    },
  });
  await prisma.classStudent.create({
    data: { classId: fixture.classId, studentId, enrollmentStatus: "ACTIVE" },
  });
  return issueBadge(
    fixture.actor,
    { classId: fixture.classId, badgeTemplateId: fixture.badgeTemplateId, studentId },
    createSigner(`${controllerUrl}keys/${fixture.keyId}`),
  );
}

async function issueIndependentCredential(): Promise<{
  actor: Actor;
  issuanceId: string;
  publicId: string;
}> {
  const userId = uniqueId("independent-faculty");
  const classId = uniqueId("independent-class");
  const badgeTemplateId = uniqueId("independent-badge");
  const studentId = uniqueId("independent-student");
  const email = `${userId}@example.test`;
  const actor: Actor = { id: userId, name: "Independent Faculty", email, role: "FACULTY" };
  fixture.replacementUserIds.push(userId);
  fixture.additionalStudentIds.push(studentId);
  fixture.additionalClassIds.push(classId);
  fixture.additionalBadgeTemplateIds.push(badgeTemplateId);
  await prisma.user.create({
    data: {
      id: userId,
      name: actor.name,
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
      courseCode: "T7-402",
      title: "Independent Revocation",
      section: "B",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: uniqueId("independent-student-number"),
      firstName: "Independent",
      lastName: "Student",
      email: `${studentId}@example.test`,
    },
  });
  await prisma.classStudent.create({ data: { classId, studentId, enrollmentStatus: "ACTIVE" } });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: userId,
      name: "Independent Revocation Badge",
      description: "Shares the revocation status list with another class.",
      criteria: "Independent concurrent revocation test.",
      imagePath: "badges/task-7-independent.png",
      status: "ACTIVE",
    },
  });
  const issued = await issueBadge(
    actor,
    { classId, badgeTemplateId, studentId },
    createSigner(`${controllerUrl}keys/${fixture.keyId}`),
  );
  return { actor, ...issued };
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
  const classIds = [item.classId, ...item.additionalClassIds];
  const templateIds = [item.badgeTemplateId, ...item.additionalBadgeTemplateIds];
  const userIds = [item.userId, ...item.replacementUserIds];
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.notificationDelivery.deleteMany({
    where: { issuance: { classId: { in: classIds } } },
  });
  await prisma.badgeIssuance.updateMany({
    where: { classId: { in: classIds } },
    data: { signedCredentialJson: Prisma.DbNull, signingKeyId: null, serializerVersion: null },
  });
  await prisma.credentialStatusAllocation.deleteMany({
    where: { issuance: { classId: { in: classIds } } },
  });
  await prisma.badgeIssuance.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.credentialStatusList.deleteMany({ where: { id: item.listId } });
  await prisma.signingKey.deleteMany({ where: { id: item.keyId } });
  await prisma.classStudent.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.badgeTemplate.deleteMany({ where: { id: { in: templateIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.student.deleteMany({
    where: { id: { in: [item.studentId, ...item.additionalStudentIds] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
  it("atomically publishes the revoked bit, signed list, notification, and identifier-only audit", async () => {
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

    const [after, audits, allocation, statusList, notification] = await Promise.all([
      prisma.badgeIssuance.findUniqueOrThrow({ where: { id: fixture.issuanceId } }),
      prisma.auditLog.findMany({
        where: { actorUserId: fixture.userId, action: "badge.revoked" },
        select: { contextJson: true },
      }),
      prisma.credentialStatusAllocation.findUniqueOrThrow({
        where: { issuanceId: fixture.issuanceId },
      }),
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
      prisma.notificationDelivery.findMany({
        where: { issuanceId: fixture.issuanceId, type: "BADGE_REVOKED" },
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
    expect(allocation).toMatchObject({ isRevoked: true });
    expect(statusList.signedCredentialJson).not.toBeNull();
    expect(statusList.version).toBe(1);
    expect(notification).toHaveLength(1);
    expect(notification[0]).toMatchObject({ type: "BADGE_REVOKED", status: "PENDING" });
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

  it("leaves the signed list and notification unchanged on a repeated revocation", async () => {
    let signerCalls = 0;
    const signer: StatusListSigner = {
      signCredential: async (document) => {
        signerCalls += 1;
        return createStatusListSigner(`${controllerUrl}keys/${fixture.keyId}`).signCredential(
          document,
          crypto.randomUUID(),
        );
      },
    };
    const input = { issuanceId: fixture.issuanceId, reason: "Academic review" };

    await revokeCredentialForTest(fixture.actor, input, signer);
    const afterFirst = await prisma.credentialStatusList.findUniqueOrThrow({
      where: { id: fixture.listId },
      select: { version: true },
    });
    await expect(revokeCredentialForTest(fixture.actor, input, signer)).resolves.toMatchObject({
      alreadyRevoked: true,
    });

    await expect(
      prisma.credentialStatusList.findUniqueOrThrow({
        where: { id: fixture.listId },
        select: { version: true },
      }),
    ).resolves.toEqual(afterFirst);
    expect(signerCalls).toBe(1);
    await expect(
      prisma.notificationDelivery.count({
        where: { issuanceId: fixture.issuanceId, type: "BADGE_REVOKED" },
      }),
    ).resolves.toBe(1);
  });

  it("serves the signed list after a new active issuance uses its implicit zero bit", async () => {
    await revokeCredential(fixture.actor, {
      issuanceId: fixture.issuanceId,
      reason: "Academic review",
    });
    const second = await issueSecondCredential();
    const [allocations, response] = await Promise.all([
      prisma.credentialStatusAllocation.findMany({
        where: { issuanceId: { in: [fixture.issuanceId, second.issuanceId] } },
        orderBy: { index: "asc" },
      }),
      getStatusList(new Request(`https://badges.example.test/api/status-lists/${fixture.listId}`), {
        params: Promise.resolve({ listId: fixture.listId }),
      }),
    ]);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toMatchObject({ isRevoked: true, statusListVersion: 1 });
    expect(allocations[1]).toMatchObject({ isRevoked: false, statusListVersion: 0 });
    expect(response.status).toBe(200);
    const signed = (await response.json()) as SignedStatusListCredential;
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[0]!.index)).toBe(
      true,
    );
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[1]!.index)).toBe(
      false,
    );
  });

  it("preserves both revoked bits when concurrent revocations use different indexes in one list", async () => {
    const second = await issueSecondCredential();

    await expect(
      Promise.all([
        revokeCredential(fixture.actor, {
          issuanceId: fixture.issuanceId,
          reason: "Academic review",
        }),
        revokeCredential(fixture.actor, {
          issuanceId: second.issuanceId,
          reason: "Academic review",
        }),
      ]),
    ).resolves.toHaveLength(2);

    const [allocations, statusList] = await Promise.all([
      prisma.credentialStatusAllocation.findMany({
        where: { issuanceId: { in: [fixture.issuanceId, second.issuanceId] } },
        orderBy: { index: "asc" },
      }),
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ]);
    expect(allocations.map((allocation) => allocation.isRevoked)).toEqual([true, true]);
    const signed = statusList.signedCredentialJson as SignedStatusListCredential;
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[0]!.index)).toBe(
      true,
    );
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[1]!.index)).toBe(
      true,
    );
  });

  it("serializes independent owners and classes at their shared status-list parent lock", async () => {
    const independent = await issueIndependentCredential();
    const barrier = twoPartyBarrier();
    installHooks({ beforeStatusListLock: barrier.wait });

    await expect(
      Promise.all([
        revokeCredential(fixture.actor, {
          issuanceId: fixture.issuanceId,
          reason: "Academic review",
        }),
        revokeCredential(independent.actor, {
          issuanceId: independent.issuanceId,
          reason: "Academic review",
        }),
      ]),
    ).resolves.toHaveLength(2);
    expect(barrier.arrivals()).toBeGreaterThanOrEqual(2);

    const [allocations, statusList] = await Promise.all([
      prisma.credentialStatusAllocation.findMany({
        where: { issuanceId: { in: [fixture.issuanceId, independent.issuanceId] } },
        orderBy: { index: "asc" },
      }),
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ]);
    expect(allocations).toHaveLength(2);
    expect(allocations.map((allocation) => allocation.isRevoked)).toEqual([true, true]);
    const signed = statusList.signedCredentialJson as SignedStatusListCredential;
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[0]!.index)).toBe(
      true,
    );
    expect(readRevocationStatus(signed.credentialSubject.encodedList, allocations[1]!.index)).toBe(
      true,
    );
  });

  it("rolls back the issuance, audit, notification, allocation, and list when signing fails", async () => {
    const failingSigner: StatusListSigner = {
      signCredential: async () => {
        throw new Error("signer unavailable");
      },
    };

    await expect(
      revokeCredentialForTest(
        fixture.actor,
        { issuanceId: fixture.issuanceId, reason: "Academic review" },
        failingSigner,
      ),
    ).rejects.toThrow("signer unavailable");

    const [issuance, allocation, statusList, audits, notifications] = await Promise.all([
      prisma.badgeIssuance.findUniqueOrThrow({ where: { id: fixture.issuanceId } }),
      prisma.credentialStatusAllocation.findUniqueOrThrow({
        where: { issuanceId: fixture.issuanceId },
      }),
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
      prisma.auditLog.count({ where: { entityId: fixture.issuanceId, action: "badge.revoked" } }),
      prisma.notificationDelivery.count({
        where: { issuanceId: fixture.issuanceId, type: "BADGE_REVOKED" },
      }),
    ]);
    expect(issuance).toMatchObject({ status: "ACTIVE", revocationReason: null, revokedAt: null });
    expect(allocation).toMatchObject({ isRevoked: false, revokedAt: null });
    expect(statusList).toMatchObject({ signedCredentialJson: null, version: 0, digest: null });
    expect(audits).toBe(0);
    expect(notifications).toBe(0);
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
