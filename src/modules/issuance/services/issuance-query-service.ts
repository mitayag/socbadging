import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireAuthenticated, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type {
  AchievementSnapshot,
  IssuanceListItem,
  IssuerSnapshot,
  OpenBadgeCredentialSnapshot,
  RecipientSnapshot,
} from "@/modules/issuance/types";
import { prisma } from "@/platform/db/prisma";
import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
  OpenBadgeCredentialSnapshotSchema,
  RecipientSnapshotSchema,
} from "./snapshot-schemas";

const pageSize = 20;

const issuanceFiltersSchema = z.object({
  query: z.string().trim().max(191).optional().catch(undefined),
  status: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]).optional().catch(undefined),
  classId: z.string().trim().min(1).max(191).optional().catch(undefined),
  badgeTemplateId: z.string().trim().min(1).max(191).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export type IssuanceFilters = z.input<typeof issuanceFiltersSchema>;
export type NormalizedIssuanceFilters = z.output<typeof issuanceFiltersSchema>;
export type IssuanceListRecord = Omit<IssuanceListItem, "recipientEmail">;
export type IssuanceExportRow = Pick<
  IssuanceListItem,
  | "publicId"
  | "status"
  | "issuedAt"
  | "expiresAt"
  | "classCourseCode"
  | "classTitle"
  | "classSection"
  | "badgeName"
  | "studentNumber"
  | "recipientDisplayName"
  | "recipientEmail"
  | "issuerUserName"
>;

export type IssuanceListResult = {
  items: IssuanceListRecord[];
  page: number;
  pageSize: typeof pageSize;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

export type IssuanceDetail = {
  id: string;
  publicId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: string;
  expiresAt: string | null;
  classId: string;
  badgeTemplateId: string;
  studentId: string;
  issuerUserId: string;
  recipient: RecipientSnapshot;
  achievement: AchievementSnapshot;
  issuer: IssuerSnapshot;
  credential: OpenBadgeCredentialSnapshot;
  supersedes: { id: string; publicId: string } | null;
  supersededBy: { id: string; publicId: string } | null;
};

export type IssueOptions = {
  badgeOptions: Array<{ id: string; name: string; imagePath: string }>;
  studentOptions: Array<{ id: string; studentNumber: string; displayName: string }>;
};

export class IssuanceNotFoundError extends Error {
  constructor() {
    super("Issuance not found");
    this.name = "IssuanceNotFoundError";
  }
}

const issuanceSelect = {
  id: true,
  publicId: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  classId: true,
  badgeTemplateId: true,
  studentId: true,
  issuerUserId: true,
  recipientSnapshotJson: true,
  achievementSnapshotJson: true,
  issuerSnapshotJson: true,
  credentialJson: true,
  supersedes: { select: { id: true, publicId: true } },
  supersededBy: { select: { id: true, publicId: true } },
} satisfies Prisma.BadgeIssuanceSelect;

type IssuanceRecord = Prisma.BadgeIssuanceGetPayload<{ select: typeof issuanceSelect }>;

function parseSnapshot<T>(schema: z.ZodType<T>, value: Prisma.JsonValue, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid ${name} snapshot`);
  return result.data;
}

function toDetail(record: IssuanceRecord): IssuanceDetail {
  return {
    id: record.id,
    publicId: record.publicId,
    status: record.status,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    classId: record.classId,
    badgeTemplateId: record.badgeTemplateId,
    studentId: record.studentId,
    issuerUserId: record.issuerUserId,
    recipient: parseSnapshot(RecipientSnapshotSchema, record.recipientSnapshotJson, "recipient"),
    achievement: parseSnapshot(
      AchievementSnapshotSchema,
      record.achievementSnapshotJson,
      "achievement",
    ),
    issuer: parseSnapshot(IssuerSnapshotSchema, record.issuerSnapshotJson, "issuer"),
    credential: parseSnapshot(
      OpenBadgeCredentialSnapshotSchema,
      record.credentialJson,
      "credential",
    ),
    supersedes: record.supersedes,
    supersededBy: record.supersededBy,
  };
}

function toListRecord(record: IssuanceRecord): IssuanceListRecord {
  const detail = toDetail(record);
  return {
    id: detail.id,
    publicId: detail.publicId,
    status: detail.status,
    issuedAt: detail.issuedAt,
    expiresAt: detail.expiresAt,
    classId: detail.classId,
    classCourseCode: detail.achievement.class.courseCode,
    classTitle: detail.achievement.class.title,
    classSection: detail.achievement.class.section,
    badgeTemplateId: detail.badgeTemplateId,
    badgeName: detail.achievement.name,
    badgeImageUrl: detail.achievement.image.id,
    studentId: detail.studentId,
    studentNumber: detail.recipient.studentNumber,
    recipientDisplayName: detail.recipient.displayName,
    issuerUserId: detail.issuerUserId,
    issuerUserName: detail.issuer.issuerUserName,
  };
}

export function normalizeIssuanceFilters(
  raw: IssuanceFilters | undefined,
): NormalizedIssuanceFilters {
  return issuanceFiltersSchema.parse(raw ?? {});
}

function scopeWhere(actor: Actor, filters: NormalizedIssuanceFilters) {
  const where: Prisma.BadgeIssuanceWhereInput = {
    ...(actor.role === "FACULTY" ? { class: { ownerUserId: actor.id } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.badgeTemplateId ? { badgeTemplateId: filters.badgeTemplateId } : {}),
  };

  if (filters.query) {
    where.OR = [
      { recipientSnapshotJson: { path: "$.displayName", string_contains: filters.query } },
      { recipientSnapshotJson: { path: "$.studentNumber", string_contains: filters.query } },
      { achievementSnapshotJson: { path: "$.name", string_contains: filters.query } },
      { achievementSnapshotJson: { path: "$.class.courseCode", string_contains: filters.query } },
      { achievementSnapshotJson: { path: "$.class.title", string_contains: filters.query } },
    ];
  }

  return where;
}

export async function listIssuances(
  actor: Actor | null | undefined,
  rawFilters: IssuanceFilters = {},
): Promise<IssuanceListResult> {
  const authenticated = requireAuthenticated(actor);
  const filters = normalizeIssuanceFilters(rawFilters);
  const where = scopeWhere(authenticated, filters);
  const [rows, total] = await Promise.all([
    prisma.badgeIssuance.findMany({
      where,
      select: issuanceSelect,
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.badgeIssuance.count({ where }),
  ]);
  const totalPages = Math.ceil(total / pageSize);

  return {
    items: rows.map(toListRecord),
    page: filters.page,
    pageSize,
    total,
    totalPages,
    hasNext: filters.page < totalPages,
  };
}

export async function getIssuanceDetail(
  actor: Actor | null | undefined,
  issuanceId: string,
): Promise<IssuanceDetail> {
  const authenticated = requireAuthenticated(actor);
  const id = z.string().trim().min(1).max(191).safeParse(issuanceId);
  if (!id.success) throw new IssuanceNotFoundError();
  const record = await prisma.badgeIssuance.findFirst({
    where: {
      id: id.data,
      ...(authenticated.role === "FACULTY" ? { class: { ownerUserId: authenticated.id } } : {}),
    },
    select: issuanceSelect,
  });
  if (!record) throw new IssuanceNotFoundError();
  return toDetail(record);
}

export async function listIssueOptions(
  actor: Actor | null | undefined,
  classId: string,
): Promise<IssueOptions> {
  const faculty = requireRole(actor, "FACULTY");
  const id = z.string().trim().min(1).max(191).safeParse(classId);
  if (!id.success) throw new IssuanceNotFoundError();

  const ownedActiveClass = await prisma.class.findFirst({
    where: { id: id.data, ownerUserId: faculty.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!ownedActiveClass) throw new IssuanceNotFoundError();

  const [badgeOptions, enrollments] = await Promise.all([
    prisma.badgeTemplate.findMany({
      where: { classId: id.data, ownerUserId: faculty.id, status: "ACTIVE" },
      select: { id: true, name: true, imagePath: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.classStudent.findMany({
      where: { classId: id.data, enrollmentStatus: "ACTIVE" },
      select: {
        student: { select: { id: true, studentNumber: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
        { studentId: "asc" },
      ],
    }),
  ]);

  return {
    badgeOptions,
    studentOptions: enrollments.map(({ student }) => ({
      id: student.id,
      studentNumber: student.studentNumber,
      displayName: `${student.firstName} ${student.lastName}`,
    })),
  };
}

export async function listIssuanceExportRows(
  actor: Actor | null | undefined,
  rawFilters: IssuanceFilters = {},
): Promise<IssuanceExportRow[]> {
  const authenticated = requireAuthenticated(actor);
  const filters = normalizeIssuanceFilters(rawFilters);
  const rows = await prisma.badgeIssuance.findMany({
    where: scopeWhere(authenticated, filters),
    select: issuanceSelect,
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
  });
  return rows.map((record) => {
    const item = toListRecord(record);
    const recipient = parseSnapshot(
      RecipientSnapshotSchema,
      record.recipientSnapshotJson,
      "recipient",
    );
    return { ...item, recipientEmail: recipient.email };
  });
}
