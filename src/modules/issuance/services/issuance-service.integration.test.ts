import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import type { Actor } from "@/modules/identity/types";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import { prisma } from "@/platform/db/prisma";

import { issueBadgeForTest as issueBadge } from "./issuance-service";
import type { SignedIssuanceSigner } from "./signed-issuance-service";

const auditFailureTrigger = "task3_audit_failure";
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://badges.example.test";
const applicationUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const issuerUrl = "https://issuer-one.example.test/";
const verificationMethodUrl = `${issuerUrl}keys/task5-integration-key`;

type Fixture = {
  actor: Actor;
  classId: string;
  badgeTemplateId: string;
  studentId: string;
  userId: string;
  keyId: string;
  listId: string;
};

let fixture: Fixture;

function uniqueId(label: string) {
  return `task3-${label}-${crypto.randomUUID()}`;
}

function createSigner(): SignedIssuanceSigner {
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

async function dropTestTriggers() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${auditFailureTrigger}`);
}

function createIsolatedPrismaClient() {
  const url = new URL(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

function issuanceData(item: Fixture) {
  return {
    publicId: uniqueId("public"),
    classId: item.classId,
    badgeTemplateId: item.badgeTemplateId,
    studentId: item.studentId,
    issuerUserId: item.userId,
    status: "ACTIVE" as const,
    issuedAt: new Date(),
    recipientSnapshotJson: {},
    achievementSnapshotJson: {},
    issuerSnapshotJson: {},
    credentialJson: {},
    snapshotVersion: 1,
  };
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createFixture(): Promise<Fixture> {
  const userId = uniqueId("faculty");
  const classId = uniqueId("class");
  const badgeTemplateId = uniqueId("badge");
  const studentId = uniqueId("student");
  const keyId = uniqueId("key");
  const listId = uniqueId("list");
  const email = `${userId}@example.test`;

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
      courseCode: "T3-401",
      title: "Task Three Integration",
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
      email: `${studentId}@example.test`,
    },
  });
  await prisma.classStudent.create({ data: { classId, studentId, enrollmentStatus: "ACTIVE" } });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: userId,
      name: "Transactional Issuance",
      description: "Proves issuance transaction behavior against MariaDB.",
      criteria: "Issue once with an active class, badge, and enrollment.",
      imagePath: "badges/task-3-integration.png",
      status: "ACTIVE",
      metadataJson: { skills: ["Transactions"] },
    },
  });
  await prisma.systemSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      issuerName: "Integration Issuer One",
      issuerUrl,
      issuerLogoPath: "/images/issuer-one.png",
      sharingEnabled: true,
    },
    update: {
      issuerName: "Integration Issuer One",
      issuerUrl,
      issuerLogoPath: "/images/issuer-one.png",
    },
  });
  await prisma.signingKey.create({
    data: {
      id: keyId,
      verificationMethodUrl,
      controllerUrl: issuerUrl,
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

  return {
    actor: {
      id: userId,
      name: "Stale Session Name",
      email,
      role: "FACULTY",
    },
    classId,
    badgeTemplateId,
    studentId,
    userId,
    keyId,
    listId,
  };
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
  await prisma.student.deleteMany({ where: { id: item.studentId } });
  await prisma.user.deleteMany({ where: { id: item.userId } });
}

beforeEach(async () => {
  await dropTestTriggers();
  fixture = await createFixture();
});

afterEach(async () => {
  await dropTestTriggers();
  await removeFixture(fixture);
  await prisma.systemSetting.deleteMany({ where: { id: "default" } });
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

describe("issueBadge MariaDB transactions", () => {
  it("uses current typed issuer settings only for the new immutable snapshot", async () => {
    await prisma.systemSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        issuerName: "Integration Issuer One",
        issuerUrl: issuerUrl,
        issuerLogoPath: "/images/issuer-one.png",
        supportContact: null,
        sharingEnabled: true,
      },
      update: {
        issuerName: "Integration Issuer One",
        issuerUrl: issuerUrl,
        issuerLogoPath: "/images/issuer-one.png",
      },
    });

    const result = await issueBadge(
      fixture.actor,
      {
        classId: fixture.classId,
        badgeTemplateId: fixture.badgeTemplateId,
        studentId: fixture.studentId,
      },
      createSigner(),
    );
    const beforeChange = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: result.issuanceId },
      select: { issuerSnapshotJson: true, credentialJson: true },
    });

    expect(beforeChange.issuerSnapshotJson).toMatchObject({
      name: "Integration Issuer One",
      url: issuerUrl,
      logoUrl: `${applicationUrl}/images/issuer-one.png`,
    });
    expect(beforeChange.credentialJson).toMatchObject({
      issuer: {
        id: issuerUrl,
        name: "Integration Issuer One",
      },
    });

    await prisma.systemSetting.update({
      where: { id: "default" },
      data: { issuerName: "Integration Issuer Two" },
    });
    await expect(
      prisma.badgeIssuance.findUnique({
        where: { id: result.issuanceId },
        select: { issuerSnapshotJson: true, credentialJson: true },
      }),
    ).resolves.toEqual(beforeChange);
  });

  it("rolls back the persisted issuance when the badge-issued audit insert fails", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${auditFailureTrigger} BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task 3 forced audit failure'`,
    );

    await expect(
      issueBadge(
        fixture.actor,
        {
          classId: fixture.classId,
          badgeTemplateId: fixture.badgeTemplateId,
          studentId: fixture.studentId,
        },
        createSigner(),
      ),
    ).rejects.toThrow();

    await expect(
      prisma.badgeIssuance.count({
        where: {
          classId: fixture.classId,
          badgeTemplateId: fixture.badgeTemplateId,
          studentId: fixture.studentId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.userId, action: "badge.issued" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.credentialStatusAllocation.count({
        where: { statusListId: fixture.listId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("uses a fresh read to observe a row that repeatable-read hides from an earlier transaction", async () => {
    const reader = createIsolatedPrismaClient();
    const writer = createIsolatedPrismaClient();

    try {
      const observed = await reader.$transaction(async (tx) => {
        const beforeCommit = await tx.badgeIssuance.findFirst({
          where: {
            classId: fixture.classId,
            badgeTemplateId: fixture.badgeTemplateId,
            studentId: fixture.studentId,
          },
        });
        expect(beforeCommit).toBeNull();

        const winner = await writer.badgeIssuance.create({ data: issuanceData(fixture) });
        const afterCommitInSameTransaction = await tx.badgeIssuance.findFirst({
          where: {
            classId: fixture.classId,
            badgeTemplateId: fixture.badgeTemplateId,
            studentId: fixture.studentId,
          },
        });

        return { winnerId: winner.id, afterCommitInSameTransaction };
      });

      expect(observed.afterCommitInSameTransaction).toBeNull();
      await expect(
        reader.badgeIssuance.findFirst({
          where: {
            classId: fixture.classId,
            badgeTemplateId: fixture.badgeTemplateId,
            studentId: fixture.studentId,
          },
        }),
      ).resolves.toMatchObject({ id: observed.winnerId });
    } finally {
      await Promise.all([reader.$disconnect(), writer.$disconnect()]);
    }
  });

  it("serializes concurrent signed duplicates to one visible credential", async () => {
    const request = {
      classId: fixture.classId,
      badgeTemplateId: fixture.badgeTemplateId,
      studentId: fixture.studentId,
    };
    const results = await within(
      Promise.all([
        issueBadge(fixture.actor, request, createSigner()),
        issueBadge(fixture.actor, request, createSigner()),
      ]),
      5_000,
    );

    expect(new Set(results.map((result) => result.issuanceId)).size).toBe(1);
    expect(new Set(results.map((result) => result.publicId)).size).toBe(1);
    expect(results.map((result) => result.alreadyIssued).sort()).toEqual([false, true]);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.credentialStatusAllocation.count({
        where: { issuance: { classId: fixture.classId } },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(1);
    await expect(
      prisma.badgeIssuance.findFirst({
        where: {
          classId: fixture.classId,
          badgeTemplateId: fixture.badgeTemplateId,
          studentId: fixture.studentId,
        },
        select: { issuerSnapshotJson: true },
      }),
    ).resolves.toMatchObject({ issuerSnapshotJson: { issuerUserName: "Database Faculty" } });
  });
});
