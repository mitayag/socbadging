import "server-only";

import { Prisma } from "@prisma/client";

import { requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import type {
  DashboardActivity,
  DashboardCredentialStatus,
  DashboardData,
  DashboardIssuance,
  DashboardPagination,
  DashboardQuickAction,
  DashboardStats,
  DashboardTrendPoint,
} from "../types";

export const dashboardRecordPageSize = 5;
const trendDays = 14;

const dashboardActivityActions = [
  "faculty.created",
  "faculty.updated",
  "faculty.access_reset",
  "faculty.deleted",
  "department.created",
  "department.renamed",
  "department.archived",
  "department.reopened",
  "class.created",
  "class.updated",
  "class.archived",
  "class.reopened",
  "roster.student_added",
  "roster.student_updated",
  "roster.student_removed",
  "roster.student_restored",
  "roster.import_previewed",
  "roster.import_committed",
  "badge.created",
  "badge.duplicated",
  "badge.updated",
  "badge.archived",
  "badge.reopened",
  "badge.batch_previewed",
  "badge.batch_committed",
  "badge.issued",
  "badge.revoked",
  "badge.replaced",
  "settings.updated",
  "notification.retry_requested",
  "signing-key.registered",
  "signing-key.activated",
  "signing-key.retired",
  "signing-key.compromised",
] as const;

const activityLabels: Record<string, string> = {
  "faculty.created": "Faculty account created",
  "faculty.updated": "Faculty details updated",
  "faculty.access_reset": "Faculty access reset",
  "faculty.deleted": "Faculty account deleted",
  "department.created": "Department created",
  "department.renamed": "Department renamed",
  "department.archived": "Department archived",
  "department.reopened": "Department reopened",
  "class.created": "Class created",
  "class.updated": "Class updated",
  "class.archived": "Class archived",
  "class.reopened": "Class reopened",
  "roster.student_added": "Student added to roster",
  "roster.student_updated": "Roster student updated",
  "roster.student_removed": "Student removed from roster",
  "roster.student_restored": "Student enrollment restored",
  "roster.import_previewed": "Roster import previewed",
  "roster.import_committed": "Roster import committed",
  "badge.created": "Badge template created",
  "badge.duplicated": "Badge template duplicated",
  "badge.updated": "Badge template updated",
  "badge.archived": "Badge template archived",
  "badge.reopened": "Badge template reopened",
  "badge.batch_previewed": "Batch issuance previewed",
  "badge.batch_committed": "Batch issuance committed",
  "badge.issued": "Badge issued",
  "badge.revoked": "Credential revoked",
  "badge.replaced": "Credential replaced",
  "settings.updated": "Issuer settings updated",
  "notification.retry_requested": "Notification retry requested",
  "signing-key.registered": "Signing key registered",
  "signing-key.activated": "Signing key activated",
  "signing-key.retired": "Signing key retired",
  "signing-key.compromised": "Signing key marked compromised",
};

type TrendRow = { day: string | Date; count: bigint | number };
type CountRow = { count: bigint | number };

type IssuanceRecord = {
  id: string;
  publicId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: Date;
  expiresAt: Date | null;
  recipientSnapshotJson: Prisma.JsonValue;
  achievementSnapshotJson: Prisma.JsonValue;
};

function numberFromDatabase(value: bigint | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildDashboardPagination(
  total: number,
  requestedPage: number,
  pageSize = dashboardRecordPageSize,
): DashboardPagination {
  const safeTotal = numberFromDatabase(total);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const page = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
    totalPages,
  );
  return {
    page,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function privacySafeRecipientName(snapshot: Prisma.JsonValue | null): string {
  const recipient = asRecord(snapshot);
  if (!recipient) return "Recipient";
  const firstName = stringValue(recipient.firstName);
  const lastName = stringValue(recipient.lastName);
  if (firstName && lastName) return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
  const displayName = stringValue(recipient.displayName);
  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0]} ${parts.at(-1)?.charAt(0).toUpperCase()}.`;
    return parts[0] ?? "Recipient";
  }
  return "Recipient";
}

function issuancePresentation(record: IssuanceRecord, now: Date): DashboardIssuance {
  const achievement = asRecord(record.achievementSnapshotJson);
  const achievementClass = asRecord(achievement?.class ?? null);
  const courseCode = stringValue(achievementClass?.courseCode);
  const classTitle = stringValue(achievementClass?.title);
  return {
    id: record.id,
    publicId: record.publicId,
    badgeName: stringValue(achievement?.name) ?? "Badge",
    classLabel: [courseCode, classTitle].filter(Boolean).join(" · ") || "Class",
    recipientDisplayName: privacySafeRecipientName(record.recipientSnapshotJson),
    issuedAt: record.issuedAt.toISOString(),
    status: effectiveCredentialStatus(record.status, record.expiresAt, now),
  };
}

export function effectiveCredentialStatus(
  status: "ACTIVE" | "REVOKED" | "EXPIRED",
  expiresAt: Date | null,
  now = new Date(),
): DashboardCredentialStatus {
  if (status === "REVOKED") return "REVOKED";
  if (status === "EXPIRED") return "EXPIRED";
  if (expiresAt && expiresAt.valueOf() <= now.valueOf()) return "EXPIRED";
  return "ACTIVE";
}

export function buildTrendSeries(
  rows: TrendRow[],
  start: Date,
  days = trendDays,
): DashboardTrendPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date =
      row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
    counts.set(date, numberFromDatabase(row.count));
  }
  return Array.from({ length: days }, (_, index) => {
    const point = new Date(start);
    point.setUTCDate(start.getUTCDate() + index);
    const date = point.toISOString().slice(0, 10);
    return { date, count: counts.get(date) ?? 0 };
  });
}

export function dashboardActivityLabel(action: string): string {
  return (
    activityLabels[action] ??
    action.replace(/[._]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function trendStart(now: Date): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  start.setUTCDate(start.getUTCDate() - (trendDays - 1));
  return start;
}

async function countOwnedStudents(actorId: string): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT cs.student_id) AS count
    FROM class_students cs
    INNER JOIN classes c ON c.id = cs.class_id
    WHERE c.owner_user_id = ${actorId}
      AND cs.enrollment_status = 'ACTIVE'
  `);
  return numberFromDatabase(rows[0]?.count);
}

async function readTrend(actor: Actor, start: Date): Promise<DashboardTrendPoint[]> {
  const rows =
    actor.role === "FACULTY"
      ? await prisma.$queryRaw<TrendRow[]>(Prisma.sql`
          SELECT DATE_FORMAT(issued_at, '%Y-%m-%d') AS day, COUNT(*) AS count
          FROM badge_issuances
          WHERE issued_at >= ${start}
            AND class_id IN (
              SELECT id FROM classes WHERE owner_user_id = ${actor.id}
            )
          GROUP BY DATE_FORMAT(issued_at, '%Y-%m-%d')
          ORDER BY day ASC
        `)
      : await prisma.$queryRaw<TrendRow[]>(Prisma.sql`
          SELECT DATE_FORMAT(issued_at, '%Y-%m-%d') AS day, COUNT(*) AS count
          FROM badge_issuances
          WHERE issued_at >= ${start}
          GROUP BY DATE_FORMAT(issued_at, '%Y-%m-%d')
          ORDER BY day ASC
        `);
  return buildTrendSeries(rows, start);
}

function quickActions(actor: Actor, firstActiveClassId: string | null): DashboardQuickAction[] {
  if (actor.role === "ADMIN") {
    return [
      {
        label: "Create Faculty",
        href: "/faculty",
        description: "Add an authorized faculty account.",
        icon: "users",
      },
      {
        label: "Manage Classes",
        href: "/classes",
        description: "Inspect class workspaces and rosters.",
        icon: "book",
      },
      {
        label: "Review Issued Badges",
        href: "/issued",
        description: "Search and export credential records.",
        icon: "award",
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        description: "Review sensitive system activity.",
        icon: "clipboard",
      },
    ];
  }

  return [
    {
      label: "Create Class",
      href: "/classes",
      description: "Start a new class workspace.",
      icon: "plus",
    },
    {
      label: "Create Badge",
      href: firstActiveClassId ? `/classes/${firstActiveClassId}/badges` : "/classes",
      description: firstActiveClassId
        ? "Design a badge template for your class."
        : "Create a class before adding badges.",
      icon: "badge",
    },
    {
      label: "Issue Badge",
      href: firstActiveClassId ? `/classes/${firstActiveClassId}/issued` : "/classes",
      description: firstActiveClassId
        ? "Issue a badge to an enrolled student."
        : "Create a class before issuing badges.",
      icon: "issue",
    },
    {
      label: "View Issued Badges",
      href: "/issued",
      description: "Review your credential records.",
      icon: "award",
    },
  ];
}

type ActivityRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  actor: { name: string } | null;
};

function activityPresentation(activity: ActivityRecord): DashboardActivity {
  return {
    id: activity.id,
    action: activity.action,
    label: dashboardActivityLabel(activity.action),
    entityType: activity.entityType,
    entityId: activity.entityId,
    actorName: activity.actor?.name ?? null,
    createdAt: activity.createdAt.toISOString(),
  };
}

export async function getDashboardData(
  actor: Actor | null | undefined,
  options: { issuancePage?: number; activityPage?: number } = {},
): Promise<DashboardData> {
  const authenticated = requireRole(actor, ["ADMIN", "FACULTY"]);
  const now = new Date();
  const start = trendStart(now);
  const facultyScope = authenticated.role === "FACULTY";

  const issuanceScope = facultyScope ? { class: { ownerUserId: authenticated.id } } : {};
  const classScope = facultyScope ? { ownerUserId: authenticated.id } : {};
  const badgeScope = facultyScope ? { ownerUserId: authenticated.id } : {};
  const activeWhere = {
    ...issuanceScope,
    status: "ACTIVE" as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const revokedWhere = { ...issuanceScope, status: "REVOKED" as const };
  const expiredWhere = {
    ...issuanceScope,
    OR: [{ status: "EXPIRED" as const }, { status: "ACTIVE" as const, expiresAt: { lte: now } }],
  };
  const activityWhere = facultyScope
    ? { actorUserId: authenticated.id, action: { in: [...dashboardActivityActions] } }
    : { action: { in: [...dashboardActivityActions] } };

  const [
    facultyAccounts,
    classes,
    students,
    badgeTemplates,
    issuedBadges,
    activeCredentials,
    revokedCredentials,
    expiredCredentials,
    activityTotal,
    trend,
    firstActiveClass,
  ] = await Promise.all([
    facultyScope
      ? Promise.resolve(null)
      : prisma.user.count({ where: { role: "FACULTY", status: { not: "DELETED" } } }),
    prisma.class.count({ where: classScope }),
    facultyScope ? countOwnedStudents(authenticated.id) : prisma.student.count(),
    prisma.badgeTemplate.count({ where: badgeScope }),
    prisma.badgeIssuance.count({ where: issuanceScope }),
    prisma.badgeIssuance.count({ where: activeWhere }),
    prisma.badgeIssuance.count({ where: revokedWhere }),
    prisma.badgeIssuance.count({ where: expiredWhere }),
    prisma.auditLog.count({ where: activityWhere }),
    readTrend(authenticated, start),
    facultyScope
      ? prisma.class.findFirst({
          where: { ownerUserId: authenticated.id, status: "ACTIVE" },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const issuancePagination = buildDashboardPagination(issuedBadges, options.issuancePage ?? 1);
  const activityPagination = buildDashboardPagination(activityTotal, options.activityPage ?? 1);
  const [recentIssuances, recentActivities] = await Promise.all([
    prisma.badgeIssuance.findMany({
      where: issuanceScope,
      select: {
        id: true,
        publicId: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        recipientSnapshotJson: true,
        achievementSnapshotJson: true,
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip: (issuancePagination.page - 1) * dashboardRecordPageSize,
      take: dashboardRecordPageSize,
    }),
    prisma.auditLog.findMany({
      where: activityWhere,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (activityPagination.page - 1) * dashboardRecordPageSize,
      take: dashboardRecordPageSize,
    }),
  ]);

  const stats: DashboardStats = {
    facultyAccounts,
    classes,
    students,
    badgeTemplates,
    issuedBadges,
    activeCredentials,
    revokedCredentials,
    expiredCredentials,
  };

  return {
    role: authenticated.role as "ADMIN" | "FACULTY",
    stats,
    recentIssuances: recentIssuances.map((record) => issuancePresentation(record, now)),
    issuancePagination,
    recentActivities: recentActivities.map(activityPresentation),
    activityPagination,
    trend,
    trendDays,
    quickActions: quickActions(authenticated, firstActiveClass?.id ?? null),
  };
}

export async function listDashboardActivities(
  actor: Actor | null | undefined,
  page = 1,
): Promise<{ items: DashboardActivity[]; page: number; hasNext: boolean }> {
  const authenticated = requireRole(actor, ["ADMIN", "FACULTY"]);
  const pageSize = 20;
  const currentPage = Math.max(1, page);
  const where =
    authenticated.role === "FACULTY"
      ? { actorUserId: authenticated.id, action: { in: [...dashboardActivityActions] } }
      : { action: { in: [...dashboardActivityActions] } };
  const rows = await prisma.auditLog.findMany({
    where,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize + 1,
  });
  return {
    items: rows.slice(0, pageSize).map(activityPresentation),
    page: currentPage,
    hasNext: rows.length > pageSize,
  };
}
