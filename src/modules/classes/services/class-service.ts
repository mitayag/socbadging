import "server-only";

import { z } from "zod";
import {
  requireAuthenticated,
  requireClassOwner,
  requireRole,
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

export async function listClasses(
  actor: Actor,
  query = "",
  status?: "ACTIVE" | "ARCHIVED",
  page = 1,
) {
  requireAuthenticated(actor);
  const rows = await prisma.class.findMany({
    where: {
      ...(actor.role === "FACULTY" ? { ownerUserId: actor.id } : {}),
      status,
      ...(query
        ? {
            OR: [
              { courseCode: { contains: query } },
              { title: { contains: query } },
              { section: { contains: query } },
            ],
          }
        : {}),
    },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    skip: (Math.max(1, page) - 1) * 20,
    take: 21,
  });
  return { items: rows.slice(0, 20), hasNext: rows.length > 20 };
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
