import "server-only";

import { hash } from "argon2";
import { z } from "zod";
import { requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";
import { validateDepartmentAssignment } from "@/modules/departments/services/department-service";

const profileFields = {
  employeeId: z.string().trim().max(100).optional().or(z.literal("")),
  departmentId: z.string().trim().max(191).optional().or(z.literal("")),
  title: z.string().trim().max(191).optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
};
const createSchema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  temporaryPassword: z.string().min(14).max(200),
  ...profileFields,
});
const editSchema = z.object({ name: z.string().trim().min(2).max(191), ...profileFields });

const nullable = (value?: string) => value || null;
const profileScalars = (input: z.infer<typeof editSchema>) => ({
  employeeId: nullable(input.employeeId),
  title: nullable(input.title),
  bio: nullable(input.bio),
});
const profileCreateData = (input: z.infer<typeof editSchema>, departmentId: string | null) => ({
  ...profileScalars(input),
  ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
});
const profileUpdateData = (input: z.infer<typeof editSchema>, departmentId: string | null) => ({
  ...profileScalars(input),
  department: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
});

export async function listFaculty(actor: Actor, query = "", status?: FacultyListStatus, page = 1) {
  requireRole(actor, "ADMIN");
  const rows = await prisma.user.findMany({
    where: {
      role: "FACULTY",
      status: status ?? { in: ["ACTIVE", "SUSPENDED"] },
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
              { facultyProfile: { employeeId: { contains: query } } },
              { facultyProfile: { department: { name: { contains: query } } } },
            ],
          }
        : {}),
    },
    include: { facultyProfile: { include: { department: true } } },
    orderBy: { name: "asc" },
    skip: (Math.max(1, page) - 1) * 20,
    take: 21,
  });
  return { items: rows.slice(0, 20), hasNext: rows.length > 20 };
}

export async function createFaculty(actor: Actor, raw: unknown) {
  requireRole(actor, "ADMIN");
  const input = createSchema.parse(raw);
  const departmentId = await validateDepartmentAssignment(input.departmentId);
  const passwordHash = await hash(input.temporaryPassword, { type: 2 });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        normalizedEmail: input.email,
        passwordHash,
        role: "FACULTY",
        status: "ACTIVE",
        facultyProfile: { create: profileCreateData(input, departmentId) },
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.created",
        entityType: "User",
        entityId: user.id,
      },
    });
    return user;
  });
}

export async function editFaculty(actor: Actor, userId: string, raw: unknown) {
  requireRole(actor, "ADMIN");
  const input = editSchema.parse(raw);
  const current = await prisma.facultyProfile.findUnique({
    where: { userId },
    select: { departmentId: true },
  });
  const departmentId = await validateDepartmentAssignment(
    input.departmentId,
    current?.departmentId,
  );
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      data: {
        name: input.name,
        facultyProfile: {
          upsert: {
            create: profileCreateData(input, departmentId),
            update: profileUpdateData(input, departmentId),
          },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.updated",
        entityType: "User",
        entityId: userId,
      },
    });
    return user;
  });
}

export async function setFacultyStatus(
  actor: Actor,
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      data: { status, sessionVersion: { increment: 1 } },
    });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "faculty.activated" : "faculty.suspended",
        entityType: "User",
        entityId: userId,
      },
    });
    return user;
  });
}

export async function resetFacultyAccess(actor: Actor, userId: string, password: string) {
  requireRole(actor, "ADMIN");
  const temporaryPassword = z.string().min(14).max(200).parse(password);
  const passwordHash = await hash(temporaryPassword, { type: 2 });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.access_reset",
        entityType: "User",
        entityId: userId,
      },
    });
  });
}

export type FacultyListStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export async function deleteFaculty(actor: Actor, userId: string) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      select: { id: true, status: true },
    });
    if (!current) throw new Error("Faculty account is unavailable for deletion");
    const user = await tx.user.update({
      where: { id: current.id, role: "FACULTY", status: { not: "DELETED" } },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: current.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.deleted",
        entityType: "User",
        entityId: current.id,
        contextJson: { previousStatus: current.status },
      },
    });
    return user;
  });
}

export async function updateOwnProfile(actor: Actor, raw: unknown) {
  requireRole(actor, "FACULTY");
  const input = editSchema.parse(raw);
  const current = await prisma.facultyProfile.findUnique({
    where: { userId: actor.id },
    select: { departmentId: true },
  });
  const departmentId = await validateDepartmentAssignment(
    input.departmentId,
    current?.departmentId,
  );
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: actor.id, role: "FACULTY" },
      data: {
        name: input.name,
        facultyProfile: {
          upsert: {
            create: profileCreateData(input, departmentId),
            update: profileUpdateData(input, departmentId),
          },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.profile_updated",
        entityType: "User",
        entityId: actor.id,
      },
    });
    return user;
  });
}
