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

export const coursePageSizes = [5, 10, 25, 50] as const;
export type CoursePageSize = (typeof coursePageSizes)[number];
export type CourseSort = "code" | "title" | "status" | "updated";

export function normalizeCourseCode(code: string) {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizePrograms(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function programsText(programs: string[]) {
  return programs.length ? programs.map((value) => value.toLowerCase()).join(" | ") : null;
}

const courseInputSchema = z.object({
  code: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(191),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  programs: z.string().trim().max(1000).optional().or(z.literal("")),
});

const courseStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

function courseOrderBy(sort: CourseSort): Prisma.CourseOrderByWithRelationInput[] {
  if (sort === "title") return [{ title: "asc" }, { code: "asc" }, { id: "asc" }];
  if (sort === "status") return [{ status: "asc" }, { code: "asc" }, { id: "asc" }];
  if (sort === "updated") return [{ updatedAt: "desc" }, { id: "desc" }];
  return [{ code: "asc" }, { id: "asc" }];
}

export async function listCourses(
  actor: Actor,
  options: {
    query?: string;
    status?: "ACTIVE" | "ARCHIVED";
    program?: string;
    sort?: CourseSort;
    page?: number;
    pageSize?: CoursePageSize;
  } = {},
) {
  requireStaff(actor);
  const pageSize = coursePageSizes.includes(options.pageSize ?? 10) ? (options.pageSize ?? 10) : 10;
  const sort = options.sort ?? "code";
  const query = options.query?.trim() ?? "";
  const where: Prisma.CourseWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { title: { contains: query } },
            { description: { contains: query } },
          ],
        }
      : {}),
    ...(options.program
      ? { programsText: { contains: options.program.trim().toLowerCase() } }
      : {}),
  };
  const total = await prisma.course.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const items = await prisma.course.findMany({
    where,
    include: { _count: { select: { classes: true, badgeDefinitions: true } } },
    orderBy: courseOrderBy(sort),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    items,
    page,
    pageSize,
    pageCount,
    total,
    hasNext: page < pageCount,
    hasPrevious: page > 1,
  };
}

export async function listCourseOptions(actor: Actor, includeArchived = false) {
  const authenticated = requireStaff(actor);
  return prisma.course.findMany({
    where: authenticated.role === "ADMIN" && includeArchived ? {} : { status: "ACTIVE" },
    select: { id: true, code: true, title: true, status: true },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
}

export async function getCourse(actor: Actor, courseId: string) {
  requireStaff(actor);
  return prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { _count: { select: { classes: true, badgeDefinitions: true } } },
  });
}

export async function listClassOptions(actor: Actor) {
  const staff = requireStaff(actor);
  return prisma.class.findMany({
    where: staff.role === "ADMIN" ? {} : { ownerUserId: staff.id },
    select: {
      id: true,
      courseId: true,
      courseCode: true,
      title: true,
      section: true,
      academicYear: true,
      status: true,
    },
    orderBy: [{ courseCode: "asc" }, { section: "asc" }],
    take: 500,
  });
}

function normalizeUniqueConflict(error: unknown) {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") {
    return new Error("A course with this code already exists.");
  }
  return error;
}

export async function createCourse(actor: Actor, raw: unknown) {
  requireRole(actor, "ADMIN");
  const input = courseInputSchema.parse(raw);
  const programs = normalizePrograms(input.programs);
  try {
    return await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          code: input.code.replace(/\s+/g, " "),
          normalizedCode: normalizeCourseCode(input.code),
          title: input.title,
          description: input.description || null,
          programsJson: programs.length ? programs : Prisma.JsonNull,
          programsText: programsText(programs),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "course.created",
          entityType: "Course",
          entityId: course.id,
          contextJson: { code: course.code },
        },
      });
      return course;
    });
  } catch (error) {
    throw normalizeUniqueConflict(error);
  }
}

export async function updateCourse(actor: Actor, courseId: string, raw: unknown) {
  requireRole(actor, "ADMIN");
  const input = courseInputSchema.parse(raw);
  const programs = normalizePrograms(input.programs);
  try {
    return await prisma.$transaction(async (tx) => {
      const course = await tx.course.update({
        where: { id: courseId },
        data: {
          code: input.code.replace(/\s+/g, " "),
          normalizedCode: normalizeCourseCode(input.code),
          title: input.title,
          description: input.description || null,
          programsJson: programs.length ? programs : Prisma.JsonNull,
          programsText: programsText(programs),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "course.updated",
          entityType: "Course",
          entityId: courseId,
          contextJson: { code: course.code },
        },
      });
      return course;
    });
  } catch (error) {
    throw normalizeUniqueConflict(error);
  }
}

export async function setCourseStatus(actor: Actor, courseId: string, rawStatus: unknown) {
  requireRole(actor, "ADMIN");
  const status = courseStatusSchema.parse(rawStatus);
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.update({ where: { id: courseId }, data: { status } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: status === "ACTIVE" ? "course.reopened" : "course.archived",
        entityType: "Course",
        entityId: courseId,
      },
    });
    return course;
  });
}

export async function mapClassToCourse(actor: Actor, classId: string, courseId: string | null) {
  requireStaff(actor);
  const classRecord = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { id: true, ownerUserId: true },
  });
  if (actor.role === "FACULTY") requireClassOwner(actor, classRecord.ownerUserId);
  if (!courseId) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id: classId },
        data: { courseId: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "class.course_unmapped",
          entityType: "Class",
          entityId: classId,
        },
      });
      return updated;
    });
  }
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  if (course.status !== "ACTIVE") throw new Error("Archived courses cannot be newly assigned.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.class.update({
      where: { id: classId },
      data: { courseId: course.id, courseCode: course.code, title: course.title },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "class.course_mapped",
        entityType: "Class",
        entityId: classId,
        contextJson: { courseId: course.id, code: course.code },
      },
    });
    return updated;
  });
}
