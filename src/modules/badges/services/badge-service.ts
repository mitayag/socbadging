import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuthenticated, requireClassOwner } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";
import { validateBadgeImage } from "@/platform/storage/image-validation";
import { putBadgeImage } from "@/platform/storage/local-storage";

const schema = z.object({
  name: z.string().trim().min(2).max(191),
  description: z.string().trim().min(10).max(4000),
  criteria: z.string().trim().min(10).max(8000),
  skills: z.string().trim().max(1000).optional().or(z.literal("")),
  alignmentName: z.string().trim().max(191).optional().or(z.literal("")),
  alignmentUrl: z.union([z.url(), z.literal("")]).optional(),
  expiresAfterDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).optional(),
});
async function owned(actor: Actor, classId: string) {
  const item = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  return requireClassOwner(actor, item.ownerUserId);
}
const metadata = (i: z.infer<typeof schema>) => ({
  skills: i.skills
    ? i.skills
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [],
  alignment: i.alignmentName
    ? { name: i.alignmentName, url: i.alignmentUrl || undefined }
    : undefined,
});
export async function listBadges(
  actor: Actor,
  classId: string,
  query = "",
  status?: "ACTIVE" | "ARCHIVED",
  page = 1,
) {
  requireAuthenticated(actor);
  const c = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { ownerUserId: true },
  });
  if (actor.role === "FACULTY") requireClassOwner(actor, c.ownerUserId);
  const rows = await prisma.badgeTemplate.findMany({
    where: { classId, status, ...(query ? { name: { contains: query } } : {}) },
    orderBy: { updatedAt: "desc" },
    skip: (Math.max(1, page) - 1) * 20,
    take: 21,
  });
  return { items: rows.slice(0, 20), hasNext: rows.length > 20 };
}
export async function createBadge(actor: Actor, classId: string, raw: unknown, file: File) {
  await owned(actor, classId);
  const input = schema.parse(raw);
  if (!file?.size) throw new Error("Badge artwork is required");
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await validateBadgeImage(buffer, file.name);
  const imagePath = await putBadgeImage(buffer, image.extension);
  return prisma.$transaction(async (tx) => {
    const item = await tx.badgeTemplate.create({
      data: {
        classId,
        ownerUserId: actor.id,
        name: input.name,
        description: input.description,
        criteria: input.criteria,
        imagePath,
        expiresAfterDays: input.expiresAfterDays === "" ? null : input.expiresAfterDays,
        metadataJson: metadata(input),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "badge.created",
        entityType: "BadgeTemplate",
        entityId: item.id,
        contextJson: { classId },
      },
    });
    return item;
  });
}
export async function setBadgeStatus(actor: Actor, badgeId: string, status: "ACTIVE" | "ARCHIVED") {
  const badge = await prisma.badgeTemplate.findUniqueOrThrow({
    where: { id: badgeId },
    select: { classId: true, ownerUserId: true },
  });
  requireClassOwner(actor, badge.ownerUserId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.badgeTemplate.update({ where: { id: badgeId }, data: { status } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "badge.reopened" : "badge.archived",
        entityType: "BadgeTemplate",
        entityId: badgeId,
        contextJson: { classId: badge.classId },
      },
    });
    return item;
  });
}
export async function duplicateBadge(actor: Actor, badgeId: string) {
  const source = await prisma.badgeTemplate.findUniqueOrThrow({ where: { id: badgeId } });
  requireClassOwner(actor, source.ownerUserId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.badgeTemplate.create({
      data: {
        classId: source.classId,
        ownerUserId: actor.id,
        name: `${source.name} (Copy)`,
        description: source.description,
        criteria: source.criteria,
        imagePath: source.imagePath,
        expiresAfterDays: source.expiresAfterDays,
        metadataJson: source.metadataJson === null ? Prisma.JsonNull : source.metadataJson,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "badge.duplicated",
        entityType: "BadgeTemplate",
        entityId: item.id,
        contextJson: { sourceBadgeId: badgeId },
      },
    });
    return item;
  });
}
export async function editBadge(actor: Actor, badgeId: string, raw: unknown, file?: File | null) {
  const existing = await prisma.badgeTemplate.findUniqueOrThrow({ where: { id: badgeId } });
  requireClassOwner(actor, existing.ownerUserId);
  const input = schema.parse(raw);
  let imagePath = existing.imagePath;
  if (file?.size) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await validateBadgeImage(buffer, file.name);
    imagePath = await putBadgeImage(buffer, image.extension);
  }
  return prisma.$transaction(async (tx) => {
    const item = await tx.badgeTemplate.update({
      where: { id: badgeId },
      data: {
        name: input.name,
        description: input.description,
        criteria: input.criteria,
        imagePath,
        expiresAfterDays: input.expiresAfterDays === "" ? null : input.expiresAfterDays,
        metadataJson: metadata(input),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "badge.updated",
        entityType: "BadgeTemplate",
        entityId: badgeId,
        contextJson: { classId: existing.classId },
      },
    });
    return item;
  });
}
