import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import {
  archiveBadgeDefinition,
  reviewBadgeDefinition,
} from "@/modules/badge-library/services/badge-library-service";
import { assignBadgeToClass } from "@/modules/badge-library/services/class-badge-assignment-service";
import { createClass } from "@/modules/classes/services/class-service";
import { createCourse, mapClassToCourse } from "@/modules/catalog/services/course-service";
import type { Actor } from "@/modules/identity/types";
import { issueBadgeForTest } from "@/modules/issuance/services/issuance-service";
import type { SignedIssuanceSigner } from "@/modules/issuance/services/signed-issuance-service";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import { prisma } from "@/platform/db/prisma";

const issuerUrl = "https://issuer-seven.example.test/";
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://badges.example.test";

function id(label: string) {
  return `stage7-${label}-${crypto.randomUUID()}`;
}

function signer(verificationMethodUrl: string): SignedIssuanceSigner {
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

type Fixture = {
  admin: Actor;
  facultyA: Actor;
  facultyB: Actor;
  courseId: string;
  classA: string;
  classB: string;
  studentA: string;
  studentB: string;
  definitionId: string;
  versionId: string;
  templateA: string;
  templateB: string;
  keyId: string;
  listId: string;
  keyUrl: string;
};

let fixture: Fixture;
let extraStudents: string[] = [];

async function subject(label: string, role: "ADMIN" | "FACULTY") {
  const userId = id(label);
  const created = await prisma.user.create({
    data: {
      id: userId,
      name: label,
      email: `${userId}@example.test`,
      normalizedEmail: `${userId}@example.test`,
      passwordHash: "not-used-by-integration-test",
      role,
      status: "ACTIVE",
    },
  });
  return { id: created.id, name: created.name, email: created.email, role } satisfies Actor;
}

async function setup(): Promise<Fixture> {
  const admin = await subject("stage7-admin", "ADMIN");
  const facultyA = await subject("stage7-faculty-a", "FACULTY");
  const facultyB = await subject("stage7-faculty-b", "FACULTY");
  const course = await createCourse(admin, {
    code: `S7-${crypto.randomUUID().slice(0, 6)}`,
    title: "Application Development",
    description: "Shared badge integration course",
    programs: "BS Computer Science",
  });
  const classARecord = await createClass(facultyA, {
    courseCode: course.code,
    title: course.title,
    section: "1",
    term: "First Semester",
    academicYear: "2026-2027",
    description: "",
  });
  const classBRecord = await createClass(facultyB, {
    courseCode: course.code,
    title: course.title,
    section: "2",
    term: "First Semester",
    academicYear: "2026-2027",
    description: "",
  });
  await mapClassToCourse(facultyA, classARecord.id, course.id);
  await mapClassToCourse(facultyB, classBRecord.id, course.id);

  const studentA = await prisma.student.create({
    data: {
      id: id("student-a"),
      studentNumber: id("number-a"),
      firstName: "Section",
      lastName: "One",
      email: `${id("student-a")}@example.test`,
    },
  });
  const studentB = await prisma.student.create({
    data: {
      id: id("student-b"),
      studentNumber: id("number-b"),
      firstName: "Section",
      lastName: "Two",
      email: `${id("student-b")}@example.test`,
    },
  });
  await prisma.classStudent.create({
    data: { classId: classARecord.id, studentId: studentA.id, enrollmentStatus: "ACTIVE" },
  });
  await prisma.classStudent.create({
    data: { classId: classBRecord.id, studentId: studentB.id, enrollmentStatus: "ACTIVE" },
  });

  const definition = await prisma.badgeDefinition.create({
    data: {
      id: id("definition"),
      courseId: course.id,
      name: "Prelim Skills",
      createdByUserId: facultyA.id,
      status: "PENDING_APPROVAL",
    },
  });
  const version = await prisma.badgeDefinitionVersion.create({
    data: {
      id: id("version"),
      badgeDefinitionId: definition.id,
      version: 1,
      name: "Prelim Skills",
      description: "Foundational application development skills",
      competencies: "Debugging, testing, version control",
      assessmentCriteria: "Build and test a working application",
      gradingPeriod: "Prelim",
      issuingInstitution: "Holy Angel University — School of Computing",
      validityDays: 365,
      imagePath: "badges/stage7-prelim.png",
      criteria: "Build and test a working application",
      metadataJson: { skills: ["Debugging", "Testing"] },
      status: "PENDING_APPROVAL",
      createdByUserId: facultyA.id,
    },
  });
  await reviewBadgeDefinition(admin, version.id, "APPROVED", "Approved for integration test");

  await assignBadgeToClass(facultyA, classARecord.id, version.id);
  await assignBadgeToClass(facultyB, classBRecord.id, version.id);
  const templates = await prisma.badgeTemplate.findMany({
    where: { sharedDefinitionVersionId: version.id },
    orderBy: { classId: "asc" },
  });
  const templateA = templates.find((template) => template.classId === classARecord.id);
  const templateB = templates.find((template) => template.classId === classBRecord.id);
  if (!templateA || !templateB) throw new Error("Shared templates were not materialized");

  await prisma.systemSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      issuerName: "Stage 7 Integration Issuer",
      issuerUrl,
      issuerLogoPath: "/images/issuer-one.png",
      sharingEnabled: true,
    },
    update: { issuerName: "Stage 7 Integration Issuer", issuerUrl },
  });
  const keyId = id("key");
  const keyUrl = `${issuerUrl}keys/${id("verification")}`;
  await prisma.signingKey.create({
    data: {
      id: keyId,
      verificationMethodUrl: keyUrl,
      controllerUrl: issuerUrl,
      algorithm: "Ed25519",
      cryptosuite: "eddsa-rdfc-2022",
      publicMultikey: `z${crypto.randomUUID().replaceAll("-", "")}`,
      fingerprint: id("fingerprint"),
      status: "ACTIVE",
      activatedAt: new Date("2026-08-25T00:00:00.000Z"),
    },
  });
  const listId = id("list");
  await prisma.credentialStatusList.create({
    data: {
      id: listId,
      publicUrl: `https://badges.example.test/api/status-lists/${listId}`,
      purpose: "revocation",
      capacity: 131_072,
    },
  });

  return {
    admin,
    facultyA,
    facultyB,
    courseId: course.id,
    classA: classARecord.id,
    classB: classBRecord.id,
    studentA: studentA.id,
    studentB: studentB.id,
    definitionId: definition.id,
    versionId: version.id,
    templateA: templateA.id,
    templateB: templateB.id,
    keyId,
    listId,
    keyUrl,
  };
}

async function safe(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch {
    // Disposable integration database; historical triggers may block destructive cleanup.
  }
}

async function cleanup(item: Fixture) {
  const classIds = [item.classA, item.classB];
  await safe(() =>
    prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [item.admin.id, item.facultyA.id, item.facultyB.id] } },
    }),
  );
  await safe(() =>
    prisma.notificationDelivery.deleteMany({ where: { issuance: { classId: { in: classIds } } } }),
  );
  await safe(() =>
    prisma.badgeIssuance.updateMany({
      where: { classId: { in: classIds } },
      data: { signedCredentialJson: Prisma.DbNull, signingKeyId: null, serializerVersion: null },
    }),
  );
  await safe(() =>
    prisma.credentialStatusAllocation.deleteMany({
      where: { issuance: { classId: { in: classIds } } },
    }),
  );
  await safe(() => prisma.badgeIssuance.deleteMany({ where: { classId: { in: classIds } } }));
  await safe(() =>
    prisma.classBadgeAssignment.deleteMany({ where: { classId: { in: classIds } } }),
  );
  await safe(() => prisma.badgeTemplate.deleteMany({ where: { classId: { in: classIds } } }));
  await safe(() =>
    prisma.badgeDefinitionReview.deleteMany({
      where: { badgeDefinitionVersion: { badgeDefinitionId: item.definitionId } },
    }),
  );
  await safe(() =>
    prisma.badgeDefinitionVersion.deleteMany({ where: { badgeDefinitionId: item.definitionId } }),
  );
  await safe(() => prisma.badgeDefinition.deleteMany({ where: { id: item.definitionId } }));
  await safe(() => prisma.classStudent.deleteMany({ where: { classId: { in: classIds } } }));
  await safe(() => prisma.class.deleteMany({ where: { id: { in: classIds } } }));
  await safe(() =>
    prisma.student.deleteMany({
      where: { id: { in: [item.studentA, item.studentB, ...extraStudents] } },
    }),
  );
  await safe(() => prisma.credentialStatusList.deleteMany({ where: { id: item.listId } }));
  await safe(() => prisma.signingKey.deleteMany({ where: { id: item.keyId } }));
  await safe(() =>
    prisma.user.deleteMany({
      where: { id: { in: [item.admin.id, item.facultyA.id, item.facultyB.id] } },
    }),
  );
  await safe(() => prisma.course.deleteMany({ where: { id: item.courseId } }));
  await safe(() => prisma.systemSetting.deleteMany({ where: { id: "default" } }));
}

beforeEach(async () => {
  extraStudents = [];
  fixture = await setup();
});

afterEach(async () => {
  if (fixture) await cleanup(fixture);
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

describe("shared badge assignment and issuance", () => {
  it("lets two faculty issue the same approved definition to their own sections", async () => {
    const resultA = await issueBadgeForTest(
      fixture.facultyA,
      {
        classId: fixture.classA,
        badgeTemplateId: fixture.templateA,
        studentId: fixture.studentA,
      },
      signer(fixture.keyUrl),
    );
    const resultB = await issueBadgeForTest(
      fixture.facultyB,
      {
        classId: fixture.classB,
        badgeTemplateId: fixture.templateB,
        studentId: fixture.studentB,
      },
      signer(fixture.keyUrl),
    );

    expect(resultA.publicId).not.toEqual(resultB.publicId);

    const issuances = await prisma.badgeIssuance.findMany({
      where: { classId: { in: [fixture.classA, fixture.classB] } },
      include: { badgeTemplate: true },
    });
    expect(issuances).toHaveLength(2);
    expect(
      issuances.every(
        (issuance) => issuance.badgeTemplate.sharedDefinitionVersionId === fixture.versionId,
      ),
    ).toBe(true);
    expect(issuances.every((issuance) => issuance.signedCredentialJson !== null)).toBe(true);
  });

  it("prevents faculty from issuing to another section and blocks duplicate issuance", async () => {
    const first = await issueBadgeForTest(
      fixture.facultyA,
      {
        classId: fixture.classA,
        badgeTemplateId: fixture.templateA,
        studentId: fixture.studentA,
      },
      signer(fixture.keyUrl),
    );

    await expect(
      issueBadgeForTest(
        fixture.facultyB,
        {
          classId: fixture.classA,
          badgeTemplateId: fixture.templateA,
          studentId: fixture.studentA,
        },
        signer(fixture.keyUrl),
      ),
    ).rejects.toThrow();

    const duplicate = await issueBadgeForTest(
      fixture.facultyA,
      {
        classId: fixture.classA,
        badgeTemplateId: fixture.templateA,
        studentId: fixture.studentA,
      },
      signer(fixture.keyUrl),
    );
    expect(duplicate.alreadyIssued).toBe(true);
    expect(duplicate.issuanceId).toBe(first.issuanceId);
  });

  it("keeps historical credentials intact when a new version is approved", async () => {
    const issued = await issueBadgeForTest(
      fixture.facultyA,
      {
        classId: fixture.classA,
        badgeTemplateId: fixture.templateA,
        studentId: fixture.studentA,
      },
      signer(fixture.keyUrl),
    );
    const before = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: issued.issuanceId },
      select: { signedCredentialJson: true, achievementSnapshotJson: true, publicId: true },
    });

    const nextVersion = await prisma.badgeDefinitionVersion.create({
      data: {
        id: id("version"),
        badgeDefinitionId: fixture.definitionId,
        version: 2,
        name: "Prelim Skills",
        description: "Updated description for version two",
        competencies: "Updated competencies",
        assessmentCriteria: "Updated assessment criteria",
        issuingInstitution: "Holy Angel University — School of Computing",
        imagePath: "badges/stage7-prelim-v2.png",
        criteria: "Updated assessment criteria",
        status: "PENDING_APPROVAL",
        createdByUserId: fixture.facultyA.id,
      },
    });
    await reviewBadgeDefinition(fixture.admin, nextVersion.id, "APPROVED");

    const after = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: issued.issuanceId },
      select: { signedCredentialJson: true, achievementSnapshotJson: true, publicId: true },
    });
    expect(after).toEqual(before);
    expect(after.publicId).toBe(issued.publicId);

    const definition = await prisma.badgeDefinition.findUniqueOrThrow({
      where: { id: fixture.definitionId },
      select: { status: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    expect(definition.status).toBe("APPROVED");
    expect(definition.versions[0]?.version).toBe(2);
  });

  it("preserves historical credentials and blocks new issuance after archival", async () => {
    const issued = await issueBadgeForTest(
      fixture.facultyB,
      {
        classId: fixture.classB,
        badgeTemplateId: fixture.templateB,
        studentId: fixture.studentB,
      },
      signer(fixture.keyUrl),
    );
    const before = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: issued.issuanceId },
      select: { signedCredentialJson: true, status: true, publicId: true },
    });
    expect(before.status).toBe("ACTIVE");
    expect(before.signedCredentialJson).not.toBeNull();

    const extraStudentId = id("student-extra");
    extraStudents.push(extraStudentId);
    await prisma.student.create({
      data: {
        id: extraStudentId,
        studentNumber: id("number-extra"),
        firstName: "Extra",
        lastName: "Student",
        email: `${extraStudentId}@example.test`,
      },
    });
    await prisma.classStudent.create({
      data: { classId: fixture.classB, studentId: extraStudentId, enrollmentStatus: "ACTIVE" },
    });

    await archiveBadgeDefinition(fixture.admin, fixture.definitionId, "Integration archival");
    const after = await prisma.badgeIssuance.findUniqueOrThrow({
      where: { id: issued.issuanceId },
      select: { signedCredentialJson: true, status: true, publicId: true },
    });
    expect(after).toEqual(before);

    await expect(
      issueBadgeForTest(
        fixture.facultyB,
        {
          classId: fixture.classB,
          badgeTemplateId: fixture.templateB,
          studentId: extraStudentId,
        },
        signer(fixture.keyUrl),
      ),
    ).rejects.toThrow();
  });
});
