import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { SignerClientError } from "@/modules/signing/signer-client";
import { prisma } from "@/platform/db/prisma";

import {
  SIGNER_UNAVAILABLE_MESSAGE,
  SignedIssuanceError,
  commitPreparedSignedIssuance,
  issueSignedBadgeForTest as issueSignedBadge,
  prepareSignedIssuanceForTest as prepareSignedIssuance,
  type PreparedSignedIssuance,
  type SignedIssuanceSigner,
} from "./signed-issuance-service";

const controllerUrl = "https://badges.example.test/api/issuers/hau-soc";
const verificationMethodUrl = `${controllerUrl}/keys/integration-key`;
const statusUrl = "https://badges.example.test/api/status-lists/integration-list";
const previousAppUrl = process.env.APP_URL;
const previousIssuerUrl = process.env.ISSUER_URL;
const testHookKey = Symbol.for("hau-soc-badging.issuance-test-hooks");
process.env.APP_URL = "https://badges.example.test";
process.env.ISSUER_URL = controllerUrl;

type Fixture = {
  actor: Actor;
  badgeTemplateId: string;
  classId: string;
  keyId: string;
  listId: string;
  studentId: string;
  userId: string;
};

let fixture: Fixture;

type IssuanceTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  onCommitRetry?: () => void;
};

function uniqueId(label: string) {
  return `task5-${label}-${crypto.randomUUID()}`;
}

function request(item: Fixture) {
  return {
    classId: item.classId,
    badgeTemplateId: item.badgeTemplateId,
    studentId: item.studentId,
  };
}

function installHooks(hooks: IssuanceTestHooks) {
  (globalThis as typeof globalThis & { [testHookKey]?: IssuanceTestHooks })[testHookKey] = hooks;
}

function clearHooks() {
  delete (globalThis as typeof globalThis & { [testHookKey]?: IssuanceTestHooks })[testHookKey];
}

async function expectNoVisibleCredential(item: Fixture) {
  await expect(prisma.badgeIssuance.count({ where: { classId: item.classId } })).resolves.toBe(0);
  await expect(
    prisma.credentialStatusAllocation.count({ where: { statusListId: item.listId } }),
  ).resolves.toBe(0);
  await expect(
    prisma.auditLog.count({ where: { actorUserId: item.userId, action: "badge.issued" } }),
  ).resolves.toBe(0);
  await expect(
    prisma.notificationDelivery.count({ where: { issuance: { classId: item.classId } } }),
  ).resolves.toBe(0);
}

function createSigner(): SignedIssuanceSigner & { payloads: unknown[] } {
  const payloads: unknown[] = [];
  return {
    payloads,
    signCredential: async (document) => {
      payloads.push(structuredClone(document));
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: verificationMethodUrl,
          created: "2026-08-25T01:02:04.000Z",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      };
    },
    verifyCredential: async () => ({ outcome: "VERIFIED", keyId: verificationMethodUrl }),
  };
}

async function createFixture(): Promise<Fixture> {
  const userId = uniqueId("faculty");
  const classId = uniqueId("class");
  const studentId = uniqueId("student");
  const badgeTemplateId = uniqueId("badge");
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
      courseCode: "P8-501",
      title: "Signed Issuance",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: uniqueId("PRIVATE-NUMBER"),
      firstName: "PrivateFirst",
      lastName: "PrivateLast",
      email: `${studentId}@private.example.test`,
    },
  });
  await prisma.classStudent.create({ data: { classId, studentId, enrollmentStatus: "ACTIVE" } });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeTemplateId,
      classId,
      ownerUserId: userId,
      name: "Signed Credential",
      description: "Proves signed issuance behavior against MariaDB.",
      criteria: "Complete the signed issuance assessment.",
      imagePath: "badges/task-5-signed.png",
      status: "ACTIVE",
      metadataJson: { skills: ["Open Badges"] },
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
      publicUrl: statusUrl,
      purpose: "revocation",
      capacity: 131_072,
      nextIndex: 0,
    },
  });
  return {
    actor: { id: userId, name: "Stale Name", email, role: "FACULTY" },
    badgeTemplateId,
    classId,
    keyId,
    listId,
    studentId,
    userId,
  };
}

async function removeFixture(item: Fixture) {
  await prisma.notificationDelivery.deleteMany({ where: { issuance: { classId: item.classId } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: item.userId } });
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
  clearHooks();
  fixture = await createFixture();
});

afterEach(async () => {
  clearHooks();
  await removeFixture(fixture);
  await prisma.systemSetting.deleteMany({ where: { id: "default" } });
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  if (previousIssuerUrl === undefined) delete process.env.ISSUER_URL;
  else process.env.ISSUER_URL = previousIssuerUrl;
});

describe("signed individual issuance MariaDB transactions", () => {
  it("rejects a proof-only clone tamper with zero visible residue", async () => {
    const prepared = await prepareSignedIssuance(
      { actor: fixture.actor, ...request(fixture) },
      createSigner(),
    );
    const tampered = structuredClone(prepared) as PreparedSignedIssuance;
    Object.assign(tampered.signedDocument.proof, { proofValue: "z4FXQqBNXUtsjQ" });

    await expect(commitPreparedSignedIssuance(fixture.actor, tampered)).rejects.toBeInstanceOf(
      SignedIssuanceError,
    );

    await expectNoVisibleCredential(fixture);
  });

  it("rejects an unchanged plain-object clone with zero visible residue", async () => {
    const prepared = await prepareSignedIssuance(
      { actor: fixture.actor, ...request(fixture) },
      createSigner(),
    );

    await expect(
      commitPreparedSignedIssuance(
        fixture.actor,
        structuredClone(prepared) as PreparedSignedIssuance,
      ),
    ).rejects.toBeInstanceOf(SignedIssuanceError);

    await expectNoVisibleCredential(fixture);
  });

  it("maps a concurrent noncanonical issuer setting to a safe correlation with no visible residue", async () => {
    const prepared = await prepareSignedIssuance(
      { actor: fixture.actor, ...request(fixture) },
      createSigner(),
    );
    await prisma.systemSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        issuerName: "Concurrent Invalid Issuer",
        issuerUrl: "not-a-canonical-url",
        issuerLogoPath: "/images/hausoclogo.png",
        sharingEnabled: true,
      },
      update: { issuerUrl: "not-a-canonical-url" },
    });

    const error = await commitPreparedSignedIssuance(fixture.actor, prepared).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SignedIssuanceError);
    expect((error as Error).message).toMatch(/Reference: [0-9a-f-]{36}\.$/);
    expect((error as Error).message).not.toContain("canonical");
    await expectNoVisibleCredential(fixture);
  });

  it("retries the complete commit after a real MariaDB record-changed conflict", async () => {
    let injected = false;
    let retries = 0;
    installHooks({
      beforeActorLock: async (tx) => {
        if (injected) return;
        injected = true;
        await tx.user.findUnique({ where: { id: fixture.userId }, select: { id: true } });
        await prisma.user.update({
          where: { id: fixture.userId },
          data: { passwordHash: "changed-during-task5-retry-test" },
        });
      },
      onCommitRetry: () => {
        retries += 1;
      },
    });

    const result = await issueSignedBadge(fixture.actor, request(fixture), createSigner());

    expect(retries).toBe(1);
    expect(result.alreadyIssued).toBe(false);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(1);
  });

  it("rejects a non-owner at the server mutation boundary before signing or persistence", async () => {
    const signer = createSigner();
    const nonOwner: Actor = {
      id: uniqueId("non-owner"),
      name: "Different Faculty",
      email: "different-faculty@example.test",
      role: "FACULTY",
    };

    await expect(issueSignedBadge(nonOwner, request(fixture), signer)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    expect(signer.payloads).toHaveLength(0);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("atomically commits one signed credential, allocation, audit, and notification without private signer/audit data", async () => {
    const signer = createSigner();
    const result = await issueSignedBadge(fixture.actor, request(fixture), signer);
    const [stored, allocations, audits, notifications] = await Promise.all([
      prisma.badgeIssuance.findUniqueOrThrow({ where: { id: result.issuanceId } }),
      prisma.credentialStatusAllocation.findMany({ where: { issuanceId: result.issuanceId } }),
      prisma.auditLog.findMany({
        where: { actorUserId: fixture.userId, action: "badge.issued" },
      }),
      prisma.notificationDelivery.findMany({ where: { issuanceId: result.issuanceId } }),
    ]);

    expect(result.alreadyIssued).toBe(false);
    expect(stored.signedCredentialJson).toMatchObject({
      credentialStatus: {
        statusPurpose: "revocation",
        statusListCredential: statusUrl,
      },
      proof: {
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethod: verificationMethodUrl,
      },
    });
    expect(stored.signingKeyId).toBe(fixture.keyId);
    expect(stored.serializerVersion).toBe(1);
    expect(allocations).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    const signerJson = JSON.stringify(signer.payloads);
    const auditJson = JSON.stringify(audits.map((audit) => audit.contextJson));
    expect(signerJson).not.toContain("@private.example.test");
    expect(signerJson).not.toContain("PRIVATE-NUMBER");
    expect(signerJson).not.toContain("PrivateFirst");
    expect(auditJson).not.toContain("@private.example.test");
    expect(auditJson).not.toContain("PRIVATE-NUMBER");
    expect(auditJson).not.toContain("PrivateFirst");
  });

  it("persists no issuance, allocation, audit, or notification after signer unavailability", async () => {
    const signer = createSigner();
    signer.signCredential = async () => {
      throw new SignerClientError("SIGNER_UNAVAILABLE");
    };

    await expect(issueSignedBadge(fixture.actor, request(fixture), signer)).rejects.toMatchObject({
      message: SIGNER_UNAVAILABLE_MESSAGE,
      retryable: true,
    });

    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("persists no visible record after invalid proof verification", async () => {
    const signer = createSigner();
    signer.verifyCredential = async () => ({
      outcome: "INVALID_PROOF",
      keyId: verificationMethodUrl,
    });

    await expect(issueSignedBadge(fixture.actor, request(fixture), signer)).rejects.toMatchObject({
      retryable: false,
    });

    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(0);
  });

  it("commits only one visible credential for concurrent duplicate requests", async () => {
    const signer = createSigner();
    const results = await Promise.all([
      issueSignedBadge(fixture.actor, request(fixture), signer),
      issueSignedBadge(fixture.actor, request(fixture), signer),
    ]);

    expect(new Set(results.map((result) => result.issuanceId)).size).toBe(1);
    expect(results.map((result) => result.alreadyIssued).sort()).toEqual([false, true]);
    await expect(prisma.badgeIssuance.count({ where: { classId: fixture.classId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.credentialStatusAllocation.count({ where: { statusListId: fixture.listId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { actorUserId: fixture.userId, action: "badge.issued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.notificationDelivery.count({ where: { issuance: { classId: fixture.classId } } }),
    ).resolves.toBe(1);
  });
});
