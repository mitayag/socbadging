import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

export const sensitiveAuditActions = [
  "ADMIN_BOOTSTRAPPED",
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "account.updated",
  "account.password_changed",
  "student.invitation_created",
  "student.account_activated",
  "student.account_suspended",
  "student.account_reactivated",
  "student.recovery_requested",
  "student.password_reset",
  "student.password_reset_direct",
  "student.password_reset_link_requested",
  "student.password_changed",
  "notification.resend_requested",
  "faculty.created",
  "faculty.updated",
  "faculty.access_reset",
  "faculty.deleted",
  "faculty.profile_updated",
  "department.created",
  "department.renamed",
  "class.created",
  "class.updated",
  "roster.student_added",
  "roster.student_updated",
  "roster.import_previewed",
  "roster.import_committed",
  "badge.created",
  "badge.duplicated",
  "badge.updated",
  "badge.batch_previewed",
  "badge.batch_committed",
  "badge.issued",
  "badge.revoked",
  "settings.updated",
  "notification.retry_requested",
] as const;

export const auditLogPageSizes = [5, 10, 25, 50] as const;
export type AuditLogPageSize = (typeof auditLogPageSizes)[number];

const dateFilterSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

const auditLogFiltersSchema = z.object({
  query: z.string().trim().max(191).optional().catch(undefined),
  entityType: z.string().trim().max(100).optional().catch(undefined),
  action: z.enum(sensitiveAuditActions).optional().catch(undefined),
  from: dateFilterSchema,
  to: dateFilterSchema,
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(5).default(5),
});

export type AuditLogFilters = z.input<typeof auditLogFiltersSchema>;
export type NormalizedAuditLogFilters = {
  query?: string;
  entityType?: string;
  action?: (typeof sensitiveAuditActions)[number];
  from?: string;
  to?: string;
  page: number;
  pageSize: AuditLogPageSize;
};

export type AuditLogFacets = {
  entityTypes: string[];
  actions: Array<(typeof sensitiveAuditActions)[number]>;
};

export type AuditLogListItem = {
  id: string;
  action: (typeof sensitiveAuditActions)[number];
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type AuditLogResult = {
  items: AuditLogListItem[];
  filters: NormalizedAuditLogFilters;
  page: number;
  pageSize: AuditLogPageSize;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  facets: AuditLogFacets;
};

type CurrentAdministrator = {
  id: string;
  role: "ADMIN" | "FACULTY";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt: Date | null;
};

async function requireCurrentAdministrator(actor: Actor): Promise<void> {
  const user = (await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, role: true, status: true, deletedAt: true },
  })) as CurrentAdministrator | null;
  if (user?.role !== "ADMIN" || user.status !== "ACTIVE" || user.deletedAt !== null) {
    throw new AuthorizationError("Administrator access required");
  }
}

/**
 * Returns a narrow administrator-only activity view. Audit context, IP addresses, user agents,
 * and actor email addresses intentionally stay out of this DTO because they can contain private
 * student or security data.
 */
function searchWhere(query: string): Prisma.AuditLogWhereInput {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return {};
  return {
    AND: terms.map((term) => ({
      OR: [
        { action: { contains: term } },
        { entityType: { contains: term } },
        { actor: { name: { contains: term } } },
      ],
    })),
  };
}

function recordedAtWhere(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) filter.lte = new Date(`${to}T23:59:59.999Z`);
  return Object.keys(filter).length ? filter : undefined;
}

export function normalizeAuditLogFilters(
  raw: AuditLogFilters | undefined,
): NormalizedAuditLogFilters {
  const parsed = auditLogFiltersSchema.parse(raw ?? {});
  const pageSize = auditLogPageSizes.includes(parsed.pageSize as AuditLogPageSize)
    ? (parsed.pageSize as AuditLogPageSize)
    : 5;
  return {
    query: parsed.query,
    entityType: parsed.entityType,
    action: parsed.action,
    from: parsed.from,
    to: parsed.to,
    page: parsed.page,
    pageSize,
  };
}

async function auditFacets(): Promise<AuditLogFacets> {
  const entityTypes = await prisma.auditLog.findMany({
    where: { action: { in: [...sensitiveAuditActions] } },
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return {
    entityTypes: entityTypes.map((row) => row.entityType),
    actions: [...sensitiveAuditActions],
  };
}

/**
 * Returns a narrow administrator-only activity view. Audit context, IP addresses, user agents,
 * and actor email addresses intentionally stay out of this DTO because they can contain private
 * student or security data.
 */
export async function listAuditLogs(
  actor: Actor | null | undefined,
  rawFilters: AuditLogFilters = {},
): Promise<AuditLogResult> {
  const administrator = requireRole(actor, "ADMIN");
  await requireCurrentAdministrator(administrator);

  const filters = normalizeAuditLogFilters(rawFilters);
  const createdAt = recordedAtWhere(filters.from, filters.to);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action
      ? { action: filters.action }
      : { action: { in: [...sensitiveAuditActions] } }),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...searchWhere(filters.query ?? ""),
    ...(createdAt ? { createdAt } : {}),
  };

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const [records, facets] = await Promise.all([
    prisma.auditLog.findMany({
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
      skip: (page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    auditFacets(),
  ]);

  return {
    items: records.map((record) => ({
      id: record.id,
      action: record.action as AuditLogListItem["action"],
      entityType: record.entityType,
      entityId: record.entityId,
      actorName: record.actor?.name ?? null,
      createdAt: record.createdAt.toISOString(),
    })),
    filters: { ...filters, page },
    page,
    pageSize: filters.pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    facets,
  };
}
