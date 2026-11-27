import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { commitImportPreview, createImportPreview } from "./import-service";

const prefix = "roster-import-integration-";
const facultyId = `${prefix}faculty`;
const nonOwnerId = `${prefix}non-owner`;
const classId = `${prefix}class`;
const admin: Actor = {
  id: `${prefix}admin`,
  name: "Import Admin",
  email: "import-admin@example.test",
  role: "ADMIN",
};
const faculty: Actor = {
  id: facultyId,
  name: "Import Faculty",
  email: "import-faculty@example.test",
  role: "FACULTY",
};
const nonOwner: Actor = {
  id: nonOwnerId,
  name: "Import Non Owner",
  email: "import-non-owner@example.test",
  role: "FACULTY",
};
const mapping = { studentNumber: 0, firstName: 1, lastName: 2, email: 3 };

function rows(studentNumber = `${prefix}student`, firstName = "Ada") {
  return [[studentNumber, firstName, "Lovelace", `${studentNumber}@example.test`]];
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [facultyId, nonOwnerId] } } });
  await prisma.rosterImportPreview.deleteMany({ where: { classId } });
  await prisma.classStudent.deleteMany({ where: { classId } });
  await prisma.student.deleteMany({ where: { studentNumber: { startsWith: prefix } } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: { in: [facultyId, nonOwnerId] } } });
}

beforeEach(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: facultyId,
        name: faculty.name,
        email: faculty.email,
        normalizedEmail: faculty.email,
        passwordHash: "not-used",
        role: "FACULTY",
        status: "ACTIVE",
      },
      {
        id: nonOwnerId,
        name: nonOwner.name,
        email: nonOwner.email,
        normalizedEmail: nonOwner.email,
        passwordHash: "not-used",
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: facultyId,
      courseCode: "IMPORT-101",
      title: "Roster Import Integration",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
});

afterEach(cleanup);

describe("roster import service", () => {
  it("previews without modifying students or memberships and records an audit event", async () => {
    const preview = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);

    expect(preview.errorCount).toBe(0);
    expect(preview.rows[0]).toMatchObject({ studentNumber: `${prefix}student`, errors: [] });
    await expect(
      prisma.student.count({ where: { studentNumber: `${prefix}student` } }),
    ).resolves.toBe(0);
    await expect(prisma.classStudent.count({ where: { classId } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: facultyId, action: "roster.import_previewed" },
      }),
    ).resolves.toBe(1);
  });

  it("commits valid rows once, records the audit event, and rejects repeated commits", async () => {
    const preview = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);
    const result = await commitImportPreview(faculty, preview.id);

    expect(result).toEqual({ classId, importedCount: 1 });
    const student = await prisma.student.findUnique({
      where: { studentNumber: `${prefix}student` },
    });
    expect(student).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
    await expect(prisma.classStudent.count({ where: { classId } })).resolves.toBe(1);
    await expect(
      prisma.rosterImportPreview.findUnique({ where: { id: preview.id } }),
    ).resolves.toMatchObject({ status: "COMMITTED" });
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: facultyId, action: "roster.import_committed" },
      }),
    ).resolves.toBe(1);

    await expect(commitImportPreview(faculty, preview.id)).rejects.toThrow(
      "Import preview is no longer available",
    );
    await expect(prisma.classStudent.count({ where: { classId } })).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: facultyId, action: "roster.import_committed" },
      }),
    ).resolves.toBe(1);
  });

  it("prevents concurrent commits of the same preview from creating duplicate memberships", async () => {
    const preview = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);
    const results = await Promise.allSettled([
      commitImportPreview(faculty, preview.id),
      commitImportPreview(faculty, preview.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.classStudent.count({ where: { classId } })).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: facultyId, action: "roster.import_committed" },
      }),
    ).resolves.toBe(1);
  });

  it("rejects conflicting identities and already-enrolled students at preview time", async () => {
    const first = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);
    await commitImportPreview(faculty, first.id);

    const enrolled = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);
    expect(enrolled.rows[0]?.errors).toContain("Already enrolled in this class");
    await expect(commitImportPreview(faculty, enrolled.id)).rejects.toThrow(
      "Resolve all validation errors before commit",
    );

    const changed = await createImportPreview(
      faculty,
      classId,
      "roster.csv",
      rows(`${prefix}student`, "Grace"),
      mapping,
    );
    expect(changed.rows[0]?.errors).toContain(
      "Student number exists with different identity details",
    );
  });

  it("requires the owning faculty member to preview or commit", async () => {
    await expect(
      createImportPreview(admin, classId, "roster.csv", rows(), mapping),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createImportPreview(nonOwner, classId, "roster.csv", rows(), mapping),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const preview = await createImportPreview(faculty, classId, "roster.csv", rows(), mapping);
    await expect(commitImportPreview(nonOwner, preview.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});
