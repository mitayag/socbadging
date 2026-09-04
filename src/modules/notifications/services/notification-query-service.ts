import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
  requireRole,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type { NotificationDeliveryStatus, NotificationType } from "@/modules/notifications/types";
import { prisma } from "@/platform/db/prisma";

const pageSize = 20;
const filtersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  status: z
    .enum(["PENDING", "PROCESSING", "RETRY_SCHEDULED", "SENT", "FAILED"])
    .optional()
    .catch(undefined),
  type: z.enum(["BADGE_ISSUED", "BADGE_REVOKED"]).optional().catch(undefined),
  query: z.string().trim().max(191).optional().catch(undefined),
});

export type NotificationFilters = z.input<typeof filtersSchema>;
export type NotificationListItem = {
  id: string;
  type: NotificationType;
  status: NotificationDeliveryStatus;
  maskedRecipientEmail: string;
  badgeName: string;
  attemptCount: number;
  lastErrorCategory: string | null;
  safeDiagnosticCode: string | null;
  createdAt: string;
  sentAt: string | null;
  canRetry: boolean;
};

async function requireCurrentActor(actor: Actor): Promise<void> {
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { role: true, status: true, deletedAt: true },
  });
  if (
    !current ||
    current.role !== actor.role ||
    current.status !== "ACTIVE" ||
    current.deletedAt !== null
  ) {
    throw new AuthorizationError("Active account required");
  }
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "***";
  return `${email[0]}***${email.slice(separator)}`;
}

export async function listNotifications(
  actor: Actor | null | undefined,
  rawFilters: NotificationFilters = {},
) {
  const administrator = requireRole(actor, "ADMIN");
  await requireCurrentActor(administrator);
  const filters = filtersSchema.parse(rawFilters);
  const where: Prisma.NotificationDeliveryWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.query ? { recipientEmail: { contains: filters.query } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where,
      select: {
        id: true,
        type: true,
        status: true,
        recipientEmail: true,
        badgeName: true,
        attemptCount: true,
        lastErrorCategory: true,
        safeDiagnosticCode: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationDelivery.count({ where }),
  ]);
  const totalPages = Math.ceil(total / pageSize);
  return {
    items: rows.map((row): NotificationListItem => ({
      id: row.id,
      type: row.type,
      status: row.status,
      maskedRecipientEmail: maskEmail(row.recipientEmail),
      badgeName: row.badgeName,
      attemptCount: row.attemptCount,
      lastErrorCategory: row.lastErrorCategory,
      safeDiagnosticCode: row.safeDiagnosticCode,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      canRetry: row.status === "FAILED" || row.status === "RETRY_SCHEDULED",
    })),
    page: filters.page,
    pageSize,
    total,
    totalPages,
    hasNext: filters.page < totalPages,
  };
}

export async function getIssuanceNotificationStatus(
  actor: Actor | null | undefined,
  issuanceId: string,
): Promise<NotificationDeliveryStatus | null> {
  const authenticated = requireAuthenticated(actor);
  await requireCurrentActor(authenticated);
  const id = z.string().trim().min(1).max(191).parse(issuanceId);
  const delivery = await prisma.notificationDelivery.findFirst({
    where: {
      issuanceId: id,
      ...(authenticated.role === "FACULTY"
        ? { issuance: { class: { ownerUserId: authenticated.id } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  return delivery?.status ?? null;
}
