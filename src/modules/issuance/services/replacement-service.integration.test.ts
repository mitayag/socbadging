import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { buildOpenBadgeCredential } from "@/modules/open-badges/credential-builder";
import { prisma } from "@/platform/db/prisma";

const signerState = vi.hoisted(() => ({
  sign: null as null | ((document: unknown) => Promise<unknown>),
  verify: null as null | (() => Promise<{ outcome: string; keyId?: string }>),
  signedDocuments: [] as unknown[],
}));

vi.mock("@/modules/signing/signer-client", () => ({
  signCredential: vi.fn(async (document: unknown) => {
    signerState.signedDocuments.push(structuredClone(document));
    if (!signerState.sign) throw new Error("Replacement test signer is not configured");
    return signerState.sign(document);
  }),
  verifyCredential: vi.fn(async () => {
    if (!signerState.verify) throw new Error("Replacement test verifier is not configured");
    return signerState.verify();
  }),
}));

import { ReplacementUnavailableError, createSignedReplacement } from "./replacement-service";

const previousAppUrl = process.env.APP_URL;
const previousIssuerUrl = process.env.ISSUER_URL;
const replacementTestHookKey = Symbol.for("hau-soc-badging.replacement-test-hooks");
process.env.APP_URL = "https://badges.example.test";

type ReplacementTestHooks = {
  afterSigningKeyValidation?: (tx: Prisma.TransactionClient) => Promise<void>;
};

function installReplacementHooks(hooks: ReplacementTestHooks) {
  (
    globalThis as typeof globalThis & {
      [replacementTestHookKey]?: ReplacementTestHooks;
    }
  )[replacementTestHookKey] = hooks;
}

function clearReplacementHooks() {
  delete (
    globalThis as typeof globalThis & {
      [replacementTestHookKey]?: ReplacementTestHooks;
    }
  )[replacementTestHookKey];
}

type Fixture = {
  adminId: string;
  badgeTemplateId: string;
  classId: string;
  facultyId: string;
  keyId: string;
  listId: string;
  originalId: string;
  originalPublicId: string;
  studentId: string;
  verificationMethodUrl: string;
};

let fixture: Fixture;

function uniqueId(label: string) {
  return `task9-${label}-${crypto.randomUUID()}`;
}

function createBarrier(parties: number) {
  let arrivals = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === parties) release();
    await opened;
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function nextEventLoopTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function replacementRequest(item: Fixture, actorId = item.adminId) {
  return { originalIssuanceId: item.originalId, actorId };
}

function configureSuccessfulSigner(item: Fixture) {
  signerState.sign = async (document) => ({
    ...(document as Record<string, unknown>),
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: item.verificationMethodUrl,
      created: "2026-08-30T01:02:03.000Z",
      proofValue: "z3FXQqBNXUtsjQ",
    },
  });
  signerState.verify = async () => ({
    outcome: "VERIFIED",
    keyId: item.verificationMethodUrl,
  });
}

async function createFixture(): Promise<Fixture> {
  const adminId = uniqueId("admin");
  const facultyId = uniqueId("faculty");
  const classId = uniqueId("class");
  const studentId = uniqueId("student");
  const badgeTemplateId = uniqueId("badge");
  const keyId = uniqueId("key");
  const listId = uniqueId("list");
  const originalId = uniqueId("original");
  const originalPublicId = uniqueId("original-public");
  const controllerUrl = `https://badges.example.test/api/issuers/${adminId}`;
  const verificationMethodUrl = `${controllerUrl}/keys/${keyId}`;
  const statusUrl = `https://badges.example.test/api/status-lists/${listId}`;
  const issuedAt = new Date("2026-08-25T01:02:03.000Z");
  const expiresAt = new Date("2027-08-25T01:02:03.000Z");
  const recipient = {
    studentId,
    studentNumber: uniqueId("PRIVATE-NUMBER"),
    displayName: "Replacement Recipient",
    firstName: "Replacement",
    lastName: "Recipient",
    email: `${studentId}@private.example.test`,
  };
  const achievement = {
    badgeTemplateId,
    id: `https://badges.example.test/achievements/${badgeTemplateId}`,
    type: ["Achievement"] as ["Achievement"],
    name: "Signed Replacement",
    description: "Proves signed replacement behavior against MariaDB.",
    criteria: { narrative: "Complete the signed replacement assessment." },
    imagePath: "badges/task-9-signed.png",
    image: {
      id: "https://badges.example.test/api/media/badges/task-9-signed.png",
      type: "Image" as const,
    },
    skills: ["Open Badges"],
    tag: ["Open Badges"],
    templateUpdatedAt: "2026-08-24T01:02:03.000Z",
    class: {
      id: classId,
      courseCode: "P8-901",
      title: "Signed Replacement",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
    },
    expiresAfterDays: 365,
  };
  const issuer = {
    name: "HAU School of Computing",
    url: controllerUrl,
    logoUrl: "https://badges.example.test/images/hausoclogo.png",
    issuerUserId: adminId,
    issuerUserName: "Replacement Administrator",
  };
  const credential = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ] as [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: `https://badges.example.test/credentials/${originalPublicId}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"] as [
      "VerifiableCredential",
      "OpenBadgeCredential",
    ],
    name: achievement.name,
    issuer: {
      id: controllerUrl,
      type: ["Profile"] as ["Profile"],
      name: issuer.name,
      image: { id: issuer.logoUrl, type: "Image" as const },
    },
    validFrom: issuedAt.toISOString(),
    validUntil: expiresAt.toISOString(),
    credentialSubject: {
      type: ["AchievementSubject"] as ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject" as const,
          identityHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          identityType: "email" as const,
          hashed: true as const,
        },
      ],
      achievement: {
        id: achievement.id,
        type: ["Achievement"] as ["Achievement"],
        name: achievement.name,
        description: achievement.description,
        criteria: achievement.criteria,
        image: achievement.image,
        tag: achievement.tag,
      },
    },
  };

  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        name: "Replacement Administrator",
        email: `${adminId}@example.test`,
        normalizedEmail: `${adminId}@example.test`,
        passwordHash: "not-used-by-integration-test",
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        id: facultyId,
        name: "Replacement Faculty",
        email: `${facultyId}@example.test`,
        normalizedEmail: `${facultyId}@example.test`,
        passwordHash: "not-used-by-integration-test",
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: facultyId,
      courseCode: achievement.class.courseCode,
      title: achievement.class.title,
      section: achievement.class.section,
      term: achievement.class.term,
      academicYear: achievement.class.academicYear,
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: recipient.studentNumber,
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      email: recipient.email,
    },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: facultyId,
      name: achievement.name,
      description: achievement.description,
      criteria: achievement.criteria.narrative,
      imagePath: achievement.imagePath,
    },
  });
  const key = await prisma.signingKey.create({
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
  const list = await prisma.credentialStatusList.create({
    data: {
      id: listId,
      publicUrl: statusUrl,
      purpose: "revocation",
      capacity: 131_072,
      nextIndex: 1,
    },
  });
  const unsignedOriginal = buildOpenBadgeCredential({
    snapshot: credential,
    recipientEmail: recipient.email,
    signingKey: key,
    statusAllocation: { listId, index: 0, statusUrl },
  });
  const signedOriginal = {
    ...unsignedOriginal,
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: verificationMethodUrl,
      created: "2026-08-25T01:02:04.000Z",
      proofValue: "z3FXQqBNXUtsjQ",
    },
  };
  await prisma.badgeIssuance.create({
    data: {
      id: originalId,
      classId,
      badgeTemplateId,
      studentId,
      issuerUserId: adminId,
      publicId: originalPublicId,
      issuedAt,
      expiresAt,
      recipientSnapshotJson: recipient,
      achievementSnapshotJson: achievement,
      issuerSnapshotJson: issuer,
      credentialJson: credential,
      signedCredentialJson: signedOriginal,
      signingKeyId: keyId,
      serializerVersion: 1,
    },
  });
  await prisma.credentialStatusAllocation.create({
    data: { issuanceId: originalId, statusListId: list.id, index: 0 },
  });

  return {
    adminId,
    badgeTemplateId,
    classId,
    facultyId,
    keyId,
    listId,
    originalId,
    originalPublicId,
    studentId,
    verificationMethodUrl,
  };
}

async function removeFixture(item: Fixture) {
  await prisma.notificationDelivery.deleteMany({
    where: { issuance: { classId: item.classId } },
  });
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [item.adminId, item.facultyId] } },
  });
  await prisma.badgeIssuance.updateMany({
    where: { classId: item.classId },
    data: {
      signedCredentialJson: Prisma.DbNull,
      signingKeyId: null,
      supersedesId: null,
      supersededById: null,
    },
  });
  await prisma.credentialStatusAllocation.deleteMany({
    where: { issuance: { classId: item.classId } },
  });
  await prisma.badgeIssuance.deleteMany({ where: { classId: item.classId } });
  await prisma.credentialStatusList.deleteMany({ where: { id: item.listId } });
  await prisma.signingKey.deleteMany({
    where: { controllerUrl: { startsWith: "https://badges.example.test/api/issuers/task9-" } },
  });
  await prisma.badgeTemplate.deleteMany({ where: { id: item.badgeTemplateId } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.student.deleteMany({ where: { id: item.studentId } });
  await prisma.user.deleteMany({ where: { id: { in: [item.adminId, item.facultyId] } } });
}

async function expectNoReplacementResidue(item: Fixture) {
  const original = await prisma.badgeIssuance.findUniqueOrThrow({
    where: { id: item.originalId },
    select: { supersededById: true },
  });
  expect(original.supersededById).toBeNull();
  await expect(
    prisma.badgeIssuance.count({ where: { supersedesId: item.originalId } }),
  ).resolves.toBe(0);
  await expect(
    prisma.auditLog.count({
      where: { actorUserId: item.adminId, action: "badge.replaced" },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.notificationDelivery.count({
      where: { issuance: { supersedesId: item.originalId } },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.credentialStatusAllocation.count({
      where: { issuance: { supersedesId: item.originalId } },
    }),
  ).resolves.toBe(0);
}

beforeEach(async () => {
  signerState.signedDocuments = [];
  fixture = await createFixture();
  configureSuccessfulSigner(fixture);
});

afterEach(async () => {
  clearReplacementHooks();
  await removeFixture(fixture);
  signerState.sign = null;
  signerState.verify = null;
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  if (previousIssuerUrl === undefined) delete process.env.ISSUER_URL;
  else process.env.ISSUER_URL = previousIssuerUrl;
});

describe("createSignedReplacement MariaDB transactions", () => {
  it("exposes a test-only barrier after locking and validating the signing key", async () => {
    let barrierObserved = false;
    installReplacementHooks({
      afterSigningKeyValidation: async () => {
        barrierObserved = true;
      },
    });

    await createSignedReplacement(replacementRequest(fixture));

    expect(barrierObserved).toBe(true);
  });

  it("retries a retryable MariaDB commit failure without duplicate side effects", async () => {
    let attempts = 0;
    installReplacementHooks({
      afterSigningKeyValidation: async () => {
        attempts += 1;
        if (attempts < 3) throw { code: "P2034" };
      },
    });

    const replacement = await createSignedReplacement(replacementRequest(fixture));

    expect(attempts).toBe(3);
    await expect(
      prisma.badgeIssuance.count({ where: { supersedesId: fixture.originalId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.adminId, action: "badge.replaced" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuanceId: replacement.replacementId } }),
    ).resolves.toBe(1);
  });

  it("bounds retryable MariaDB commit failures and rolls back every attempt", async () => {
    let attempts = 0;
    installReplacementHooks({
      afterSigningKeyValidation: async () => {
        attempts += 1;
        throw { code: "P2034" };
      },
    });

    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
      ReplacementUnavailableError,
    );

    expect(attempts).toBe(3);
    await expectNoReplacementResidue(fixture);
  });

  it("uses the authoritative database role and denies a Faculty before signing", async () => {
    await expect(
      createSignedReplacement(replacementRequest(fixture, fixture.facultyId)),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(signerState.signedDocuments).toHaveLength(0);
    await expectNoReplacementResidue(fixture);
  });

  it("creates a distinct signed replacement while preserving the original historical snapshots", async () => {
    const originalBefore = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: fixture.originalId },
      include: { statusAllocation: true },
    });

    const result = await createSignedReplacement(replacementRequest(fixture));

    const [originalAfter, replacement, audits, notifications] = await Promise.all([
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: fixture.originalId },
        include: { statusAllocation: true },
      }),
      prisma.badgeIssuance.findUniqueOrThrow({
        where: { id: result.replacementId },
        include: { statusAllocation: true },
      }),
      prisma.auditLog.findMany({
        where: { actorUserId: fixture.adminId, action: "badge.replaced" },
      }),
      prisma.notificationDelivery.findMany({ where: { issuanceId: result.replacementId } }),
    ]);

    expect(result.replacementId).not.toBe(fixture.originalId);
    expect(result.publicId).not.toBe(fixture.originalPublicId);
    expect(originalAfter).toMatchObject({
      id: originalBefore.id,
      publicId: originalBefore.publicId,
      status: originalBefore.status,
      issuedAt: originalBefore.issuedAt,
      expiresAt: originalBefore.expiresAt,
      recipientSnapshotJson: originalBefore.recipientSnapshotJson,
      achievementSnapshotJson: originalBefore.achievementSnapshotJson,
      issuerSnapshotJson: originalBefore.issuerSnapshotJson,
      credentialJson: originalBefore.credentialJson,
      signedCredentialJson: originalBefore.signedCredentialJson,
      signingKeyId: originalBefore.signingKeyId,
      serializerVersion: originalBefore.serializerVersion,
      supersededById: replacement.id,
      statusAllocation: originalBefore.statusAllocation,
    });
    expect(replacement).toMatchObject({
      publicId: result.publicId,
      status: "ACTIVE",
      issuedAt: originalBefore.issuedAt,
      expiresAt: originalBefore.expiresAt,
      recipientSnapshotJson: originalBefore.recipientSnapshotJson,
      achievementSnapshotJson: originalBefore.achievementSnapshotJson,
      issuerSnapshotJson: originalBefore.issuerSnapshotJson,
      signingKeyId: fixture.keyId,
      serializerVersion: 1,
      supersedesId: fixture.originalId,
      supersededById: null,
      statusAllocation: {
        statusListId: fixture.listId,
        index: 1,
        isRevoked: false,
      },
    });
    expect(replacement.credentialJson).toMatchObject({
      id: `https://badges.example.test/credentials/${result.publicId}`,
    });
    expect(replacement.signedCredentialJson).toMatchObject({
      id: `https://badges.example.test/credentials/${result.publicId}`,
      credentialStatus: {
        statusListCredential: expect.stringContaining(fixture.listId),
        statusListIndex: "1",
        statusPurpose: "revocation",
      },
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: fixture.verificationMethodUrl,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.contextJson).toEqual({
      originalIssuanceId: fixture.originalId,
      replacementId: replacement.id,
      originalPublicId: fixture.originalPublicId,
      publicId: replacement.publicId,
      signingKeyId: fixture.keyId,
      statusListId: fixture.listId,
      statusListIndex: 1,
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "BADGE_ISSUED",
      status: "PENDING",
      verificationUrl: `https://badges.example.test/credentials/${result.publicId}`,
      occurredAt: originalBefore.issuedAt,
    });
  });

  it("returns the same replacement on repeat without duplicate side effects and rechecks the Administrator", async () => {
    const first = await createSignedReplacement(replacementRequest(fixture));
    const second = await createSignedReplacement(replacementRequest(fixture));

    expect(second).toEqual(first);
    await expect(
      prisma.badgeIssuance.count({ where: { supersedesId: fixture.originalId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.adminId, action: "badge.replaced" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuanceId: first.replacementId } }),
    ).resolves.toBe(1);

    await prisma.user.update({
      where: { id: fixture.adminId },
      data: { status: "SUSPENDED" },
    });
    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("serializes concurrent replacement requests to one replacement, audit, notification, and allocation", async () => {
    const bothPrepared = createBarrier(2);
    signerState.sign = async (document) => {
      await bothPrepared();
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: fixture.verificationMethodUrl,
          created: "2026-08-30T01:02:03.000Z",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      };
    };
    const results = await Promise.all([
      createSignedReplacement(replacementRequest(fixture)),
      createSignedReplacement(replacementRequest(fixture)),
    ]);

    expect(results[1]).toEqual(results[0]);
    expect(signerState.signedDocuments).toHaveLength(2);
    await expect(
      prisma.badgeIssuance.count({ where: { supersedesId: fixture.originalId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: fixture.adminId, action: "badge.replaced" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuanceId: results[0]!.replacementId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.credentialStatusAllocation.count({
        where: { issuance: { supersedesId: fixture.originalId } },
      }),
    ).resolves.toBe(1);
  });

  it.each(["retire", "compromise", "rotate"] as const)(
    "holds the validated key locks through commit and blocks a concurrent %s operation",
    async (operation) => {
      const keyValidated = deferred();
      const releaseReplacement = deferred();
      installReplacementHooks({
        afterSigningKeyValidation: async () => {
          keyValidated.resolve();
          await releaseReplacement.promise;
        },
      });

      const replacementPromise = createSignedReplacement(replacementRequest(fixture));
      await keyValidated.promise;

      const lifecycleStarted = deferred();
      let lifecycleFinished = false;
      const lifecyclePromise = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        lifecycleStarted.resolve();
        if (operation === "retire") {
          await tx.signingKey.update({
            where: { id: fixture.keyId },
            data: { status: "RETIRED", retiredAt: new Date() },
          });
        } else if (operation === "compromise") {
          await tx.signingKey.update({
            where: { id: fixture.keyId },
            data: { status: "COMPROMISED", compromisedAt: new Date() },
          });
        } else {
          await tx.signingKey.create({
            data: {
              verificationMethodUrl: `${fixture.verificationMethodUrl}-rotated-after-validation`,
              controllerUrl: fixture.verificationMethodUrl.slice(
                0,
                fixture.verificationMethodUrl.lastIndexOf("/keys/"),
              ),
              algorithm: "Ed25519",
              cryptosuite: "eddsa-rdfc-2022",
              publicMultikey: `z${crypto.randomUUID().replaceAll("-", "")}`,
              fingerprint: uniqueId("rotated-after-validation-fingerprint"),
              status: "ACTIVE",
              activatedAt: new Date(),
            },
          });
          await tx.signingKey.update({
            where: { id: fixture.keyId },
            data: { status: "RETIRED", retiredAt: new Date() },
          });
        }
        lifecycleFinished = true;
      });
      await lifecycleStarted.promise;
      await nextEventLoopTurn();

      expect(lifecycleFinished).toBe(false);

      releaseReplacement.resolve();
      const replacement = await replacementPromise;
      await lifecyclePromise;

      await expect(
        prisma.badgeIssuance.findUniqueOrThrow({ where: { id: replacement.replacementId } }),
      ).resolves.toMatchObject({ status: "ACTIVE", signingKeyId: fixture.keyId });
      await expect(
        prisma.badgeIssuance.count({ where: { supersedesId: fixture.originalId } }),
      ).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: { actorUserId: fixture.adminId, action: "badge.replaced" },
        }),
      ).resolves.toBe(1);
    },
  );

  it("leaves the original unlinked with no visible replacement residue when signing fails", async () => {
    signerState.sign = async () => {
      throw new Error("private signer diagnostic must not be persisted");
    };

    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toThrow();

    await expectNoReplacementResidue(fixture);
  });

  it("leaves no visible replacement residue when signer verification rejects the proof", async () => {
    signerState.verify = async () => ({
      outcome: "INVALID_PROOF",
      keyId: fixture.verificationMethodUrl,
    });

    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
      ReplacementUnavailableError,
    );

    await expectNoReplacementResidue(fixture);
  });

  it.each([
    ["revoked", { status: "REVOKED" as const }],
    ["expired status", { status: "EXPIRED" as const }],
    ["time-expired", { status: "ACTIVE" as const, expiresAt: new Date("2026-01-01T00:00:00Z") }],
  ])("rejects a %s original before signing", async (_caseName, data) => {
    await prisma.badgeIssuance.update({ where: { id: fixture.originalId }, data });

    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
      ReplacementUnavailableError,
    );

    expect(signerState.signedDocuments).toHaveLength(0);
    await expectNoReplacementResidue(fixture);
  });

  it.each(["retire", "compromise", "rotate"] as const)(
    "rolls back when a concurrent %s operation commits before final key locking",
    async (operation) => {
      signerState.sign = async (document) => {
        if (operation === "retire") {
          await prisma.signingKey.update({
            where: { id: fixture.keyId },
            data: { status: "RETIRED", retiredAt: new Date() },
          });
        } else if (operation === "compromise") {
          await prisma.signingKey.update({
            where: { id: fixture.keyId },
            data: { status: "COMPROMISED", compromisedAt: new Date() },
          });
        } else {
          await prisma.$transaction([
            prisma.signingKey.update({
              where: { id: fixture.keyId },
              data: { status: "RETIRED", retiredAt: new Date() },
            }),
            prisma.signingKey.create({
              data: {
                verificationMethodUrl: `${fixture.verificationMethodUrl}-rotated`,
                controllerUrl: fixture.verificationMethodUrl.slice(
                  0,
                  fixture.verificationMethodUrl.lastIndexOf("/keys/"),
                ),
                algorithm: "Ed25519",
                cryptosuite: "eddsa-rdfc-2022",
                publicMultikey: `z${crypto.randomUUID().replaceAll("-", "")}`,
                fingerprint: uniqueId("rotated-fingerprint"),
                status: "ACTIVE",
                activatedAt: new Date(),
              },
            }),
          ]);
        }
        return {
          ...(document as Record<string, unknown>),
          proof: {
            type: "DataIntegrityProof",
            cryptosuite: "eddsa-rdfc-2022",
            proofPurpose: "assertionMethod",
            verificationMethod: fixture.verificationMethodUrl,
            created: "2026-08-30T01:02:03.000Z",
            proofValue: "z3FXQqBNXUtsjQ",
          },
        };
      };

      await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
        ReplacementUnavailableError,
      );

      await expectNoReplacementResidue(fixture);
    },
  );

  it("rolls back when the reserved status-list contract changes before commit", async () => {
    signerState.sign = async (document) => {
      await prisma.credentialStatusList.update({
        where: { id: fixture.listId },
        data: { publicUrl: `https://badges.example.test/api/status-lists/${uniqueId("rotated")}` },
      });
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: fixture.verificationMethodUrl,
          created: "2026-08-30T01:02:03.000Z",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      };
    };

    await expect(createSignedReplacement(replacementRequest(fixture))).rejects.toBeInstanceOf(
      ReplacementUnavailableError,
    );

    await expectNoReplacementResidue(fixture);
  });
});
