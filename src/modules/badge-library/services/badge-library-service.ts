import "server-only";

import { Prisma, type BadgeDefinitionStatus } from "@prisma/client";
import { z } from "zod";

import { requireRole, requireStaff } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";
import { validateBadgeImage } from "@/platform/storage/image-validation";
import { putBadgeImage } from "@/platform/storage/local-storage";

export const badgeLibraryPageSizes = [5, 10, 25, 50] as const;
export type BadgeLibraryPageSize = (typeof badgeLibraryPageSizes)[number];
export type BadgeLibrarySort = "updated" | "name" | "course" | "status";
export type BadgeLibraryScope = "library" | "mine" | "queue";

export type BadgeLibraryFilters = {
  query?: string;
  courseId?: string;
  status?: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ARCHIVED";
  scope?: BadgeLibraryScope;
  sort?: BadgeLibrarySort;
  page?: number;
  pageSize?: BadgeLibraryPageSize;
};

const versionInputSchema = z.object({
  courseId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(191),
  description: z.string().trim().min(10).max(4000),
  competencies: z.string().trim().min(2).max(8000),
  assessmentCriteria: z.string().trim().min(10).max(8000),
  gradingPeriod: z.string().trim().max(100).optional().or(z.literal("")),
  issuingInstitution: z.string().trim().min(2).max(191),
  validityDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).optional(),
  skills: z.string().trim().max(1000).optional().or(z.literal("")),
});

const decisionSchema = z.enum(["APPROVED", "REJECTED", "ARCHIVED"]);

function metadataFor(skills: string | undefined) {
  const values = (skills ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? { skills: values } : { skills: [] as string[] };
}

function rejectionReasonFor(note: string | undefined) {
  return note?.trim() || null;
}

export function rollupDefinitionStatus(
  versions: Array<{ status: BadgeDefinitionStatus }>,
): BadgeDefinitionStatus {
  if (versions.some((version) => version.status === "APPROVED")) return "APPROVED";
  if (versions.some((version) => version.status === "PENDING_APPROVAL")) return "PENDING_APPROVAL";
  if (versions.some((version) => version.status === "DRAFT")) return "DRAFT";
  if (versions.some((version) => version.status === "REJECTED")) return "REJECTED";
  return "ARCHIVED";
}

function latestApprovedVersion<T extends { version: number; status: string }>(versions: T[]) {
  return versions
    .filter((version) => version.status === "APPROVED")
    .sort((left, right) => right.version - left.version)[0];
}

function orderBy(sort: BadgeLibrarySort): Prisma.BadgeDefinitionOrderByWithRelationInput[] {
  if (sort === "name") return [{ name: "asc" }, { id: "asc" }];
  if (sort === "course") return [{ course: { code: "asc" } }, { name: "asc" }, { id: "asc" }];
  if (sort === "status") return [{ status: "asc" }, { name: "asc" }, { id: "asc" }];
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

function visibleWhere(
  actor: Actor,
  filters: BadgeLibraryFilters,
): Prisma.BadgeDefinitionWhereInput {
  const scope = filters.scope ?? "library";
  if (actor.role === "FACULTY" && scope === "queue") {
    throw new Error("Administrator access required");
  }
  return {
    ...(scope === "mine" ? { createdByUserId: actor.id } : {}),
    ...(scope === "queue" ? { versions: { some: { status: "PENDING_APPROVAL" } } } : {}),
    ...(actor.role === "FACULTY" && scope === "library"
      ? { versions: { some: { status: "APPROVED" } } }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query } },
            { course: { code: { contains: filters.query } } },
            { course: { title: { contains: filters.query } } },
          ],
        }
      : {}),
  };
}

export async function listBadgeDefinitions(actor: Actor, filters: BadgeLibraryFilters = {}) {
  requireStaff(actor);
  const pageSize = badgeLibraryPageSizes.includes(filters.pageSize ?? 10)
    ? (filters.pageSize ?? 10)
    : 10;
  const where = visibleWhere(actor, filters);
  const total = await prisma.badgeDefinition.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const items = await prisma.badgeDefinition.findMany({
    where,
    include: {
      course: { select: { id: true, code: true, title: true } },
      createdBy: { select: { id: true, name: true } },
      versions: { orderBy: { version: "desc" } },
      _count: { select: { assignments: true } },
    },
    orderBy: orderBy(filters.sort ?? "updated"),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: items.map((item) => ({
      ...item,
      latestApproved: latestApprovedVersion(item.versions),
      latestVersion: item.versions[0],
      pendingVersions: item.versions.filter((version) => version.status === "PENDING_APPROVAL"),
    })),
    page,
    pageSize,
    pageCount,
    total,
    hasNext: page < pageCount,
    hasPrevious: page > 1,
  };
}

export async function getLibrarySummary(actor: Actor) {
  requireStaff(actor);
  const [queue, approved, drafts, rejected] = await Promise.all([
    actor.role === "ADMIN"
      ? prisma.badgeDefinitionVersion.count({ where: { status: "PENDING_APPROVAL" } })
      : 0,
    prisma.badgeDefinition.count({
      where: { status: "APPROVED", ...(actor.role === "FACULTY" ? {} : {}) },
    }),
    prisma.badgeDefinition.count({
      where: {
        status: "DRAFT",
        ...(actor.role === "FACULTY" ? { createdByUserId: actor.id } : {}),
      },
    }),
    prisma.badgeDefinition.count({
      where: {
        status: "REJECTED",
        ...(actor.role === "FACULTY" ? { createdByUserId: actor.id } : {}),
      },
    }),
  ]);
  return { queue, approved, drafts, rejected };
}

export async function getBadgeDefinition(actor: Actor, definitionId: string) {
  const staff = requireStaff(actor);
  const definition = await prisma.badgeDefinition.findUniqueOrThrow({
    where: { id: definitionId },
    include: {
      course: { select: { id: true, code: true, title: true, status: true } },
      createdBy: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { actor: { select: { id: true, name: true } } },
          },
        },
      },
      assignments: {
        orderBy: { createdAt: "desc" },
        include: {
          class: {
            select: {
              id: true,
              courseCode: true,
              title: true,
              section: true,
              term: true,
              academicYear: true,
              owner: { select: { id: true, name: true } },
            },
          },
          badgeTemplate: {
            select: {
              id: true,
              status: true,
              _count: { select: { badgeIssuances: true } },
            },
          },
          badgeDefinitionVersion: { select: { version: true } },
        },
      },
    },
  });
  const canSeeUnapproved = staff.role === "ADMIN" || definition.createdByUserId === staff.id;
  if (!canSeeUnapproved && !definition.versions.some((version) => version.status === "APPROVED")) {
    throw new Error("Badge definition not found");
  }
  return definition;
}

export async function detectDuplicateCandidates(
  actor: Actor,
  input: { courseId: string; name: string; criteria: string; imagePath?: string },
) {
  requireStaff(actor);
  const normalizedName = input.name.trim().toLocaleLowerCase("en-US");
  const normalizedCriteria = input.criteria.trim().toLocaleLowerCase("en-US");
  const candidates = await prisma.badgeDefinition.findMany({
    where: { courseId: input.courseId, status: { not: "ARCHIVED" } },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      course: { select: { code: true, title: true } },
    },
    take: 200,
  });
  return candidates.flatMap((candidate) => {
    const latest = candidate.versions[0];
    const reasons: string[] = [];
    if (candidate.name.trim().toLocaleLowerCase("en-US") === normalizedName)
      reasons.push("same name");
    if (latest?.criteria.trim().toLocaleLowerCase("en-US") === normalizedCriteria)
      reasons.push("same assessment criteria");
    if (input.imagePath && latest?.imagePath === input.imagePath) reasons.push("same artwork");
    return reasons.length ? [{ definition: candidate, reasons }] : [];
  });
}

export async function getBadgeUsage(actor: Actor, definitionId: string) {
  requireRole(actor, "ADMIN");
  const versions = await prisma.badgeDefinitionVersion.findMany({
    where: { badgeDefinitionId: definitionId },
    select: { id: true },
  });
  const versionIds = versions.map((version) => version.id);
  const materialized = await prisma.badgeTemplate.findMany({
    where: { sharedDefinitionVersionId: { in: versionIds } },
    select: { id: true, classId: true },
  });
  const templateIds = materialized.map((template) => template.id);
  const [assignments, activeAssignments, issuances, revoked, distinctClasses, distinctStudents] =
    await Promise.all([
      prisma.classBadgeAssignment.count({ where: { badgeDefinitionId: definitionId } }),
      prisma.classBadgeAssignment.count({
        where: { badgeDefinitionId: definitionId, status: "ACTIVE" },
      }),
      prisma.badgeIssuance.count({ where: { badgeTemplateId: { in: templateIds } } }),
      prisma.badgeIssuance.count({
        where: { badgeTemplateId: { in: templateIds }, status: "REVOKED" },
      }),
      prisma.classBadgeAssignment
        .findMany({
          where: { badgeDefinitionId: definitionId },
          select: { classId: true },
          distinct: ["classId"],
        })
        .then((rows) => rows.length),
      prisma.badgeIssuance
        .findMany({
          where: { badgeTemplateId: { in: templateIds } },
          select: { studentId: true },
          distinct: ["studentId"],
        })
        .then((rows) => rows.length),
    ]);
  return {
    assignments,
    activeAssignments,
    materializedTemplates: materialized.length,
    issuances,
    revoked,
    distinctClasses,
    distinctStudents,
  };
}

export async function createBadgeDefinition(actor: Actor, raw: unknown, file?: File) {
  const staff = requireStaff(actor);
  const input = versionInputSchema.parse(raw);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: input.courseId } });
  if (course.status !== "ACTIVE") throw new Error("Badges can only be created for active courses.");
  if (!file?.size) throw new Error("Badge artwork is required");
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await validateBadgeImage(buffer, file.name);
  const imagePath = await putBadgeImage(buffer, image.extension);
  const duplicates = await detectDuplicateCandidates(actor, {
    courseId: input.courseId,
    name: input.name,
    criteria: input.assessmentCriteria,
    imagePath,
  });
  const result = await prisma.$transaction(async (tx) => {
    const definition = await tx.badgeDefinition.create({
      data: {
        courseId: input.courseId,
        name: input.name,
        createdByUserId: staff.id,
        status: "DRAFT",
      },
    });
    const version = await tx.badgeDefinitionVersion.create({
      data: {
        badgeDefinitionId: definition.id,
        version: 1,
        name: input.name,
        description: input.description,
        competencies: input.competencies,
        assessmentCriteria: input.assessmentCriteria,
        gradingPeriod: input.gradingPeriod || null,
        issuingInstitution: input.issuingInstitution,
        validityDays: input.validityDays === "" ? null : (input.validityDays ?? null),
        imagePath,
        criteria: input.assessmentCriteria,
        metadataJson: metadataFor(input.skills),
        status: "DRAFT",
        createdByUserId: staff.id,
      },
    });
    await tx.badgeDefinitionReview.create({
      data: {
        badgeDefinitionVersionId: version.id,
        actorUserId: staff.id,
        decision: "VERSION_CREATED",
        note: "Initial draft",
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: staff.id,
        action: "badge.library_created",
        entityType: "BadgeDefinition",
        entityId: definition.id,
        contextJson: { courseId: input.courseId, version: 1 },
      },
    });
    return { definition, version };
  });
  return { ...result, duplicates };
}

export async function reviseBadgeDefinition(
  actor: Actor,
  definitionId: string,
  raw: unknown,
  file?: File | null,
) {
  const staff = requireStaff(actor);
  const definition = await prisma.badgeDefinition.findUniqueOrThrow({
    where: { id: definitionId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  const hasApproved = definition.versions.some((version) => version.status === "APPROVED");
  const isOwner = definition.createdByUserId === staff.id;
  if (staff.role !== "ADMIN" && (!isOwner || hasApproved)) {
    throw new Error("Only administrators can revise an approved shared badge definition.");
  }
  if (definition.status === "ARCHIVED") throw new Error("Archived badges cannot be revised.");
  const input = versionInputSchema.parse(raw);
  if (input.courseId !== definition.courseId) {
    throw new Error("A badge version must remain associated with its original course.");
  }
  const latest = definition.versions[0];
  let imagePath = latest?.imagePath;
  if (file?.size) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await validateBadgeImage(buffer, file.name);
    imagePath = await putBadgeImage(buffer, image.extension);
  }
  if (!imagePath) throw new Error("Badge artwork is required");
  const nextVersion = (latest?.version ?? 0) + 1;
  const result = await prisma.$transaction(async (tx) => {
    const version = await tx.badgeDefinitionVersion.create({
      data: {
        badgeDefinitionId: definitionId,
        version: nextVersion,
        name: input.name,
        description: input.description,
        competencies: input.competencies,
        assessmentCriteria: input.assessmentCriteria,
        gradingPeriod: input.gradingPeriod || null,
        issuingInstitution: input.issuingInstitution,
        validityDays: input.validityDays === "" ? null : (input.validityDays ?? null),
        imagePath,
        criteria: input.assessmentCriteria,
        metadataJson: metadataFor(input.skills),
        status: "DRAFT",
        createdByUserId: staff.id,
      },
    });
    await tx.badgeDefinitionReview.create({
      data: {
        badgeDefinitionVersionId: version.id,
        actorUserId: staff.id,
        decision: "VERSION_CREATED",
        note: "New version created without changing issued credentials",
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: staff.id,
        action: "badge.version_created",
        entityType: "BadgeDefinitionVersion",
        entityId: version.id,
        contextJson: { badgeDefinitionId: definitionId, version: nextVersion },
      },
    });
    if (definition.status !== "APPROVED") {
      await tx.badgeDefinition.update({ where: { id: definitionId }, data: { status: "DRAFT" } });
    }
    return version;
  });
  const duplicates = await detectDuplicateCandidates(actor, {
    courseId: input.courseId,
    name: input.name,
    criteria: input.assessmentCriteria,
    imagePath,
  });
  return { version: result, duplicates };
}

export async function submitBadgeDefinition(actor: Actor, definitionId: string, note?: string) {
  const staff = requireStaff(actor);
  const definition = await prisma.badgeDefinition.findUniqueOrThrow({
    where: { id: definitionId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (staff.role !== "ADMIN" && definition.createdByUserId !== staff.id) {
    throw new Error("You can only submit your own badge proposals.");
  }
  const latest = definition.versions[0];
  if (!latest) throw new Error("Badge definition has no version to submit.");
  if (latest.status !== "DRAFT" && latest.status !== "REJECTED") {
    throw new Error("Only draft or rejected versions can be submitted for approval.");
  }
  return prisma.$transaction(async (tx) => {
    const version = await tx.badgeDefinitionVersion.update({
      where: { id: latest.id },
      data: { status: "PENDING_APPROVAL", rejectionReason: null },
    });
    await tx.badgeDefinitionReview.create({
      data: {
        badgeDefinitionVersionId: latest.id,
        actorUserId: staff.id,
        decision: "SUBMITTED",
        note: note?.trim() || null,
      },
    });
    await tx.badgeDefinition.update({
      where: { id: definitionId },
      data: {
        status: rollupDefinitionStatus(
          definition.versions.map((item) => ({
            status: item.id === latest.id ? "PENDING_APPROVAL" : item.status,
          })),
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: staff.id,
        action: "badge.submitted",
        entityType: "BadgeDefinition",
        entityId: definitionId,
        contextJson: { version: latest.version },
      },
    });
    return version;
  });
}

export async function reviewBadgeDefinition(
  actor: Actor,
  versionId: string,
  rawDecision: unknown,
  note?: string,
) {
  requireRole(actor, "ADMIN");
  const decision = decisionSchema.parse(rawDecision);
  const version = await prisma.badgeDefinitionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      badgeDefinition: {
        include: { versions: { orderBy: { version: "desc" } } },
      },
    },
  });
  if (version.badgeDefinition.status === "ARCHIVED") {
    throw new Error("Archived badges cannot be reviewed.");
  }
  if (decision === "APPROVED" && version.status !== "PENDING_APPROVAL") {
    throw new Error("Only submitted versions can be approved.");
  }
  if (decision === "REJECTED" && !rejectionReasonFor(note)) {
    throw new Error("A rejection reason is required.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.badgeDefinitionVersion.update({
      where: { id: versionId },
      data:
        decision === "APPROVED"
          ? {
              status: "APPROVED",
              approvedByUserId: actor.id,
              approvedAt: new Date(),
              rejectionReason: null,
            }
          : decision === "REJECTED"
            ? { status: "REJECTED", rejectionReason: rejectionReasonFor(note) }
            : { status: "ARCHIVED" },
    });
    await tx.badgeDefinitionReview.create({
      data: {
        badgeDefinitionVersionId: versionId,
        actorUserId: actor.id,
        decision,
        note: note?.trim() || null,
      },
    });
    if (decision === "APPROVED") {
      await tx.badgeDefinitionReview.create({
        data: {
          badgeDefinitionVersionId: versionId,
          actorUserId: actor.id,
          decision: "PUBLISHED",
          note: "Approved version published to the shared badge library",
        },
      });
    }
    const nextVersions = version.badgeDefinition.versions.map((item) => ({
      status: item.id === versionId ? updated.status : item.status,
    }));
    await tx.badgeDefinition.update({
      where: { id: version.badgeDefinitionId },
      data: { status: rollupDefinitionStatus(nextVersions) },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action:
          decision === "APPROVED"
            ? "badge.version_approved"
            : decision === "REJECTED"
              ? "badge.version_rejected"
              : "badge.version_archived",
        entityType: "BadgeDefinitionVersion",
        entityId: versionId,
        contextJson: { badgeDefinitionId: version.badgeDefinitionId, version: version.version },
      },
    });
    return updated;
  });
}

export async function archiveBadgeDefinition(actor: Actor, definitionId: string, reason?: string) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const assignmentIds = await tx.classBadgeAssignment.findMany({
      where: { badgeDefinitionId: definitionId, status: "ACTIVE" },
      select: { id: true, badgeTemplateId: true },
    });
    const templateIds = assignmentIds
      .map((assignment) => assignment.badgeTemplateId)
      .filter((value): value is string => Boolean(value));
    await tx.classBadgeAssignment.updateMany({
      where: { id: { in: assignmentIds.map((assignment) => assignment.id) } },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (templateIds.length) {
      await tx.badgeTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { status: "ARCHIVED" },
      });
    }
    const versions = await tx.badgeDefinitionVersion.findMany({
      where: { badgeDefinitionId: definitionId, status: "APPROVED" },
      select: { id: true },
    });
    await tx.badgeDefinitionVersion.updateMany({
      where: { id: { in: versions.map((version) => version.id) } },
      data: { status: "ARCHIVED" },
    });
    if (versions.length) {
      await tx.badgeDefinitionReview.createMany({
        data: versions.map((version) => ({
          badgeDefinitionVersionId: version.id,
          actorUserId: actor.id,
          decision: "ARCHIVED" as const,
          note: reason?.trim() || "Badge definition archived",
        })),
      });
    }
    const definition = await tx.badgeDefinition.update({
      where: { id: definitionId },
      data: { status: "ARCHIVED" },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "badge.library_archived",
        entityType: "BadgeDefinition",
        entityId: definitionId,
        contextJson: { archivedAssignments: assignmentIds.length },
      },
    });
    return definition;
  });
}

export async function listApprovedVersionsForCourse(actor: Actor, courseId: string) {
  requireStaff(actor);
  const definitions = await prisma.badgeDefinition.findMany({
    where: {
      courseId,
      status: "APPROVED",
      versions: { some: { status: "APPROVED" } },
    },
    include: {
      course: { select: { id: true, code: true, title: true } },
      versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  return definitions.map((definition) => ({
    definitionId: definition.id,
    name: definition.name,
    course: definition.course,
    version: definition.versions[0],
  }));
}
