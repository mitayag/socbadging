import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  requireClassOwner,
  requireRole,
  requireStaff,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const classSchema = z.object({
  courseCode: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(191),
  section: z.string().trim().min(1).max(100),
  term: z.string().trim().min(2).max(100),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Use YYYY-YYYY"),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const classPageSizes = [5, 10, 25, 50] as const;
export type ClassPageSize = (typeof classPageSizes)[number];
export type ClassSort = "updated" | "courseCode" | "title" | "status";

function classOrderBy(sort: ClassSort): Prisma.ClassOrderByWithRelationInput[] {
  if (sort === "courseCode") {
    return [{ courseCode: "asc" }, { title: "asc" }, { id: "asc" }];
  }
  if (sort === "title") return [{ title: "asc" }, { courseCode: "asc" }, { id: "asc" }];
  if (sort === "status") {
    return [{ status: "asc" }, { courseCode: "asc" }, { id: "asc" }];
  }
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

export async function listClasses(
  actor: Actor,
  query = "",
  status?: "ACTIVE" | "ARCHIVED",
  page = 1,
  options: { pageSize?: ClassPageSize; sort?: ClassSort } = {},
) {
  requireStaff(actor);
  const pageSize = classPageSizes.includes(options.pageSize ?? 5) ? (options.pageSize ?? 5) : 5;
  const where: Prisma.ClassWhereInput = {
    ...(actor.role === "FACULTY" ? { ownerUserId: actor.id } : {}),
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { courseCode: { contains: query } },
            { title: { contains: query } },
            { section: { contains: query } },
          ],
        }
      : {}),
  };
  const total = await prisma.class.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.class.findMany({
    where,
    include: { owner: { select: { name: true, email: true } } },
    orderBy: classOrderBy(options.sort ?? "updated"),
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

export async function createClass(actor: Actor, raw: unknown) {
  requireRole(actor, "FACULTY");
  const input = classSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const item = await tx.class.create({
      data: { ...input, description: input.description || null, ownerUserId: actor.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "class.created",
        entityType: "Class",
        entityId: item.id,
      },
    });
    return item;
  });
}

export async function editClass(actor: Actor, classId: string, raw: unknown) {
  const input = classSchema.parse(raw);
  const existing = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  requireClassOwner(actor, existing.ownerUserId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.class.update({
      where: { id: classId },
      data: { ...input, description: input.description || null },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "class.updated",
        entityType: "Class",
        entityId: classId,
      },
    });
    return item;
  });
}

export async function setClassStatus(actor: Actor, classId: string, status: "ACTIVE" | "ARCHIVED") {
  const existing = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  requireClassOwner(actor, existing.ownerUserId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.class.update({ where: { id: classId }, data: { status } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "class.reopened" : "class.archived",
        entityType: "Class",
        entityId: classId,
      },
    });
    return item;
  });
}
