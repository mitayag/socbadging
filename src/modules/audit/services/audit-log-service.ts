import "server-only";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

export const sensitiveAuditActions = [
  "ADMIN_BOOTSTRAPPED",
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
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

export type AuditLogListItem = {
  id: string;
  action: (typeof sensitiveAuditActions)[number];
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
};

type CurrentAdministrator = {
  id: string;
  role: "ADMIN" | "FACULTY";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
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
export async function listAuditLogs(actor: Actor | null | undefined): Promise<AuditLogListItem[]> {
  const administrator = requireRole(actor, "ADMIN");
  await requireCurrentAdministrator(administrator);

  const records = await prisma.auditLog.findMany({
    where: { action: { in: [...sensitiveAuditActions] } },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  return records.map((record) => ({
    id: record.id,
    action: record.action as AuditLogListItem["action"],
    entityType: record.entityType,
    entityId: record.entityId,
    actorName: record.actor?.name ?? null,
    createdAt: record.createdAt.toISOString(),
  }));
}
