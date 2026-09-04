import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { encodeRevocationList, readRevocationStatus } from "@/modules/open-badges/status-list";
import type { UnsignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import { prisma } from "@/platform/db/prisma";

import {
  lockCredentialStatusList,
  regenerateSignedStatusList,
  type StatusListSigner,
} from "./status-list-service";

type Fixture = {
  classId: string;
  issuanceIds: readonly [string, string];
  keyId: string;
  listId: string;
  studentIds: readonly [string, string];
  templateId: string;
  userId: string;
};

let fixture: Fixture;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function uniqueId(label: string) {
  return `phase8-status-regeneration-${label}-${crypto.randomUUID()}`;
}

function createSigner(): StatusListSigner {
  return {
    signCredential: async (document: unknown) => ({
      ...(document as UnsignedOpenBadgeCredential),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        proofPurpose: "assertionMethod",
        verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        created: "2026-08-25T01:02:04.000Z",
        proofValue: "z3FXQqBNXUtsjQ",
      },
    }),
  };
}

async function createFixture(): Promise<Fixture> {
  const userId = uniqueId("user");
  const classId = uniqueId("class");
  const templateId = uniqueId("template");
  const studentIds = [uniqueId("student-1"), uniqueId("student-2")] as const;
  const issuanceIds = [uniqueId("issuance-1"), uniqueId("issuance-2")] as const;
  const keyId = uniqueId("key");
  const listId = uniqueId("list");
  const email = `${userId}@example.test`;

  await prisma.user.create({
    data: {
      id: userId,
      name: "Status Faculty",
      email,
      normalizedEmail: email,
      passwordHash: "test",
      role: "FACULTY",
    },
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: userId,
      courseCode: "P8-404",
      title: "Status Regeneration",
      section: "A",
      term: "First",
      academicYear: "2026-2027",
    },
  });
  for (const [index, studentId] of studentIds.entries()) {
    await prisma.student.create({
      data: {
        id: studentId,
        studentNumber: uniqueId(`number-${index}`),
        firstName: "Status",
        lastName: `Student ${index}`,
        email: `${studentId}@example.test`,
      },
    });
  }
  await prisma.badgeTemplate.create({
    data: {
      id: templateId,
      classId,
      ownerUserId: userId,
      name: "Status Badge",
      description: "Status fixture",
      criteria: "Status fixture",
      imagePath: "badges/status.png",
    },
  });
  for (const [index, issuanceId] of issuanceIds.entries()) {
    await prisma.badgeIssuance.create({
      data: {
        id: issuanceId,
        publicId: uniqueId(`public-${index}`),
        classId,
        badgeTemplateId: templateId,
        studentId: studentIds[index]!,
        issuerUserId: userId,
        issuedAt: new Date("2026-08-25T01:02:03.456Z"),
        recipientSnapshotJson: {},
        achievementSnapshotJson: {},
        issuerSnapshotJson: {},
        credentialJson: {},
      },
    });
  }
  await prisma.signingKey.create({
    data: {
      id: keyId,
      verificationMethodUrl: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
      controllerUrl: "https://badges.example.test/api/issuers/hau-soc",
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
      publicUrl: "https://badges.example.test/api/status-lists/list-1",
      purpose: "revocation",
      capacity: 131_072,
      nextIndex: 2,
    },
  });
  for (const [index, issuanceId] of issuanceIds.entries()) {
    await prisma.credentialStatusAllocation.create({
      data: { issuanceId, statusListId: listId, index },
    });
  }

  return { classId, issuanceIds, keyId, listId, studentIds, templateId, userId };
}

async function cleanFixture(item: Fixture) {
  await prisma.credentialStatusAllocation.deleteMany({
    where: { issuanceId: { in: [...item.issuanceIds] } },
  });
  await prisma.credentialStatusList.deleteMany({ where: { id: item.listId } });
  await prisma.badgeIssuance.deleteMany({ where: { id: { in: [...item.issuanceIds] } } });
  await prisma.badgeTemplate.deleteMany({ where: { id: item.templateId } });
  await prisma.student.deleteMany({ where: { id: { in: [...item.studentIds] } } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.signingKey.deleteMany({ where: { id: item.keyId } });
  await prisma.user.deleteMany({ where: { id: item.userId } });
}

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await cleanFixture(fixture);
});

describe("regenerateSignedStatusList MariaDB transactions", () => {
  it("persists only the fully signed list and advances its version atomically", async () => {
    await prisma.credentialStatusAllocation.update({
      where: { issuanceId: fixture.issuanceIds[0] },
      data: { isRevoked: true, revokedAt: new Date("2026-08-25T02:00:00.000Z") },
    });

    const signed = await prisma.$transaction((tx) =>
      regenerateSignedStatusList(tx, fixture.listId, createSigner()),
    );
    const stored = await prisma.credentialStatusList.findUniqueOrThrow({
      where: { id: fixture.listId },
    });

    expect(stored.signedCredentialJson).toEqual(signed);
    expect(stored.signingKeyId).toBe(fixture.keyId);
    expect(stored.version).toBe(1);
    expect(stored.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(readRevocationStatus(signed.credentialSubject.encodedList, 0)).toBe(true);
    expect(readRevocationStatus(signed.credentialSubject.encodedList, 1)).toBe(false);
  });

  it("stores no partial signed list when the signer fails", async () => {
    const failingSigner: StatusListSigner = {
      signCredential: async () => {
        throw new Error("signer unavailable");
      },
    };

    await expect(
      prisma.$transaction((tx) => regenerateSignedStatusList(tx, fixture.listId, failingSigner)),
    ).rejects.toThrow("signer unavailable");

    await expect(
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ).resolves.toMatchObject({
      signedCredentialJson: null,
      signingKeyId: null,
      version: 0,
      digest: null,
    });
  });

  it("rejects a signer that mutates the status payload before proving it", async () => {
    const signer = createSigner();
    const mutatingSigner: StatusListSigner = {
      signCredential: async (document, correlationId) => {
        const signed = await signer.signCredential(document, correlationId);
        return {
          ...signed,
          credentialSubject: {
            ...signed.credentialSubject,
            encodedList: encodeRevocationList([1], 131_072),
          },
        };
      },
    };

    await expect(
      prisma.$transaction((tx) => regenerateSignedStatusList(tx, fixture.listId, mutatingSigner)),
    ).rejects.toThrow("noncanonical status list");

    await expect(
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ).resolves.toMatchObject({ signedCredentialJson: null, version: 0 });
  });

  it("rejects publication below the 131,072-entry status-list minimum", async () => {
    const undersizedListId = uniqueId("undersized-list");
    await prisma.credentialStatusList.create({
      data: {
        id: undersizedListId,
        publicUrl: "https://badges.example.test/api/status-lists/undersized-list",
        purpose: "revocation",
        capacity: 16,
      },
    });

    try {
      await expect(
        prisma.$transaction((tx) =>
          regenerateSignedStatusList(tx, undersizedListId, createSigner()),
        ),
      ).rejects.toThrow("at least 131072 entries");
    } finally {
      await prisma.credentialStatusList.deleteMany({ where: { id: undersizedListId } });
    }
  });

  it("preserves both bits across concurrent revocations", async () => {
    const revoke = (issuanceId: string) =>
      prisma.$transaction(async (tx) => {
        await lockCredentialStatusList(tx, fixture.listId);
        await tx.credentialStatusAllocation.update({
          where: { issuanceId },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        return regenerateSignedStatusList(tx, fixture.listId, createSigner());
      });

    await Promise.all(fixture.issuanceIds.map((issuanceId) => revoke(issuanceId)));

    const stored = await prisma.credentialStatusList.findUniqueOrThrow({
      where: { id: fixture.listId },
    });
    const document = stored.signedCredentialJson as {
      credentialSubject: { encodedList: string };
    };
    expect(readRevocationStatus(document.credentialSubject.encodedList, 0)).toBe(true);
    expect(readRevocationStatus(document.credentialSubject.encodedList, 1)).toBe(true);
    expect(stored.version).toBe(2);
  });

  it("uses current reads after waiting on the parent lock despite a stale snapshot", async () => {
    await prisma.$transaction((tx) =>
      regenerateSignedStatusList(tx, fixture.listId, createSigner()),
    );
    const firstHasLock = deferred();
    const releaseFirst = deferred();
    const secondHasStaleSnapshot = deferred();

    const first = prisma.$transaction(
      async (tx) => {
        await lockCredentialStatusList(tx, fixture.listId);
        await tx.credentialStatusAllocation.update({
          where: { issuanceId: fixture.issuanceIds[0] },
          data: { isRevoked: true, revokedAt: new Date("2026-08-25T02:00:00.000Z") },
        });
        firstHasLock.resolve();
        await releaseFirst.promise;
      },
      { timeout: 10_000 },
    );

    await firstHasLock.promise;
    const second = prisma.$transaction(
      async (tx) => {
        const staleKeySnapshot = await tx.signingKey.findMany({
          where: { status: "ACTIVE" },
        });
        expect(staleKeySnapshot).toHaveLength(1);
        secondHasStaleSnapshot.resolve();

        await lockCredentialStatusList(tx, fixture.listId);
        await tx.credentialStatusAllocation.update({
          where: { issuanceId: fixture.issuanceIds[1] },
          data: { isRevoked: true, revokedAt: new Date("2026-08-25T02:01:00.000Z") },
        });
        return regenerateSignedStatusList(tx, fixture.listId, createSigner());
      },
      { timeout: 10_000 },
    );

    await secondHasStaleSnapshot.promise;
    releaseFirst.resolve();
    await first;
    await expect(second).rejects.toThrow(/1020|Record has changed/);

    await prisma.$transaction(async (tx) => {
      await lockCredentialStatusList(tx, fixture.listId);
      await tx.credentialStatusAllocation.update({
        where: { issuanceId: fixture.issuanceIds[1] },
        data: { isRevoked: true, revokedAt: new Date("2026-08-25T02:01:00.000Z") },
      });
      return regenerateSignedStatusList(tx, fixture.listId, createSigner());
    });

    const stored = await prisma.credentialStatusList.findUniqueOrThrow({
      where: { id: fixture.listId },
    });
    const document = stored.signedCredentialJson as {
      credentialSubject: { encodedList: string };
    };
    expect(readRevocationStatus(document.credentialSubject.encodedList, 0)).toBe(true);
    expect(readRevocationStatus(document.credentialSubject.encodedList, 1)).toBe(true);
    expect(stored.version).toBe(2);
  });

  it("rolls back when a key becomes compromised after a stale snapshot was established", async () => {
    const snapshotEstablished = deferred();
    const continueRegeneration = deferred();

    const regeneration = prisma.$transaction(
      async (tx) => {
        await tx.signingKey.findMany({ where: { status: "ACTIVE" } });
        snapshotEstablished.resolve();
        await continueRegeneration.promise;
        return regenerateSignedStatusList(tx, fixture.listId, createSigner());
      },
      { timeout: 10_000 },
    );

    await snapshotEstablished.promise;
    await prisma.signingKey.update({
      where: { id: fixture.keyId },
      data: {
        status: "COMPROMISED",
        compromisedAt: new Date("2026-08-25T02:02:00.000Z"),
      },
    });
    continueRegeneration.resolve();

    await expect(regeneration).rejects.toThrow("One active signing key is required");
    await expect(
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ).resolves.toMatchObject({
      signedCredentialJson: null,
      signingKeyId: null,
      version: 0,
      digest: null,
    });
  });

  it("revalidates the locked key after signing and rolls back a lifecycle change", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const signer = createSigner();
        const lifecycleChangingSigner: StatusListSigner = {
          signCredential: async (document, correlationId) => {
            const signed = await signer.signCredential(document, correlationId);
            await tx.signingKey.update({
              where: { id: fixture.keyId },
              data: {
                status: "COMPROMISED",
                compromisedAt: new Date("2026-08-25T02:03:00.000Z"),
              },
            });
            return signed;
          },
        };
        return regenerateSignedStatusList(tx, fixture.listId, lifecycleChangingSigner);
      }),
    ).rejects.toThrow("Signing key is no longer active");

    await expect(
      prisma.signingKey.findUniqueOrThrow({ where: { id: fixture.keyId } }),
    ).resolves.toMatchObject({ status: "ACTIVE", compromisedAt: null });
    await expect(
      prisma.credentialStatusList.findUniqueOrThrow({ where: { id: fixture.listId } }),
    ).resolves.toMatchObject({ signedCredentialJson: null, signingKeyId: null, version: 0 });
  });

  it("does not set a revocation bit when an issuance merely expires", async () => {
    await prisma.badgeIssuance.update({
      where: { id: fixture.issuanceIds[0] },
      data: {
        status: "EXPIRED",
        expiresAt: new Date("2026-08-25T00:00:00.000Z"),
      },
    });

    const signed = await prisma.$transaction((tx) =>
      regenerateSignedStatusList(tx, fixture.listId, createSigner()),
    );

    expect(readRevocationStatus(signed.credentialSubject.encodedList, 0)).toBe(false);
  });
});
