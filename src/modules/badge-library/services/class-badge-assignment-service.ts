import "server-only";

import { Prisma } from "@prisma/client";

import { requireClassOwner, requireStaff } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

async function loadOwnedClass(actor: Actor, classId: string) {
  const staff = requireStaff(actor);
  const classRecord = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: {
      id: true,
      ownerUserId: true,
      courseId: true,
      courseCode: true,
      title: true,
      section: true,
      term: true,
      academicYear: true,
      status: true,
    },
  });
  if (staff.role === "FACULTY") requireClassOwner(actor, classRecord.ownerUserId);
  return classRecord;
}

export async function listClassAssignments(actor: Actor, classId: string) {
  await loadOwnedClass(actor, classId);
  return prisma.classBadgeAssignment.findMany({
    where: { classId },
    include: {
      badgeDefinition: { select: { id: true, name: true, status: true } },
      badgeDefinitionVersion: {
        select: { id: true, version: true, status: true, validityDays: true },
      },
      badgeTemplate: {
        select: {
          id: true,
          status: true,
          _count: { select: { badgeIssuances: true } },
        },
      },
      assignedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function listAssignableBadges(actor: Actor, classId: string) {
  const classRecord = await loadOwnedClass(actor, classId);
  const activeAssignments = await prisma.classBadgeAssignment.findMany({
    where: { classId, status: "ACTIVE" },
    select: { badgeDefinitionId: true },
  });
  const assigned = new Set(activeAssignments.map((assignment) => assignment.badgeDefinitionId));
  const definitions = await prisma.badgeDefinition.findMany({
    where: {
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
  return definitions
    .filter((definition) => !assigned.has(definition.id))
    .map((definition) => ({
      definitionId: definition.id,
      name: definition.name,
      course: definition.course,
      version: definition.versions[0],
      recommended: Boolean(classRecord.courseId) && definition.courseId === classRecord.courseId,
    }))
    .sort((left, right) => {
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

function normalizeAssignmentConflict(error: unknown) {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") {
    return new Error("This badge is already assigned to the class.");
  }
  return error;
}

export async function assignBadgeToClass(actor: Actor, classId: string, versionId: string) {
  const staff = requireStaff(actor);
  const classRecord = await loadOwnedClass(actor, classId);
  if (classRecord.status !== "ACTIVE") {
    throw new Error("Archived classes cannot receive new badge assignments.");
  }
  const version = await prisma.badgeDefinitionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { badgeDefinition: true },
  });
  if (version.status !== "APPROVED" || version.badgeDefinition.status !== "APPROVED") {
    throw new Error("Only approved badge versions can be assigned to a class.");
  }
  if (classRecord.courseId && classRecord.courseId !== version.badgeDefinition.courseId) {
    throw new Error("This badge belongs to a different course than the class.");
  }
  const existing = await prisma.classBadgeAssignment.findUnique({
    where: {
      classId_badgeDefinitionId: {
        classId,
        badgeDefinitionId: version.badgeDefinitionId,
      },
    },
  });
  if (existing?.status === "ACTIVE") {
    throw new Error("This badge is already assigned to the class.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const template = await tx.badgeTemplate.create({
        data: {
          classId,
          ownerUserId: classRecord.ownerUserId,
          name: version.name,
          description: version.description,
          criteria: version.criteria || version.assessmentCriteria,
          imagePath: version.imagePath,
          expiresAfterDays: version.validityDays,
          metadataJson: version.metadataJson === null ? Prisma.JsonNull : version.metadataJson,
          sharedDefinitionVersionId: version.id,
        },
      });
      const assignment = existing
        ? await tx.classBadgeAssignment.update({
            where: { id: existing.id },
            data: {
              badgeDefinitionVersionId: version.id,
              badgeTemplateId: template.id,
              assignedByUserId: staff.id,
              status: "ACTIVE",
              archivedAt: null,
            },
          })
        : await tx.classBadgeAssignment.create({
            data: {
              classId,
              badgeDefinitionId: version.badgeDefinitionId,
              badgeDefinitionVersionId: version.id,
              badgeTemplateId: template.id,
              assignedByUserId: staff.id,
              status: "ACTIVE",
            },
          });
      await tx.auditLog.create({
        data: {
          actorUserId: staff.id,
          action: "badge.assigned_to_class",
          entityType: "ClassBadgeAssignment",
          entityId: assignment.id,
          contextJson: {
            classId,
            badgeDefinitionId: version.badgeDefinitionId,
            version: version.version,
            badgeTemplateId: template.id,
          },
        },
      });
      return { assignment, template };
    });
  } catch (error) {
    throw normalizeAssignmentConflict(error);
  }
}

export async function archiveClassBadgeAssignment(actor: Actor, assignmentId: string) {
  const staff = requireStaff(actor);
  const assignment = await prisma.classBadgeAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { class: { select: { ownerUserId: true } } },
  });
  if (staff.role === "FACULTY") requireClassOwner(actor, assignment.class.ownerUserId);
  if (assignment.status === "ARCHIVED") return assignment;
  return prisma.$transaction(async (tx) => {
    if (assignment.badgeTemplateId) {
      await tx.badgeTemplate.update({
        where: { id: assignment.badgeTemplateId },
        data: { status: "ARCHIVED" },
      });
    }
    const updated = await tx.classBadgeAssignment.update({
      where: { id: assignmentId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: staff.id,
        action: "badge.class_assignment_archived",
        entityType: "ClassBadgeAssignment",
        entityId: assignmentId,
        contextJson: {
          classId: assignment.classId,
          badgeDefinitionId: assignment.badgeDefinitionId,
        },
      },
    });
    return updated;
  });
}
