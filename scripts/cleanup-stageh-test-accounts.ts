import { readFile } from "node:fs/promises";

import { prisma } from "../src/platform/db/prisma";

type CredentialsFile = {
  scope: "STAGEH";
  admin: { email: string; userId: string; password: string };
  faculty: { email: string; userId: string; password: string };
  student: { email: string; userId: string; studentId: string; password: string };
  class: { id: string; courseCode: string };
};

async function main() {
  if (process.env.STAGEH_CLEANUP_APPROVED !== "YES") {
    throw new Error("Set STAGEH_CLEANUP_APPROVED=YES only after cleanup approval");
  }
  const path = process.env.STAGEH_CREDENTIAL_FILE;
  if (!path) throw new Error("STAGEH_CREDENTIAL_FILE is required");
  const credentials = JSON.parse(await readFile(path, "utf8")) as CredentialsFile;
  if (credentials.scope !== "STAGEH")
    throw new Error("Credentials file is not a STAGEH scope file");

  const targets = [
    { expectedRole: "ADMIN" as const, ...credentials.admin },
    { expectedRole: "FACULTY" as const, ...credentials.faculty },
    { expectedRole: "STUDENT" as const, ...credentials.student },
  ];
  const results: Array<{ email: string; role: string; action: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (const target of targets) {
      const user = await tx.user.findUnique({
        where: { id: target.userId },
        select: { id: true, email: true, role: true, status: true },
      });
      if (!user || user.email.toLowerCase() !== target.email.toLowerCase()) {
        throw new Error(`STAGEH identity mismatch for ${target.email}; cleanup aborted`);
      }
      if (user.role !== target.expectedRole) {
        throw new Error(`Unexpected role for ${target.email}; cleanup aborted`);
      }
      if (user.status === "SUSPENDED" || user.status === "DELETED") {
        results.push({ email: target.email, role: user.role, action: "already-disabled" });
        continue;
      }
      await tx.user.update({
        where: { id: user.id },
        data: { status: "SUSPENDED", sessionVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "stageh.test_account_disabled",
          entityType: "User",
          entityId: user.id,
          contextJson: { source: "stageh-cleanup", role: user.role },
        },
      });
      results.push({ email: target.email, role: user.role, action: "suspended" });
    }

    const classRow = await tx.class.findUnique({
      where: { id: credentials.class.id },
      select: { id: true, courseCode: true, status: true },
    });
    if (!classRow || classRow.courseCode !== credentials.class.courseCode) {
      throw new Error("STAGEH class mismatch; cleanup aborted");
    }
    if (classRow.status !== "ARCHIVED") {
      await tx.class.update({ where: { id: classRow.id }, data: { status: "ARCHIVED" } });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "stageh.test_class_archived",
          entityType: "Class",
          entityId: classRow.id,
          contextJson: { source: "stageh-cleanup", courseCode: classRow.courseCode },
        },
      });
    }
  });

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        scope: "STAGEH",
        accounts: results,
        class: {
          id: credentials.class.id,
          courseCode: credentials.class.courseCode,
          status: "ARCHIVED",
        },
        deleted: false,
        emailSent: false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGEH cleanup failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
