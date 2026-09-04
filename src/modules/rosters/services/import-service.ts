import "server-only";
import { Prisma } from "@prisma/client";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";
import { requireClassOwner } from "@/modules/identity/policies/authorization";
import { validateImportRows, type ValidatedImportRow } from "./roster-validation";

async function owned(actor: Actor, classId: string) {
  const c = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  requireClassOwner(actor, c.ownerUserId);
}
export async function createImportPreview(
  actor: Actor,
  classId: string,
  filename: string,
  rows: string[][],
  mapping: Record<"studentNumber" | "firstName" | "lastName" | "email", number>,
) {
  await owned(actor, classId);
  const validated = validateImportRows(
    rows.map((r) => ({
      studentNumber: r[mapping.studentNumber] ?? "",
      firstName: r[mapping.firstName] ?? "",
      lastName: r[mapping.lastName] ?? "",
      email: r[mapping.email] ?? "",
    })),
  );
  const numbers = validated.map((r) => r.studentNumber).filter(Boolean);
  const [existing, knownStudents] = await Promise.all([
    prisma.classStudent.findMany({
      where: { classId, student: { studentNumber: { in: numbers } }, enrollmentStatus: "ACTIVE" },
      include: { student: { select: { studentNumber: true } } },
    }),
    prisma.student.findMany({
      where: { studentNumber: { in: numbers } },
      select: { studentNumber: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  const enrolled = new Set(existing.map((e) => e.student.studentNumber));
  const known = new Map(knownStudents.map((s) => [s.studentNumber, s]));
  const finalRows = validated.map((r) => {
    const current = known.get(r.studentNumber);
    const errors = [...r.errors];
    if (enrolled.has(r.studentNumber)) errors.push("Already enrolled in this class");
    if (
      current &&
      (current.firstName !== r.firstName ||
        current.lastName !== r.lastName ||
        current.email !== r.email)
    )
      errors.push("Student number exists with different identity details");
    return { ...r, errors };
  });
  const preview = await prisma.rosterImportPreview.create({
    data: {
      classId,
      actorUserId: actor.id,
      sourceFilename: filename,
      rowsJson: finalRows as unknown as Prisma.InputJsonValue,
      validCount: finalRows.filter((r) => !r.errors.length).length,
      errorCount: finalRows.filter((r) => r.errors.length > 0).length,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "roster.import_previewed",
      entityType: "RosterImportPreview",
      entityId: preview.id,
      contextJson: { classId, validCount: preview.validCount, errorCount: preview.errorCount },
    },
  });
  return { ...preview, rows: finalRows };
}
export async function getImportPreview(actor: Actor, id: string) {
  const p = await prisma.rosterImportPreview.findUniqueOrThrow({ where: { id } });
  await owned(actor, p.classId);
  if (p.actorUserId !== actor.id) throw new Error("Import preview belongs to another user");
  return { ...p, rows: p.rowsJson as unknown as ValidatedImportRow[] };
}
export async function commitImportPreview(actor: Actor, id: string) {
  const preview = await getImportPreview(actor, id);
  if (preview.status !== "READY" || preview.expiresAt <= new Date())
    throw new Error("Import preview is no longer available");
  if (preview.errorCount) throw new Error("Resolve all validation errors before commit");
  return prisma.$transaction(async (tx) => {
    for (const row of preview.rows) {
      const student = await tx.student.upsert({
        where: { studentNumber: row.studentNumber },
        create: {
          studentNumber: row.studentNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
        },
        update: {},
      });
      await tx.classStudent.upsert({
        where: { classId_studentId: { classId: preview.classId, studentId: student.id } },
        create: { classId: preview.classId, studentId: student.id },
        update: { enrollmentStatus: "ACTIVE" },
      });
    }
    await tx.rosterImportPreview.update({
      where: { id },
      data: { status: "COMMITTED", committedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "roster.import_committed",
        entityType: "RosterImportPreview",
        entityId: id,
        contextJson: { classId: preview.classId, count: preview.validCount },
      },
    });
    return preview.validCount;
  });
}
