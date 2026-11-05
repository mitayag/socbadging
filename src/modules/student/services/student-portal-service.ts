import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { Actor } from "@/modules/identity/types";
import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
} from "@/modules/issuance/services/snapshot-schemas";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { prisma } from "@/platform/db/prisma";

import type {
  StudentBadgeListItem,
  StudentBadgeSort,
  StudentCredentialStatus,
  StudentDashboardData,
  StudentNotificationItem,
} from "../types";
import { getStudentAccountForActor } from "./student-account-service";

const pageSize = 12;
const identifierSchema = z.string().trim().min(1).max(191);

export class StudentBadgeNotFoundError extends Error {
  constructor() {
    super("Credential not found");
    this.name = "StudentBadgeNotFoundError";
  }
}

export function effectiveStudentStatus(
  status: "ACTIVE" | "REVOKED" | "EXPIRED",
  expiresAt: Date | null,
  now = new Date(),
): StudentCredentialStatus {
  if (status === "REVOKED") return "REVOKED";
  if (status === "EXPIRED" || (expiresAt && expiresAt <= now)) return "EXPIRED";
  return "ACTIVE";
}

function statusWhere(status: StudentCredentialStatus | undefined, now: Date) {
  if (status === "REVOKED") return { status: "REVOKED" as const };
  if (status === "EXPIRED") {
    return {
      OR: [{ status: "EXPIRED" as const }, { status: "ACTIVE" as const, expiresAt: { lte: now } }],
    };
  }
  if (status === "ACTIVE") {
    return {
      status: "ACTIVE" as const,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }
  return {};
}

function toListItem(record: {
  id: string;
  publicId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: Date;
  expiresAt: Date | null;
  achievementSnapshotJson: Prisma.JsonValue;
  issuerSnapshotJson: Prisma.JsonValue;
}): StudentBadgeListItem | null {
  const achievement = AchievementSnapshotSchema.safeParse(record.achievementSnapshotJson);
  const issuer = IssuerSnapshotSchema.safeParse(record.issuerSnapshotJson);
  if (!achievement.success || !issuer.success) return null;
  return {
    issuanceId: record.id,
    publicId: record.publicId,
    badgeName: achievement.data.name,
    description: achievement.data.description,
    imageUrl: achievement.data.image.id,
    issuerName: issuer.data.name,
    classLabel: `${achievement.data.class.courseCode} · ${achievement.data.class.title}`,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    status: effectiveStudentStatus(record.status, record.expiresAt),
  };
}

function orderByFor(sort: StudentBadgeSort) {
  if (sort === "issued_asc") return [{ issuedAt: "asc" as const }, { id: "asc" as const }];
  if (sort === "status") return [{ status: "asc" as const }, { issuedAt: "desc" as const }];
  return [{ issuedAt: "desc" as const }, { id: "desc" as const }];
}

export async function listStudentBadges(
  actor: Actor | null | undefined,
  filters: {
    query?: string;
    status?: StudentCredentialStatus;
    sort?: StudentBadgeSort;
    page?: number;
  } = {},
) {
  const account = await getStudentAccountForActor(actor);
  const now = new Date();
  const query = filters.query?.trim().slice(0, 191) ?? "";
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.BadgeIssuanceWhereInput = {
    studentId: account.studentId,
    ...statusWhere(filters.status, now),
    ...(query
      ? {
          OR: [
            { achievementSnapshotJson: { path: "$.name", string_contains: query } },
            { achievementSnapshotJson: { path: "$.class.courseCode", string_contains: query } },
            { achievementSnapshotJson: { path: "$.class.title", string_contains: query } },
            { issuerSnapshotJson: { path: "$.name", string_contains: query } },
          ],
        }
      : {}),
  };
  const rows = await prisma.badgeIssuance.findMany({
    where,
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      achievementSnapshotJson: true,
      issuerSnapshotJson: true,
    },
    orderBy: orderByFor(filters.sort ?? "issued_desc"),
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  });
  return {
    items: rows
      .slice(0, pageSize)
      .map(toListItem)
      .filter((item): item is StudentBadgeListItem => Boolean(item)),
    page,
    hasNext: rows.length > pageSize,
  };
}

export async function getStudentDashboard(
  actor: Actor | null | undefined,
): Promise<StudentDashboardData> {
  const account = await getStudentAccountForActor(actor);
  const now = new Date();
  const base = { studentId: account.studentId };
  const [total, active, expired, revoked, recentRows] = await Promise.all([
    prisma.badgeIssuance.count({ where: base }),
    prisma.badgeIssuance.count({
      where: { ...base, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    prisma.badgeIssuance.count({
      where: {
        ...base,
        OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }],
      },
    }),
    prisma.badgeIssuance.count({ where: { ...base, status: "REVOKED" } }),
    prisma.badgeIssuance.findMany({
      where: base,
      select: {
        id: true,
        publicId: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        achievementSnapshotJson: true,
        issuerSnapshotJson: true,
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: 5,
    }),
  ]);
  return {
    total,
    active,
    expired,
    revoked,
    recent: recentRows
      .map(toListItem)
      .filter((item): item is StudentBadgeListItem => Boolean(item)),
  };
}

export async function getStudentBadgeDetail(
  actor: Actor | null | undefined,
  rawIssuanceId: string,
) {
  const account = await getStudentAccountForActor(actor);
  const issuanceId = identifierSchema.safeParse(rawIssuanceId);
  if (!issuanceId.success) throw new StudentBadgeNotFoundError();
  const record = await prisma.badgeIssuance.findFirst({
    where: { id: issuanceId.data, studentId: account.studentId },
    select: { publicId: true },
  });
  if (!record) throw new StudentBadgeNotFoundError();
  try {
    const credential = await getPublicCredential(record.publicId);
    return { issuanceId: issuanceId.data, credential };
  } catch {
    throw new StudentBadgeNotFoundError();
  }
}

export async function listStudentNotifications(
  actor: Actor | null | undefined,
  page = 1,
): Promise<{ items: StudentNotificationItem[]; page: number; hasNext: boolean }> {
  const account = await getStudentAccountForActor(actor);
  const currentPage = Math.max(1, page);
  const rows = await prisma.notificationDelivery.findMany({
    where: { issuance: { studentId: account.studentId } },
    select: {
      id: true,
      type: true,
      status: true,
      badgeName: true,
      createdAt: true,
      sentAt: true,
      attemptCount: true,
      lastErrorCategory: true,
      safeDiagnosticCode: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * 20,
    take: 21,
  });
  return {
    items: rows.slice(0, 20).map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      badgeName: row.badgeName,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      attemptCount: row.attemptCount,
      lastErrorCategory: row.lastErrorCategory,
      safeDiagnosticCode: row.safeDiagnosticCode,
    })),
    page: currentPage,
    hasNext: rows.length > 20,
  };
}
