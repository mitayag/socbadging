import "server-only";

import { z } from "zod";
import { requireAuthenticated, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const nameSchema = z.string().trim().min(2).max(191);

export function normalizeDepartmentName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function listDepartments(actor: Actor, includeArchived = false) {
  const authenticated = requireAuthenticated(actor);
  const canIncludeArchived = authenticated.role === "ADMIN" && includeArchived;
  return prisma.department.findMany({
    where: canIncludeArchived ? {} : { status: "ACTIVE" },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function createDepartment(actor: Actor, rawName: string) {
  requireRole(actor, "ADMIN");
  const name = nameSchema.parse(rawName).replace(/\s+/g, " ");
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: { name, normalizedName: normalizeDepartmentName(name) },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "department.created",
        entityType: "Department",
        entityId: department.id,
      },
    });
    return department;
  });
}

export async function renameDepartment(actor: Actor, departmentId: string, rawName: string) {
  requireRole(actor, "ADMIN");
  const name = nameSchema.parse(rawName).replace(/\s+/g, " ");
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.update({
      where: { id: departmentId },
      data: { name, normalizedName: normalizeDepartmentName(name) },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "department.renamed",
        entityType: "Department",
        entityId: departmentId,
      },
    });
    return department;
  });
}

export async function setDepartmentStatus(
  actor: Actor,
  departmentId: string,
  status: "ACTIVE" | "ARCHIVED",
) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.update({
      where: { id: departmentId },
      data: { status },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "department.reopened" : "department.archived",
        entityType: "Department",
        entityId: departmentId,
      },
    });
    return department;
  });
}

export async function validateDepartmentAssignment(
  departmentId: string | undefined,
  currentDepartmentId?: string | null,
) {
  if (!departmentId) return null;
  const department = await prisma.department.findUniqueOrThrow({ where: { id: departmentId } });
  if (department.status !== "ACTIVE" && department.id !== currentDepartmentId)
    throw new Error("Archived departments cannot be newly assigned");
  return department.id;
}
