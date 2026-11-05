import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { AuthorizationError, requireStaff } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type {
  NotificationDeliveryStatus,
  NotificationProviderStatus,
  NotificationType,
} from "@/modules/notifications/types";
import { prisma } from "@/platform/db/prisma";

export const notificationPageSizes = [5, 10, 25, 50] as const;
export type NotificationPageSize = (typeof notificationPageSizes)[number];
const filtersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(5).default(5),
  status: z
    .enum(["PENDING", "PROCESSING", "RETRY_SCHEDULED", "SENT", "FAILED"])
    .optional()
    .catch(undefined),
  providerStatus: z
    .enum(["ACCEPTED", "DELIVERED", "DEFERRED", "BOUNCED", "BLOCKED", "INVALID", "COMPLAINT"])
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
  providerStatus: NotificationProviderStatus | null;
  maskedRecipientEmail: string;
  badgeName: string;
  deliveryChannel: string;
  attemptCount: number;
  lastErrorCategory: string | null;
  safeDiagnosticCode: string | null;
  createdAt: string;
  sentAt: string | null;
  smtpAcceptedAt: string | null;
  providerStatusAt: string | null;
  canRetry: boolean;
  canResend: boolean;
};

export class NotificationNotFoundError extends Error {
  constructor() {
    super("Notification not found");
    this.name = "NotificationNotFoundError";
  }
}

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

function facultyScope(actor: Actor): Prisma.NotificationDeliveryWhereInput {
  return actor.role === "FACULTY" ? { issuance: { class: { ownerUserId: actor.id } } } : {};
}

export async function listNotifications(
  actor: Actor | null | undefined,
  rawFilters: NotificationFilters = {},
) {
  const authenticated = requireStaff(actor);
  await requireCurrentActor(authenticated);
  const filters = filtersSchema.parse(rawFilters);
  const where: Prisma.NotificationDeliveryWhereInput = {
    ...facultyScope(authenticated),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.providerStatus ? { providerStatus: filters.providerStatus } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.query
      ? {
          OR: [
            { recipientEmail: { contains: filters.query } },
            { badgeName: { contains: filters.query } },
          ],
        }
      : {}),
  };
  const pageSize = notificationPageSizes.includes(filters.pageSize as NotificationPageSize)
    ? (filters.pageSize as NotificationPageSize)
    : 5;
  const total = await prisma.notificationDelivery.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const rows = await prisma.notificationDelivery.findMany({
    where,
    select: {
      id: true,
      type: true,
      status: true,
      providerStatus: true,
      recipientEmail: true,
      badgeName: true,
      deliveryChannel: true,
      attemptCount: true,
      lastErrorCategory: true,
      safeDiagnosticCode: true,
      createdAt: true,
      sentAt: true,
      smtpAcceptedAt: true,
      providerStatusAt: true,
      issuance: { select: { class: { select: { ownerUserId: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map((row): NotificationListItem => {
      const ownsIssuance = row.issuance.class.ownerUserId === authenticated.id;
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        providerStatus: row.providerStatus,
        maskedRecipientEmail: maskEmail(row.recipientEmail),
        badgeName: row.badgeName,
        deliveryChannel: row.deliveryChannel,
        attemptCount: row.attemptCount,
        lastErrorCategory: row.lastErrorCategory,
        safeDiagnosticCode: row.safeDiagnosticCode,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        smtpAcceptedAt: row.smtpAcceptedAt?.toISOString() ?? null,
        providerStatusAt: row.providerStatusAt?.toISOString() ?? null,
        canRetry:
          authenticated.role === "ADMIN" &&
          (row.status === "FAILED" || row.status === "RETRY_SCHEDULED"),
        canResend:
          row.status === "SENT" &&
          (authenticated.role === "ADMIN" || (authenticated.role === "FACULTY" && ownsIssuance)),
      };
    }),
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    role: authenticated.role,
  };
}

export async function getNotificationDetail(
  actor: Actor | null | undefined,
  rawDeliveryId: string,
) {
  const authenticated = requireStaff(actor);
  await requireCurrentActor(authenticated);
  const deliveryId = z.string().trim().min(1).max(191).parse(rawDeliveryId);
  const delivery = await prisma.notificationDelivery.findFirst({
    where: { id: deliveryId, ...facultyScope(authenticated) },
    select: {
      id: true,
      type: true,
      status: true,
      providerStatus: true,
      providerStatusAt: true,
      recipientEmail: true,
      badgeName: true,
      deliveryChannel: true,
      attemptCount: true,
      resendCount: true,
      lastResendAt: true,
      lastErrorCategory: true,
      safeDiagnosticCode: true,
      providerMessageId: true,
      smtpAcceptedAt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      issuance: {
        select: {
          id: true,
          publicId: true,
          class: { select: { ownerUserId: true } },
        },
      },
      attemptHistory: {
        orderBy: [{ attemptNumber: "desc" }],
        take: 50,
        select: {
          id: true,
          attemptNumber: true,
          deliveryChannel: true,
          outcome: true,
          providerMessageId: true,
          safeDiagnosticCode: true,
          errorCategory: true,
          startedAt: true,
          completedAt: true,
        },
      },
      deliveryEvents: {
        orderBy: [{ occurredAt: "desc" }, { receivedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          source: true,
          eventType: true,
          providerStatus: true,
          providerMessageId: true,
          occurredAt: true,
          receivedAt: true,
          applied: true,
        },
      },
    },
  });
  if (!delivery) throw new NotificationNotFoundError();
  const ownsIssuance = delivery.issuance.class.ownerUserId === authenticated.id;
  return {
    id: delivery.id,
    type: delivery.type,
    status: delivery.status,
    providerStatus: delivery.providerStatus,
    providerStatusAt: delivery.providerStatusAt?.toISOString() ?? null,
    maskedRecipientEmail: maskEmail(delivery.recipientEmail),
    badgeName: delivery.badgeName,
    deliveryChannel: delivery.deliveryChannel,
    attemptCount: delivery.attemptCount,
    resendCount: delivery.resendCount,
    lastResendAt: delivery.lastResendAt?.toISOString() ?? null,
    lastErrorCategory: delivery.lastErrorCategory,
    safeDiagnosticCode: delivery.safeDiagnosticCode,
    providerMessageId: delivery.providerMessageId,
    smtpAcceptedAt: delivery.smtpAcceptedAt?.toISOString() ?? null,
    sentAt: delivery.sentAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
    issuanceId: delivery.issuance.id,
    publicId: delivery.issuance.publicId,
    canRetry:
      authenticated.role === "ADMIN" &&
      (delivery.status === "FAILED" || delivery.status === "RETRY_SCHEDULED"),
    canResend:
      delivery.status === "SENT" &&
      (authenticated.role === "ADMIN" || (authenticated.role === "FACULTY" && ownsIssuance)),
    attempts: delivery.attemptHistory.map((attempt) => ({
      ...attempt,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
    })),
    events: delivery.deliveryEvents.map((event) => ({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
    })),
  };
}

export async function getIssuanceNotificationStatus(
  actor: Actor | null | undefined,
  issuanceId: string,
): Promise<NotificationDeliveryStatus | null> {
  const authenticated = requireStaff(actor);
  await requireCurrentActor(authenticated);
  const id = z.string().trim().min(1).max(191).parse(issuanceId);
  const delivery = await prisma.notificationDelivery.findFirst({
    where: {
      issuanceId: id,
      ...facultyScope(authenticated),
    },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  return delivery?.status ?? null;
}
