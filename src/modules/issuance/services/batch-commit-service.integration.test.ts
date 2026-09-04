import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import type { Actor } from "@/modules/identity/types";
import type { BatchPreviewRow } from "@/modules/issuance/batch-types";
import { prisma } from "@/platform/db/prisma";

import {
  BatchSigningError,
  commitBatchPreviewForTest as commitBatchPreview,
} from "./batch-commit-service";
import { BatchUnavailableError } from "./batch-preview-service";
import { createStoredBatchFingerprint, type MappedBatchRow } from "./batch-validation";
import type { SignedIssuanceSigner } from "./signed-issuance-service";

const auditFailureTrigger = "task4_batch_audit_failure";
const testHookKey = Symbol.for("hau-soc-badging.batch-commit-test-hooks");
const previousAppUrl = process.env.APP_URL;
const previousIssuerUrl = process.env.ISSUER_URL;
const applicationUrl = "https://badges.example.test";
const controllerUrl = `${applicationUrl}/api/issuers/hau-soc`;
process.env.APP_URL = applicationUrl;
process.env.ISSUER_URL = controllerUrl;

type FixtureStudent = {
  id: string;
  studentNumber: string;
  email: string;
};

type Fixture = {
  actor: Actor;
  classId: string;
  badgeTemplateId: string;
  keyId: string;
  listId: string;
  students: FixtureStudent[];
  userId: string;
};

type BatchCommitTestHooks = {
  beforeBatchClaim?: () => Promise<void>;
  beforeFinalCommit?: () => Promise<void>;
  beforeCurrentStateLocks?: () => Promise<void>;
  afterTuplePrecheck?: () => Promise<void>;
  afterCurrentStateLocks?: () => Promise<void>;
  onTupleConflictRetry?: () => void;
};

let fixture: Fixture;

function uniqueId(label: string) {
  return `task4-${label}-${crypto.randomUUID()}`;
}

function createSigner(
  item: Fixture,
  issuerControllerUrl = controllerUrl,
): SignedIssuanceSigner & { signedStudentIds: string[] } {
  const signedStudentIds: string[] = [];
  const verificationMethodUrl = `${issuerControllerUrl.replace(/\/$/, "")}/keys/${item.keyId}`;
  return {
    signedStudentIds,
    signCredential: async (document) => {
      const credential = document as { credentialSubject?: { id?: string } };
      signedStudentIds.push(credential.credentialSubject?.id ?? "unknown");
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: verificationMethodUrl,
          created: "2026-08-27T01:02:04.000Z",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      };
    },
    verifyCredential: async () => ({ outcome: "VERIFIED", keyId: verificationMethodUrl }),
  };
}

function commitBatch(batchId: string, signer: SignedIssuanceSigner = createSigner(fixture)) {
  return commitBatchPreview(fixture.actor, batchId, signer);
}

async function dropTestTrigger() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${auditFailureTrigger}`);
}

function installHooks(hooks: BatchCommitTestHooks) {
  (globalThis as typeof globalThis & { [testHookKey]?: BatchCommitTestHooks })[testHookKey] = hooks;
}

function clearHooks() {
  delete (globalThis as typeof globalThis & { [testHookKey]?: BatchCommitTestHooks })[testHookKey];
}

async function within<T>(promise: Promise<T>, milliseconds = 8_000): Promise<T> {
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
  const keyId = uniqueId("key");
  const listId = uniqueId("list");
  const email = `${userId}@example.test`;
  const students = [0, 1].map((index) => ({
    id: uniqueId(`student-${index}`),
    studentNumber: uniqueId(`number-${index}`),
    email: `${uniqueId(`recipient-${index}`)}@example.test`,
  }));

  await prisma.user.create({
    data: {
      id: userId,
      name: "Batch Database Faculty",
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
  for (const [index, student] of students.entries()) {
    await prisma.student.create({
      data: {
        ...student,
        firstName: index === 0 ? "Ready" : "Existing",
        lastName: "Student",
      },
    });
    await prisma.classStudent.create({
      data: { classId, studentId: student.id, enrollmentStatus: "ACTIVE" },
    });
  }
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: userId,
      name: "Atomic Batch Issuance",
      description: "Proves atomic batch behavior against MariaDB.",
      criteria: "Commit a validated stored preview.",
      imagePath: "badges/task-4-integration.png",
      status: "ACTIVE",
      metadataJson: { skills: ["Transactions"] },
    },
  });
  await prisma.signingKey.create({
    data: {
      id: keyId,
      verificationMethodUrl: `${controllerUrl}/keys/${keyId}`,
      controllerUrl,
      algorithm: "Ed25519",
      cryptosuite: "eddsa-rdfc-2022",
      publicMultikey: `z${crypto.randomUUID().replaceAll("-", "")}`,
      fingerprint: uniqueId("fingerprint"),
      status: "ACTIVE",
      activatedAt: new Date("2026-08-27T00:00:00.000Z"),
    },
  });
  await prisma.credentialStatusList.create({
    data: {
      id: listId,
      publicUrl: `${applicationUrl}/api/status-lists/${listId}`,
      purpose: "revocation",
      capacity: 131_072,
      nextIndex: 0,
    },
  });

  return {
    actor: { id: userId, name: "Stale Session Name", email, role: "FACULTY" },
    classId,
    keyId,
    listId,
    badgeTemplateId,
    students,
    userId,
  };
}

function readyRow(student: FixtureStudent, rowNumber = 2): BatchPreviewRow {
  return {
    rowNumber,
    studentNumber: student.studentNumber,
    emailSupplied: student.email,
    disposition: "READY",
    message: "Ready to issue.",
    studentId: student.id,
    issuanceId: null,
    publicId: null,
  };
}

function mappedRows(rows: BatchPreviewRow[]): MappedBatchRow[] {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    studentNumber: row.studentNumber,
    studentNumberKey: row.studentNumber.toLowerCase(),
    emailSupplied: row.emailSupplied,
    invalidReason: row.disposition === "INVALID" ? row.message : null,
  }));
}

async function createBatch(rows: BatchPreviewRow[]) {
  const sourceFilename = `${uniqueId("batch")}.csv`;
  const readyCount = rows.filter((row) => row.disposition === "READY").length;
  const alreadyIssuedCount = rows.filter((row) => row.disposition === "ALREADY_ISSUED").length;
  const invalidCount = rows.length - readyCount - alreadyIssuedCount;
  const storedFingerprint = createStoredBatchFingerprint({
    classId: fixture.classId,
    badgeTemplateId: fixture.badgeTemplateId,
    sourceFilename,
    mapping: { studentNumber: 0, email: 1 },
    mappedRows: mappedRows(rows),
    reviewedRows: rows,
  });
  return prisma.issuanceBatch.create({
    data: {
      classId: fixture.classId,
      badgeTemplateId: fixture.badgeTemplateId,
      facultyUserId: fixture.userId,
      sourceFilename,
      mappingJson: storedFingerprint.mappingJson,
      rowsJson: rows,
      previewFingerprint: storedFingerprint.previewFingerprint,
      totalRows: rows.length,
      readyCount,
      alreadyIssuedCount,
      invalidCount,
      issuedCount: 0,
      status: "READY",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

async function createExistingIssuance(student: FixtureStudent) {
  return prisma.badgeIssuance.create({
    data: {
      publicId: uniqueId("public"),
      classId: fixture.classId,
      badgeTemplateId: fixture.badgeTemplateId,
      studentId: student.id,
      issuerUserId: fixture.userId,
      status: "ACTIVE",
      issuedAt: new Date(),
      recipientSnapshotJson: {},
      achievementSnapshotJson: {},
      issuerSnapshotJson: {},
      credentialJson: {},
      snapshotVersion: 1,
    },
  });
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
  await prisma.issuanceBatch.deleteMany({ where: { classId: item.classId } });
  await prisma.credentialStatusList.deleteMany({ where: { id: item.listId } });
  await prisma.signingKey.deleteMany({ where: { id: item.keyId } });
  await prisma.classStudent.deleteMany({ where: { classId: item.classId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: item.badgeTemplateId } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.student.deleteMany({
    where: { id: { in: item.students.map((student) => student.id) } },
  });
  await prisma.user.deleteMany({ where: { id: item.userId } });
}

beforeEach(async () => {
  clearHooks();
  await dropTestTrigger();
  fixture = await createFixture();
});

afterEach(async () => {
  clearHooks();
  await dropTestTrigger();
  await removeFixture(fixture);
  await prisma.systemSetting.deleteMany({ where: { id: "default" } });
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  if (previousIssuerUrl === undefined) delete process.env.ISSUER_URL;
  else process.env.ISSUER_URL = previousIssuerUrl;
});

describe("commitBatchPreview MariaDB transactions", () => {
  it("uses current typed issuer settings for every newly committed batch snapshot", async () => {
    const issuerUrl = "https://batch-issuer.example.test/";
    await prisma.systemSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        issuerName: "Batch Issuer",
        issuerUrl,
        issuerLogoPath: "/images/batch-issuer.png",
        supportContact: null,
        sharingEnabled: true,
      },
      update: {
        issuerName: "Batch Issuer",
        issuerUrl,
        issuerLogoPath: "/images/batch-issuer.png",
      },
    });
    await prisma.signingKey.update({
      where: { id: fixture.keyId },
      data: {
        controllerUrl: issuerUrl,
        verificationMethodUrl: `${issuerUrl}keys/${fixture.keyId}`,
      },
    });
    const batch = await createBatch([readyRow(fixture.students[0]!)]);

    await commitBatch(batch.id, createSigner(fixture, issuerUrl));
    const issuance = await prisma.badgeIssuance.findFirstOrThrow({
      where: { classId: fixture.classId, studentId: fixture.students[0]!.id },
      select: { issuerSnapshotJson: true, credentialJson: true },
    });

    expect(issuance.issuerSnapshotJson).toMatchObject({
      name: "Batch Issuer",
      url: issuerUrl,
      logoUrl: `${applicationUrl}/images/batch-issuer.png`,
    });
    expect(issuance.credentialJson).toMatchObject({
      issuer: { id: issuerUrl, name: "Batch Issuer" },
    });
  });

  it("commits a mixed batch with exact issuance, individual audit, batch audit, and counts", async () => {
    const existing = await createExistingIssuance(fixture.students[1]!);
    const rows: BatchPreviewRow[] = [
      readyRow(fixture.students[0]!),
      {
        ...readyRow(fixture.students[1]!, 3),
        disposition: "ALREADY_ISSUED",
        message: "Badge already issued.",
        issuanceId: existing.id,
        publicId: existing.publicId,
      },
      {
        rowNumber: 4,
        studentNumber: "",
        emailSupplied: null,
        disposition: "INVALID",
        message: "Student number is required.",
        studentId: null,
        issuanceId: null,
        publicId: null,
      },
    ];
    const batch = await createBatch(rows);

    const signer = createSigner(fixture);
    const result = await commitBatch(batch.id, signer);

    expect(result).toMatchObject({
      issuedCount: 1,
      alreadyIssuedCount: 1,
      invalidCount: 1,
      totalRows: 3,
      alreadyCommitted: false,
    });
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      2,
    );
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(1);
    const signed = await prisma.badgeIssuance.findFirstOrThrow({
      where: { classId: fixture.classId, studentId: fixture.students[0]!.id },
      select: { signedCredentialJson: true, signingKeyId: true, serializerVersion: true },
    });
    expect(signed).toMatchObject({
      signedCredentialJson: { proof: { cryptosuite: "eddsa-rdfc-2022" } },
      signingKeyId: fixture.keyId,
      serializerVersion: 1,
    });
    expect(signer.signedStudentIds).toHaveLength(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.userId, action: "badge.batch_committed" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.issuanceBatch.findUnique({ where: { id: batch.id } }),
    ).resolves.toMatchObject({
      status: "COMMITTED",
      issuedCount: 1,
      alreadyIssuedCount: 1,
      invalidCount: 1,
    });
  });

  it.each(["badge.issued", "badge.batch_committed"])(
    "physically rolls back every batch mutation when %s audit insertion fails",
    async (action) => {
      const batch = await createBatch([
        readyRow(fixture.students[0]!),
        readyRow(fixture.students[1]!, 3),
      ]);
      const failureCondition =
        action === "badge.issued"
          ? `NEW.action = 'badge.issued' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.context_json, '$.studentId')) = '${fixture.students[1]!.id}'`
          : `NEW.action = 'badge.batch_committed'`;
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER ${auditFailureTrigger} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF ${failureCondition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task 4 forced audit failure'; END IF; END`,
      );

      await expect(commitBatch(batch.id)).rejects.toThrow();

      await expect(
        prisma.badgeIssuance.count({ where: { classId: fixture.classId } }),
      ).resolves.toBe(0);
      await expect(prisma.auditLog.count({ where: { actorUserId: fixture.userId } })).resolves.toBe(
        0,
      );
      await expect(
        prisma.issuanceBatch.findUnique({ where: { id: batch.id } }),
      ).resolves.toMatchObject({ status: "READY", issuedCount: 0, committedAt: null });
    },
  );

  it("returns the persisted result on repeat commit without duplicate writes", async () => {
    const batch = await createBatch([readyRow(fixture.students[0]!)]);
    const signer = createSigner(fixture);
    const first = await commitBatch(batch.id, signer);
    const second = await commitBatch(batch.id, signer);

    expect(first.alreadyCommitted).toBe(false);
    expect(second).toEqual({ ...first, alreadyCommitted: true });
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.userId, action: "badge.batch_committed" },
      }),
    ).resolves.toBe(1);
    expect(signer.signedStudentIds).toHaveLength(1);
  });

  it("aborts before the atomic commit when one signer preparation fails", async () => {
    const batch = await createBatch([
      readyRow(fixture.students[0]!),
      readyRow(fixture.students[1]!, 3),
    ]);
    const signer = createSigner(fixture);
    let calls = 0;
    signer.signCredential = async (document) => {
      calls += 1;
      if (calls === 2) throw new Error("PRIVATE_SIGNER_DIAGNOSTIC");
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: `${controllerUrl}/keys/${fixture.keyId}`,
          proofValue: "z3FXQqBNXUtsjQ",
        },
      };
    };

    const error = await commitBatch(batch.id, signer).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BatchSigningError);
    expect((error as Error).message).toBe("Signing unavailable; no credentials were issued.");
    expect((error as Error).message).not.toContain("PRIVATE_SIGNER_DIAGNOSTIC");
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { actorUserId: fixture.userId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.issuanceBatch.findUnique({ where: { id: batch.id } }),
    ).resolves.toMatchObject({ status: "READY", issuedCount: 0, committedAt: null });
    const stored = await prisma.issuanceBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { rowsJson: true },
    });
    expect(JSON.stringify(stored.rowsJson)).not.toContain("PRIVATE_SIGNER_DIAGNOSTIC");
  });

  it("does not sign or enqueue a notification for a duplicate discovered after preview", async () => {
    const student = fixture.students[0]!;
    const batch = await createBatch([readyRow(student)]);
    const existing = await createExistingIssuance(student);
    const signer = createSigner(fixture);

    const result = await commitBatch(batch.id, signer);

    expect(result).toMatchObject({ issuedCount: 0, alreadyIssuedCount: 1 });
    expect(result.rows[0]).toMatchObject({
      disposition: "ALREADY_ISSUED",
      issuanceId: existing.id,
      publicId: existing.publicId,
    });
    expect(signer.signedStudentIds).toHaveLength(0);
    await expect(
      prisma.notificationDelivery.count({ where: { issuanceId: existing.id } }),
    ).resolves.toBe(0);
  });

  it("revalidates the current Faculty account after signing and rolls back the whole batch", async () => {
    const batch = await createBatch([readyRow(fixture.students[0]!)]);
    const signer = createSigner(fixture);
    installHooks({
      beforeFinalCommit: async () => {
        await prisma.user.update({
          where: { id: fixture.userId },
          data: { status: "SUSPENDED" },
        });
      },
    });

    await expect(commitBatch(batch.id, signer)).rejects.toThrow(
      "Issuing Faculty account is no longer active",
    );

    expect(signer.signedStudentIds).toHaveLength(1);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(prisma.auditLog.count({ where: { actorUserId: fixture.userId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("revalidates the active signing key after preparation and returns only the safe batch error", async () => {
    const batch = await createBatch([readyRow(fixture.students[0]!)]);
    const signer = createSigner(fixture);
    installHooks({
      beforeFinalCommit: async () => {
        await prisma.signingKey.update({
          where: { id: fixture.keyId },
          data: { status: "COMPROMISED", compromisedAt: new Date() },
        });
      },
    });

    const error = await commitBatch(batch.id, signer).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BatchUnavailableError);
    expect(error).not.toBeInstanceOf(BatchSigningError);
    expect(signer.signedStudentIds).toHaveLength(1);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(prisma.auditLog.count({ where: { actorUserId: fixture.userId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("aborts a deterministic external write that bypasses the tuple reservation", async () => {
    const student = fixture.students[0]!;
    const batch = await createBatch([readyRow(student)]);
    let injected = false;
    let retries = 0;
    installHooks({
      afterTuplePrecheck: async () => {
        if (injected) return;
        injected = true;
        const raced = await createExistingIssuance(student);
        await prisma.auditLog.create({
          data: {
            actorUserId: fixture.userId,
            action: "badge.issued",
            entityType: "BadgeIssuance",
            entityId: raced.id,
            contextJson: {
              classId: fixture.classId,
              badgeTemplateId: fixture.badgeTemplateId,
              studentId: student.id,
              issuanceId: raced.id,
              publicId: raced.publicId,
            },
          },
        });
      },
      onTupleConflictRetry: () => {
        retries += 1;
      },
    });

    await expect(within(commitBatch(batch.id))).rejects.toBeInstanceOf(BatchUnavailableError);
    expect(retries).toBe(1);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
  });

  it("holds authoritative enrollment state locks through batch finalization", async () => {
    const student = fixture.students[0]!;
    const batch = await createBatch([readyRow(student)]);
    let stateChangeResolved = false;
    let stateChange: Promise<unknown> | undefined;
    installHooks({
      afterCurrentStateLocks: async () => {
        stateChange = prisma.classStudent
          .update({
            where: {
              classId_studentId: { classId: fixture.classId, studentId: student.id },
            },
            data: { enrollmentStatus: "REMOVED" },
          })
          .then((updated) => {
            stateChangeResolved = true;
            return updated;
          });
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(stateChangeResolved).toBe(false);
      },
    });

    await expect(commitBatch(batch.id)).resolves.toMatchObject({
      issuedCount: 1,
    });
    await stateChange;
    expect(stateChangeResolved).toBe(true);
  });

  it("rejects enrollment removal committed after the batch snapshot but before state locking", async () => {
    const student = fixture.students[0]!;
    const batch = await createBatch([readyRow(student)]);
    installHooks({
      beforeCurrentStateLocks: async () => {
        await prisma.classStudent.update({
          where: {
            classId_studentId: { classId: fixture.classId, studentId: student.id },
          },
          data: { enrollmentStatus: "REMOVED" },
        });
      },
    });

    await expect(commitBatch(batch.id)).rejects.toBeInstanceOf(BatchUnavailableError);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
  });

  it("durably claims a batch before signing so a concurrent commit produces no discarded signature", async () => {
    const batch = await createBatch([readyRow(fixture.students[0]!)]);
    const signer = createSigner(fixture);
    let arrivals = 0;
    const waiters: Array<() => void> = [];
    installHooks({
      beforeBatchClaim: () =>
        new Promise<void>((resolve) => {
          arrivals += 1;
          if (arrivals > 2) return resolve();
          waiters.push(resolve);
          if (arrivals === 2) for (const release of waiters.splice(0)) release();
        }),
    });

    const outcomes = await within(
      Promise.allSettled([commitBatch(batch.id, signer), commitBatch(batch.id, signer)]),
    );

    expect(arrivals).toBeGreaterThanOrEqual(2);
    expect(signer.signedStudentIds).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: new BatchUnavailableError() });
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.userId, action: "badge.batch_committed" },
      }),
    ).resolves.toBe(1);
  });

  it("durably reserves every tuple before signing so competing batches produce no discarded signature", async () => {
    const student = fixture.students[0]!;
    const firstBatch = await createBatch([readyRow(student)]);
    const secondBatch = await createBatch([readyRow(student)]);
    const signer = createSigner(fixture);
    let arrivals = 0;
    const waiters: Array<() => void> = [];
    installHooks({
      beforeBatchClaim: () =>
        new Promise<void>((resolve) => {
          arrivals += 1;
          if (arrivals > 2) return resolve();
          waiters.push(resolve);
          if (arrivals === 2) for (const release of waiters.splice(0)) release();
        }),
    });

    const outcomes = await within(
      Promise.allSettled([commitBatch(firstBatch.id, signer), commitBatch(secondBatch.id, signer)]),
    );

    expect(arrivals).toBeGreaterThanOrEqual(2);
    expect(signer.signedStudentIds).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: new BatchUnavailableError() });
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
  });
});
