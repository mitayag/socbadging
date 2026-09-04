import { Prisma } from "@prisma/client";
import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import {
  activateSigningKey,
  markSigningKeyCompromised,
  registerPublicSigningKey,
  retireSigningKey,
  type SigningKeyRegistrationInput,
} from "./key-service";

type Fixture = {
  admin: Actor;
  adminId: string;
  issuanceId: string;
  classId: string;
  studentId: string;
};

let fixture: Fixture;
const auditFailureTrigger = "phase8_task2_signing_audit_failure";
const publicMultikey = "z6Mkon3Necd6NkkyfoGoHxid2znGc59LU3K7mubaRcFbLfLX";

function uniqueId(label: string) {
  return `phase8-task2-${label}-${crypto.randomUUID()}`;
}

function keyInput(label: string): SigningKeyRegistrationInput {
  const token = uniqueId(label);
  return {
    verificationMethodUrl: `https://badges.example.test/issuers/hau-soc/keys/${token}`,
    controllerUrl: "https://badges.example.test/issuers/hau-soc",
    algorithm: "Ed25519",
    cryptosuite: "eddsa-rdfc-2022",
    publicMultikey,
    fingerprint: `z${uniqueId(`${label}-fingerprint`).replaceAll("-", "")}`,
  };
}

async function createFixture(): Promise<Fixture> {
  const adminId = uniqueId("admin");
  const adminEmail = `${adminId}@example.test`;
  const classId = uniqueId("class");
  const studentId = uniqueId("student");
  const templateId = uniqueId("template");
  const issuanceId = uniqueId("issuance");

  await prisma.user.create({
    data: {
      id: adminId,
      name: "Phase Eight Administrator",
      email: adminEmail,
      normalizedEmail: adminEmail,
      passwordHash: "not-used-by-integration-test",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: adminId,
      courseCode: "P8-201",
      title: "Phase Eight Persistence",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: uniqueId("student-number"),
      firstName: "Phase",
      lastName: "Eight",
      email: `${studentId}@example.test`,
    },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: templateId,
      classId,
      ownerUserId: adminId,
      name: "Phase Eight Badge",
      description: "Persistence test fixture.",
      criteria: "Complete the persistence test fixture.",
      imagePath: "badges/phase8.png",
    },
  });
  await prisma.badgeIssuance.create({
    data: {
      id: issuanceId,
      publicId: uniqueId("public"),
      classId,
      badgeTemplateId: templateId,
      studentId,
      issuerUserId: adminId,
      issuedAt: new Date(),
      recipientSnapshotJson: {},
      achievementSnapshotJson: {},
      issuerSnapshotJson: {},
      credentialJson: {},
    },
  });
  return {
    admin: { id: adminId, name: "Phase Eight Administrator", email: adminEmail, role: "ADMIN" },
    adminId,
    issuanceId,
    classId,
    studentId,
  };
}

async function cleanFixture(item: Fixture) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE badge_issuances SET signed_credential_json = NULL, signing_key_id = NULL,
      supersedes_id = NULL, superseded_by_id = NULL WHERE class_id = ${item.classId}
  `);
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM credential_status_allocations
    WHERE issuance_id IN (SELECT id FROM badge_issuances WHERE class_id = ${item.classId})
  `);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM credential_status_lists`);
  await prisma.auditLog.deleteMany({ where: { actorUserId: item.adminId } });
  await prisma.badgeIssuance.deleteMany({ where: { classId: item.classId } });
  await prisma.badgeTemplate.deleteMany({ where: { classId: item.classId } });
  await prisma.student.deleteMany({ where: { id: item.studentId } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.signingKey.deleteMany();
  await prisma.user.deleteMany({ where: { id: item.adminId } });
}

async function dropAuditFailureTrigger() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${auditFailureTrigger}`);
}

async function failSigningKeyAudits() {
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER ${auditFailureTrigger} BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Phase 8 signing audit failure'`,
  );
}

beforeEach(async () => {
  await dropAuditFailureTrigger();
  fixture = await createFixture();
});

afterEach(async () => {
  await dropAuditFailureTrigger();
  await cleanFixture(fixture);
});

describe("signing key persistence against MariaDB", () => {
  it("has no private, secret, or seed columns in the new persistence tables", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ tableName: string; columnName: string }>
    >(Prisma.sql`
      SELECT table_name AS tableName, column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name IN (
          'signing_keys',
          'credential_status_lists',
          'credential_status_allocations',
          'credential_replacement_guards'
        )
    `);

    expect(columns.length).toBeGreaterThan(0);
    expect(columns.filter((column) => /private|secret|seed/iu.test(column.columnName))).toEqual([]);
  });

  it("requires an active Administrator actor", async () => {
    await expect(registerPublicSigningKey(keyInput("missing-actor"), undefined)).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      registerPublicSigningKey(keyInput("faculty"), { ...fixture.admin, role: "FACULTY" }),
    ).rejects.toThrow("Administrator access required");
    await expect(prisma.signingKey.count()).resolves.toBe(0);
  });

  it("rejects missing and FACULTY actors for every signing-key lifecycle action", async () => {
    const key = await registerPublicSigningKey(keyInput("authorization"), fixture.admin);
    const faculty = { ...fixture.admin, role: "FACULTY" as const };
    const actions = [activateSigningKey, retireSigningKey, markSigningKeyCompromised];

    for (const action of actions) {
      await expect(action(key.id, undefined)).rejects.toThrow("Authentication required");
      await expect(action(key.id, faculty)).rejects.toThrow("Administrator access required");
    }
  });

  it("rejects suspended, deleted, and role-downgraded Administrators from lifecycle actions", async () => {
    const key = await registerPublicSigningKey(keyInput("current-authorization"), fixture.admin);
    await prisma.user.update({ where: { id: fixture.adminId }, data: { status: "SUSPENDED" } });
    await expect(activateSigningKey(key.id, fixture.admin)).rejects.toThrow(
      "Administrator account is no longer active",
    );

    await prisma.user.update({
      where: { id: fixture.adminId },
      data: { status: "ACTIVE", deletedAt: new Date() },
    });
    await expect(retireSigningKey(key.id, fixture.admin)).rejects.toThrow(
      "Administrator account is no longer active",
    );

    await prisma.user.update({
      where: { id: fixture.adminId },
      data: { deletedAt: null, role: "FACULTY" },
    });
    await expect(markSigningKeyCompromised(key.id, fixture.admin)).rejects.toThrow(
      "Administrator account is no longer active",
    );
  });

  it("rejects malformed and secret Ed25519 multikey material before persistence", async () => {
    const ephemeralKey = await Ed25519Multikey.generate();
    const ephemeral = await ephemeralKey.export({ publicKey: true, secretKey: true });
    const privateMaterial = ephemeral.secretKeyMultibase;
    if (!privateMaterial) throw new Error("Test fixture did not produce secret key material");

    await expect(
      registerPublicSigningKey(
        { ...keyInput("malformed-multikey"), publicMultikey: "-----BEGIN PRIVATE KEY-----" },
        fixture.admin,
      ),
    ).rejects.toThrow("Public Ed25519 multikey is invalid");
    await expect(
      registerPublicSigningKey(
        { ...keyInput("secret-multikey"), publicMultikey: privateMaterial },
        fixture.admin,
      ),
    ).rejects.toThrow("Public Ed25519 multikey is invalid");
    await expect(prisma.signingKey.count()).resolves.toBe(0);
  });

  it("registers a public key and each lifecycle mutation appends exactly one audit in its transaction", async () => {
    const registered = await registerPublicSigningKey(keyInput("lifecycle"), fixture.admin);
    expect(registered.status).toBe("RETIRED");
    await activateSigningKey(registered.id, fixture.admin);
    await retireSigningKey(registered.id, fixture.admin);
    await markSigningKeyCompromised(registered.id, fixture.admin);

    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: fixture.adminId, entityType: "SigningKey", entityId: registered.id },
      select: { action: true },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "signing-key.activated",
      "signing-key.compromised",
      "signing-key.registered",
      "signing-key.retired",
    ]);
  });

  it("enforces unique fingerprints and verification-method URLs", async () => {
    const registered = await registerPublicSigningKey(keyInput("unique"), fixture.admin);
    const duplicateUrl = {
      ...keyInput("duplicate-url"),
      verificationMethodUrl: registered.verificationMethodUrl,
    };
    const duplicateFingerprint = {
      ...keyInput("duplicate-fingerprint"),
      fingerprint: registered.fingerprint,
    };
    await expect(registerPublicSigningKey(duplicateUrl, fixture.admin)).rejects.toThrow();
    await expect(registerPublicSigningKey(duplicateFingerprint, fixture.admin)).rejects.toThrow();
  });

  it("rolls back every signing-key lifecycle state transition when its audit insert fails", async () => {
    await failSigningKeyAudits();
    await expect(
      registerPublicSigningKey(keyInput("audit-register"), fixture.admin),
    ).rejects.toThrow();
    await expect(prisma.signingKey.count()).resolves.toBe(0);

    await dropAuditFailureTrigger();
    const activationTarget = await registerPublicSigningKey(
      keyInput("audit-activation"),
      fixture.admin,
    );
    await failSigningKeyAudits();
    await expect(activateSigningKey(activationTarget.id, fixture.admin)).rejects.toThrow();
    await expect(
      prisma.signingKey.findUniqueOrThrow({ where: { id: activationTarget.id } }),
    ).resolves.toMatchObject({ status: "RETIRED", activatedAt: null });

    await dropAuditFailureTrigger();
    const registered = await registerPublicSigningKey(keyInput("audit-lifecycle"), fixture.admin);
    await activateSigningKey(registered.id, fixture.admin);
    await failSigningKeyAudits();

    await expect(retireSigningKey(registered.id, fixture.admin)).rejects.toThrow();
    await expect(markSigningKeyCompromised(registered.id, fixture.admin)).rejects.toThrow();
    await expect(
      prisma.signingKey.findUniqueOrThrow({ where: { id: registered.id } }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
      retiredAt: null,
      compromisedAt: null,
    });
  });

  it("serializes concurrent activation to exactly one active signing key", async () => {
    const [first, second] = await Promise.all([
      registerPublicSigningKey(keyInput("first"), fixture.admin),
      registerPublicSigningKey(keyInput("second"), fixture.admin),
    ]);
    await Promise.all([
      activateSigningKey(first.id, fixture.admin),
      activateSigningKey(second.id, fixture.admin),
    ]);

    await expect(prisma.signingKey.count({ where: { status: "ACTIVE" } })).resolves.toBe(1);
  });

  it("never reactivates a compromised key", async () => {
    const key = await registerPublicSigningKey(keyInput("compromised"), fixture.admin);
    await markSigningKeyCompromised(key.id, fixture.admin);

    await expect(retireSigningKey(key.id, fixture.admin)).rejects.toThrow(
      "Signing key is unavailable",
    );
    await expect(activateSigningKey(key.id, fixture.admin)).rejects.toThrow(
      "Signing key is unavailable",
    );
    await expect(
      prisma.signingKey.update({ where: { id: key.id }, data: { status: "RETIRED" } }),
    ).rejects.toThrow();
    await expect(
      prisma.signingKey.findUniqueOrThrow({ where: { id: key.id } }),
    ).resolves.toMatchObject({
      status: "COMPROMISED",
    });
  });

  it("restricts deleting a signing key that an issuance references", async () => {
    const key = await registerPublicSigningKey(keyInput("referenced"), fixture.admin);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE badge_issuances SET signing_key_id = ${key.id} WHERE id = ${fixture.issuanceId}
    `);
    await expect(prisma.signingKey.delete({ where: { id: key.id } })).rejects.toThrow();
  });
});
