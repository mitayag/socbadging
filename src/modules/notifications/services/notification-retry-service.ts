import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { loadEmailDeliveryConfig } from "@/config/env";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor, Role } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { isDeliveryRecipientAllowed } from "./recipient-policy";
import { RecipientSuppressedError } from "./recipient-suppression-core";

type LockedActor = { id: string; role: Role; status: string; deletedAt: Date | null };
type LockedDelivery = {
  id: string;
  status: string;
  recipientEmail: string;
  issuanceId: string;
  type: "BADGE_ISSUED" | "BADGE_REVOKED";
};

export async function retryNotification(
  actor: Actor | null | undefined,
  rawDeliveryId: string,
): Promise<{ alreadyQueued: boolean }> {
  const administrator = requireRole(actor, "ADMIN");
  const deliveryId = z.string().trim().min(1).max(191).parse(rawDeliveryId);
  return prisma.$transaction(async (tx) => {
    const [currentActor] = await tx.$queryRaw<LockedActor[]>(Prisma.sql`
      SELECT id, role, status, deleted_at AS deletedAt
      FROM users WHERE id = ${administrator.id} FOR UPDATE
    `);
    if (
      !currentActor ||
      currentActor.role !== "ADMIN" ||
      currentActor.status !== "ACTIVE" ||
      currentActor.deletedAt !== null
    ) {
      throw new AuthorizationError("Administrator access required");
    }
    const [delivery] = await tx.$queryRaw<LockedDelivery[]>(Prisma.sql`
      SELECT id, status, recipient_email AS recipientEmail, issuance_id AS issuanceId, type
      FROM notification_deliveries
      WHERE id = ${deliveryId} FOR UPDATE
    `);
    if (!delivery) throw new AuthorizationError("Notification unavailable");
    const suppression = await tx.recipientSuppression.findUnique({
      where: { normalizedEmail: delivery.recipientEmail.trim().toLowerCase() },
      select: { status: true, reason: true },
    });
    if (suppression?.status === "ACTIVE") {
      throw new RecipientSuppressedError(undefined, suppression.reason);
    }
    const emailConfig = loadEmailDeliveryConfig(process.env);
    if (
      !(await isDeliveryRecipientAllowed(
        tx,
        {
          issuanceId: delivery.issuanceId,
          type: delivery.type,
          recipientEmail: delivery.recipientEmail,
        },
        emailConfig.policy,
        emailConfig.allowlist,
      ))
    ) {
      throw new AuthorizationError("Recipient is not authorized for email delivery");
    }
    const controlledAttempt = await tx.smtpSubmissionAttempt.findUnique({
      where: { notificationDeliveryId: delivery.id },
      select: { id: true },
    });
    if (controlledAttempt) {
      throw new Error("Controlled acceptance notification cannot be retried");
    }
    if (delivery.status === "PENDING" || delivery.status === "PROCESSING") {
      return { alreadyQueued: true };
    }
    if (delivery.status !== "FAILED" && delivery.status !== "RETRY_SCHEDULED") {
      throw new AuthorizationError("Notification cannot be retried");
    }
    await tx.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "notification.retry_requested",
        entityType: "NotificationDelivery",
        entityId: deliveryId,
        contextJson: { notificationDeliveryId: deliveryId },
      },
    });
    return { alreadyQueued: false };
  });
}
