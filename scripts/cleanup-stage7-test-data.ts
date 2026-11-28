/**
 * Stage 7 Release 1D — archive isolated test data after production acceptance.
 * Never deletes historical credentials, audit records, users or classes.
 */
import { readFileSync } from "node:fs";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const TEST_EMAILS = [
  "stage7.test.admin@hausoc.org",
  "stage7.test.faculty.a@hausoc.org",
  "stage7.test.faculty.b@hausoc.org",
  "stage7.test.student.a@hausoc.org",
  "stage7.test.student.b@hausoc.org",
].map((email) => email.toLowerCase());

function databaseUrl() {
  let value = "";
  try {
    value = readFileSync("/run/secrets/database_url", "utf8").trim();
  } catch {
    // fall through
  }
  if (!value) value = process.env.DATABASE_URL?.trim() ?? "";
  if (!value) throw new Error("DATABASE_URL or /run/secrets/database_url is required");
  return new URL(value);
}

function client() {
  const url = databaseUrl();
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
      connectTimeout: 10_000,
    }),
  });
}

async function main() {
  if (process.env.STAGE7_CLEANUP_APPROVED !== "YES") {
    throw new Error("Set STAGE7_CLEANUP_APPROVED=YES only after acceptance approval");
  }
  const prisma = client();
  try {
    const users = await prisma.user.findMany({
      where: { normalizedEmail: { in: TEST_EMAILS } },
      select: { id: true, email: true, role: true, status: true },
    });
    const userIds = users.map((user) => user.id);
    const classes = await prisma.class.findMany({
      where: { courseCode: "STAGE7-CAP-001" },
      select: { id: true },
    });
    const classIds = classes.map((item) => item.id);
    const definitions = await prisma.badgeDefinition.findMany({
      where: { name: { startsWith: "STAGE7 E2E " } },
      select: { id: true },
    });
    const definitionIds = definitions.map((item) => item.id);
    const assignments = await prisma.classBadgeAssignment.findMany({
      where: {
        OR: [{ classId: { in: classIds } }, { badgeDefinitionId: { in: definitionIds } }],
      },
      select: { id: true, badgeTemplateId: true },
    });
    const templateIds = assignments
      .map((assignment) => assignment.badgeTemplateId)
      .filter((value): value is string => Boolean(value));
    const studentIds = await prisma.studentAccount
      .findMany({ where: { userId: { in: userIds } }, select: { studentId: true } })
      .then((rows) => rows.map((row) => row.studentId));

    const result = await prisma.$transaction(async (tx) => {
      const suspended = await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: "SUSPENDED", sessionVersion: { increment: 1 } },
      });
      const sessions = await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      const resetTokens = await tx.passwordResetToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      const studentTokens = await tx.studentToken.deleteMany({
        where: { studentId: { in: studentIds } },
      });
      const archivedClasses = await tx.class.updateMany({
        where: { id: { in: classIds } },
        data: { status: "ARCHIVED" },
      });
      const archivedCourses = await tx.course.updateMany({
        where: {
          OR: [{ code: "STAGE7-CAP-001" }, { code: { startsWith: "STAGE7-E2E-" } }],
        },
        data: { status: "ARCHIVED" },
      });
      const archivedDefinitions = await tx.badgeDefinition.updateMany({
        where: { id: { in: definitionIds } },
        data: { status: "ARCHIVED" },
      });
      const archivedVersions = await tx.badgeDefinitionVersion.updateMany({
        where: { badgeDefinitionId: { in: definitionIds } },
        data: { status: "ARCHIVED" },
      });
      const archivedAssignments = await tx.classBadgeAssignment.updateMany({
        where: { id: { in: assignments.map((assignment) => assignment.id) } },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      const archivedTemplates = await tx.badgeTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { status: "ARCHIVED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "stage7.test_data_archived",
          entityType: "User",
          entityId: userIds[0] ?? "stage7-cleanup",
          contextJson: {
            source: "stage7-release1d-cleanup",
            usersSuspended: suspended.count,
            sessionsRemoved: sessions.count,
            resetTokensRemoved: resetTokens.count,
            studentTokensRemoved: studentTokens.count,
            classesArchived: archivedClasses.count,
            coursesArchived: archivedCourses.count,
            definitionsArchived: archivedDefinitions.count,
            versionsArchived: archivedVersions.count,
            assignmentsArchived: archivedAssignments.count,
            templatesArchived: archivedTemplates.count,
          },
        },
      });
      return {
        usersSuspended: suspended.count,
        sessionsRemoved: sessions.count,
        resetTokensRemoved: resetTokens.count,
        studentTokensRemoved: studentTokens.count,
        classesArchived: archivedClasses.count,
        coursesArchived: archivedCourses.count,
        definitionsArchived: archivedDefinitions.count,
        versionsArchived: archivedVersions.count,
        assignmentsArchived: archivedAssignments.count,
        templatesArchived: archivedTemplates.count,
      };
    });
    process.stdout.write(`${JSON.stringify({ status: "PASS", ...result }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "STAGE7 cleanup failed"}\n`);
  process.exit(1);
});
