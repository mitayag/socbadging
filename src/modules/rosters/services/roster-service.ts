import "server-only";
import { z } from "zod";
import { requireAuthenticated, requireClassOwner } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const studentSchema = z.object({
  studentNumber: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(191),
  lastName: z.string().trim().min(1).max(191),
  email: z.email().transform((v) => v.trim().toLowerCase()),
});
async function owned(actor: Actor, classId: string) {
  const item = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  return requireClassOwner(actor, item.ownerUserId);
}

export async function getClassWorkspace(actor: Actor, classId: string) {
  requireAuthenticated(actor);
  const item = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    include: { owner: { select: { name: true, email: true } } },
  });
  if (actor.role === "FACULTY") requireClassOwner(actor, item.ownerUserId);
  return item;
}
export async function listRoster(
  actor: Actor,
  classId: string,
  query = "",
  status?: "ACTIVE" | "REMOVED",
  page = 1,
) {
  await getClassWorkspace(actor, classId);
  const rows = await prisma.classStudent.findMany({
    where: {
      classId,
      enrollmentStatus: status,
      ...(query
        ? {
            student: {
              OR: [
                { studentNumber: { contains: query } },
                { firstName: { contains: query } },
                { lastName: { contains: query } },
                { email: { contains: query } },
              ],
            },
          }
        : {}),
    },
    include: { student: true },
    orderBy: { student: { lastName: "asc" } },
    skip: (Math.max(1, page) - 1) * 20,
    take: 21,
  });
  return { items: rows.slice(0, 20), hasNext: rows.length > 20 };
}
export async function addStudent(actor: Actor, classId: string, raw: unknown) {
  await owned(actor, classId);
  const input = studentSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({ where: { studentNumber: input.studentNumber } });
    if (
      existing &&
      (existing.firstName !== input.firstName ||
        existing.lastName !== input.lastName ||
        existing.email !== input.email)
    )
      throw new Error("Student number already exists with different identity details");
    const student = await tx.student.upsert({
      where: { studentNumber: input.studentNumber },
      create: input,
      update: {},
    });
    await tx.classStudent.upsert({
      where: { classId_studentId: { classId, studentId: student.id } },
      create: { classId, studentId: student.id },
      update: { enrollmentStatus: "ACTIVE" },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "roster.student_added",
        entityType: "Class",
        entityId: classId,
        contextJson: { studentId: student.id },
      },
    });
    return student;
  });
}
export async function editStudent(actor: Actor, classId: string, studentId: string, raw: unknown) {
  await owned(actor, classId);
  const input = studentSchema.parse(raw);
  const membership = await prisma.classStudent.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!membership) throw new Error("Student is not enrolled in this class");
  const shared = await prisma.classStudent.count({
    where: { studentId, class: { ownerUserId: { not: actor.id } } },
  });
  if (shared) throw new Error("Shared student identity must be updated by an administrator");
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.update({ where: { id: studentId }, data: input });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "roster.student_updated",
        entityType: "Student",
        entityId: studentId,
        contextJson: { classId },
      },
    });
    return student;
  });
}
export async function setEnrollmentStatus(
  actor: Actor,
  classId: string,
  studentId: string,
  status: "ACTIVE" | "REMOVED",
) {
  await owned(actor, classId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.classStudent.update({
      where: { classId_studentId: { classId, studentId } },
      data: { enrollmentStatus: status },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "roster.student_restored" : "roster.student_removed",
        entityType: "Student",
        entityId: studentId,
        contextJson: { classId },
      },
    });
    return item;
  });
}
