import "server-only";

import { Prisma } from "@prisma/client";
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
const editSchema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  ...profileFields,
});
const ownProfileSchema = z.object({
  name: z.string().trim().min(2).max(191),
  ...profileFields,
});

export class FacultyConflictError extends Error {
  constructor(
    public readonly field: "email" | "employeeId",
    message: string,
  ) {
    super(message);
    this.name = "FacultyConflictError";
  }
}

type ProfileInput = z.infer<typeof ownProfileSchema>;

const nullable = (value?: string) => value || null;
const profileScalars = (input: ProfileInput) => ({
  employeeId: nullable(input.employeeId),
  title: nullable(input.title),
  bio: nullable(input.bio),
});
const profileCreateData = (input: ProfileInput, departmentId: string | null) => ({
  ...profileScalars(input),
  ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
});
const profileUpdateData = (input: ProfileInput, departmentId: string | null) => ({
  ...profileScalars(input),
  department: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
});

export type FacultyListSort = "name" | "employeeId" | "status";
export const facultyPageSizes = [10, 25, 50] as const;
export type FacultyPageSize = (typeof facultyPageSizes)[number];

function orderByFor(sort: FacultyListSort): Prisma.UserOrderByWithRelationInput[] {
  if (sort === "employeeId") {
    return [{ facultyProfile: { employeeId: "asc" as const } }, { name: "asc" as const }];
  }
  if (sort === "status") {
    return [{ status: "asc" as const }, { name: "asc" as const }];
  }
  return [{ name: "asc" as const }, { id: "asc" as const }];
}

export async function listFaculty(
  actor: Actor,
  query = "",
  status?: FacultyListStatus,
  page = 1,
  options: { sort?: FacultyListSort; pageSize?: FacultyPageSize } = {},
) {
  requireRole(actor, "ADMIN");
  const pageSize = facultyPageSizes.includes(options.pageSize ?? 10)
    ? (options.pageSize ?? 10)
    : 10;
  const sort = options.sort ?? "name";
  const where: Prisma.UserWhereInput = {
    role: "FACULTY",
    status: status ?? { in: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
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
  };
  const total = await prisma.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.user.findMany({
    where,
    include: { facultyProfile: { include: { department: true } } },
    orderBy: orderByFor(sort),
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows,
    page: currentPage,
    pageSize,
    pageCount,
    total,
    hasNext: currentPage < pageCount,
    hasPrevious: currentPage > 1,
  };
}

export async function createFaculty(actor: Actor, raw: unknown) {
  requireRole(actor, "ADMIN");
  const input = createSchema.parse(raw);
  const existingEmail = await prisma.user.findUnique({
    where: { normalizedEmail: input.email },
    select: { id: true },
  });
  if (existingEmail) {
    throw new FacultyConflictError("email", "A faculty account with this email already exists.");
  }
  if (input.employeeId) {
    const existingEmployee = await prisma.facultyProfile.findUnique({
      where: { employeeId: input.employeeId },
      select: { userId: true },
    });
    if (existingEmployee) {
      throw new FacultyConflictError(
        "employeeId",
        "This employee ID is already assigned to another faculty account.",
      );
    }
  }
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
  const existingEmail = await prisma.user.findFirst({
    where: { normalizedEmail: input.email, id: { not: userId } },
    select: { id: true },
  });
  if (existingEmail) {
    throw new FacultyConflictError("email", "A faculty account with this email already exists.");
  }
  if (input.employeeId) {
    const existingEmployee = await prisma.facultyProfile.findFirst({
      where: { employeeId: input.employeeId, userId: { not: userId } },
      select: { userId: true },
    });
    if (existingEmployee) {
      throw new FacultyConflictError(
        "employeeId",
        "This employee ID is already assigned to another faculty account.",
      );
    }
  }
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
        email: input.email,
        normalizedEmail: input.email,
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

export type FacultyAccessStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

const accessAuditAction: Record<FacultyAccessStatus, string> = {
  ACTIVE: "faculty.activated",
  INACTIVE: "faculty.deactivated",
  SUSPENDED: "faculty.suspended",
};

export async function setFacultyStatus(actor: Actor, userId: string, status: FacultyAccessStatus) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      data: { status, sessionVersion: { increment: 1 } },
    });
    if (status !== "ACTIVE") await tx.session.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: accessAuditAction[status],
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

export type FacultyListStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";

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
  const input = ownProfileSchema.parse(raw);
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
