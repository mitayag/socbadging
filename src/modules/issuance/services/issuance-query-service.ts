import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole, requireStaff } from "@/modules/identity/policies/authorization";
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

export const issuancePageSizes = [5, 10, 25, 50] as const;
export type IssuancePageSize = (typeof issuancePageSizes)[number];
export type IssuanceSort = "issued_desc" | "issued_asc" | "status";

const issuanceFiltersSchema = z.object({
  query: z.string().trim().max(191).optional().catch(undefined),
  status: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]).optional().catch(undefined),
  classId: z.string().trim().min(1).max(191).optional().catch(undefined),
  badgeTemplateId: z.string().trim().min(1).max(191).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(5).default(5),
  sort: z.enum(["issued_desc", "issued_asc", "status"]).catch("issued_desc").default("issued_desc"),
});

export type IssuanceFilters = z.input<typeof issuanceFiltersSchema>;
export type NormalizedIssuanceFilters = z.output<typeof issuanceFiltersSchema>;
export type IssuanceListRecord = Omit<IssuanceListItem, "recipientEmail"> & {
  dataIntegrity?: "INVALID";
};
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
  filters: NormalizedIssuanceFilters;
  page: number;
  pageSize: IssuancePageSize;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
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

function invalidListRecord(record: IssuanceRecord): IssuanceListRecord {
  console.warn("issuance.list.invalid_snapshot", {
    issuanceId: record.id,
    recipientValid: RecipientSnapshotSchema.safeParse(record.recipientSnapshotJson).success,
    achievementValid: AchievementSnapshotSchema.safeParse(record.achievementSnapshotJson).success,
    issuerValid: IssuerSnapshotSchema.safeParse(record.issuerSnapshotJson).success,
  });
  return {
    id: record.id,
    publicId: record.publicId,
    status: record.status,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    classId: record.classId,
    classCourseCode: "—",
    classTitle: "Snapshot unavailable",
    classSection: "—",
    badgeTemplateId: record.badgeTemplateId,
    badgeName: "Credential data unavailable",
    badgeImageUrl: "",
    studentId: record.studentId,
    studentNumber: "—",
    recipientDisplayName: "Unavailable record",
    issuerUserId: record.issuerUserId,
    issuerUserName: "System",
    dataIntegrity: "INVALID",
  };
}

function toListRecord(record: IssuanceRecord): IssuanceListRecord {
  const recipient = RecipientSnapshotSchema.safeParse(record.recipientSnapshotJson);
  const achievement = AchievementSnapshotSchema.safeParse(record.achievementSnapshotJson);
  const issuer = IssuerSnapshotSchema.safeParse(record.issuerSnapshotJson);
  if (!recipient.success || !achievement.success || !issuer.success) {
    return invalidListRecord(record);
  }
  return {
    id: record.id,
    publicId: record.publicId,
    status: record.status,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    classId: record.classId,
    classCourseCode: achievement.data.class.courseCode,
    classTitle: achievement.data.class.title,
    classSection: achievement.data.class.section,
    badgeTemplateId: record.badgeTemplateId,
    badgeName: achievement.data.name,
    badgeImageUrl: achievement.data.image.id,
    studentId: record.studentId,
    studentNumber: recipient.data.studentNumber,
    recipientDisplayName: recipient.data.displayName,
    issuerUserId: record.issuerUserId,
    issuerUserName: issuer.data.issuerUserName,
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

function orderByFor(sort: IssuanceSort): Prisma.BadgeIssuanceOrderByWithRelationInput[] {
  if (sort === "issued_asc") return [{ issuedAt: "asc" }, { id: "asc" }];
  if (sort === "status") {
    return [{ status: "asc" }, { issuedAt: "desc" }, { id: "desc" }];
  }
  return [{ issuedAt: "desc" }, { id: "desc" }];
}

export async function listIssuances(
  actor: Actor | null | undefined,
  rawFilters: IssuanceFilters = {},
): Promise<IssuanceListResult> {
  const authenticated = requireStaff(actor);
  const raw = normalizeIssuanceFilters(rawFilters);
  const pageSize = issuancePageSizes.includes(raw.pageSize as IssuancePageSize)
    ? (raw.pageSize as IssuancePageSize)
    : 5;
  const filters = { ...raw, pageSize };
  const where = scopeWhere(authenticated, filters);
  const total = await prisma.badgeIssuance.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const rows = await prisma.badgeIssuance.findMany({
    where,
    select: issuanceSelect,
    orderBy: orderByFor(filters.sort),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(toListRecord),
    filters: { ...filters, page },
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export async function getIssuanceDetail(
  actor: Actor | null | undefined,
  issuanceId: string,
): Promise<IssuanceDetail> {
  const authenticated = requireStaff(actor);
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
  try {
    return toDetail(record);
  } catch {
    throw new IssuanceNotFoundError();
  }
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
  const authenticated = requireStaff(actor);
  const filters = normalizeIssuanceFilters(rawFilters);
  const rows = await prisma.badgeIssuance.findMany({
    where: scopeWhere(authenticated, filters),
    select: issuanceSelect,
    orderBy: orderByFor(filters.sort),
  });
  return rows.map((record) => {
    const item = toListRecord(record);
    const recipient = RecipientSnapshotSchema.safeParse(record.recipientSnapshotJson);
    return {
      ...item,
      recipientEmail: recipient.success ? recipient.data.email : "",
    };
  });
}
