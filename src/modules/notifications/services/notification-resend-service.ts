import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { loadEmailDeliveryConfig } from "@/config/env";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { isDeliveryRecipientAllowed } from "./recipient-policy";

const idSchema = z.string().trim().min(1).max(191);
const cooldownMs = 60_000;

type CurrentActor = { id: string; role: string; status: string; deletedAt: Date | null };
type LockedDelivery = {
  id: string;
  issuanceId: string;
  type: string;
  status: string;
  deliveryChannel: string;
  recipientEmail: string;
  lastResendAt: Date | null;
  classOwnerId: string;
};

export class NotificationResendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationResendError";
  }
}

export async function resendIssuedNotification(
  actor: Actor | null | undefined,
  input: { deliveryId?: string; issuanceId?: string },
): Promise<{ alreadyQueued: boolean; deliveryId: string }> {
  const authenticated = requireRole(actor, ["ADMIN", "FACULTY"]);
  const deliveryId = input.deliveryId ? idSchema.parse(input.deliveryId) : null;
  const issuanceId = input.issuanceId ? idSchema.parse(input.issuanceId) : null;
  if (!deliveryId && !issuanceId) throw new NotificationResendError("Notification is unavailable");

  return prisma.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<CurrentActor[]>(Prisma.sql`
      SELECT id, role, status, deleted_at AS deletedAt
      FROM users WHERE id = ${authenticated.id} FOR UPDATE
    `);
    if (
      !current ||
      current.role !== authenticated.role ||
      current.status !== "ACTIVE" ||
      current.deletedAt !== null
    ) {
      throw new AuthorizationError("Active account required");
    }
    const [delivery] = await tx.$queryRaw<LockedDelivery[]>(Prisma.sql`
      SELECT nd.id, nd.issuance_id AS issuanceId, nd.type, nd.status,
        nd.delivery_channel AS deliveryChannel, nd.recipient_email AS recipientEmail,
        nd.last_resend_at AS lastResendAt, c.owner_user_id AS classOwnerId
      FROM notification_deliveries nd
      INNER JOIN badge_issuances bi ON bi.id = nd.issuance_id
      INNER JOIN classes c ON c.id = bi.class_id
      WHERE ${deliveryId ? Prisma.sql`nd.id = ${deliveryId}` : Prisma.sql`nd.issuance_id = ${issuanceId} AND nd.type = 'BADGE_ISSUED'`}
      FOR UPDATE
    `);
    if (!delivery || delivery.type !== "BADGE_ISSUED") {
      throw new NotificationResendError("Notification is unavailable");
    }
    const suppression = await tx.recipientSuppression.findUnique({
      where: { normalizedEmail: delivery.recipientEmail.trim().toLowerCase() },
      select: { status: true },
    });
    if (suppression?.status === "ACTIVE") {
      throw new NotificationResendError(
        "Recipient is suppressed. An Administrator must clear the suppression before sending.",
      );
    }
    const controlledAttempt = await tx.smtpSubmissionAttempt.findUnique({
      where: { notificationDeliveryId: delivery.id },
      select: { id: true },
    });
    if (controlledAttempt) {
      throw new NotificationResendError("Controlled acceptance notification cannot be resent");
    }
    if (authenticated.role === "FACULTY" && delivery.classOwnerId !== authenticated.id) {
      throw new AuthorizationError("Notification is unavailable");
    }
    const emailConfig = loadEmailDeliveryConfig(process.env);
    if (delivery.deliveryChannel !== emailConfig.mode) {
      throw new NotificationResendError(
        "Notification belongs to a different email delivery channel",
      );
    }
    if (
      !(await isDeliveryRecipientAllowed(
        tx,
        {
          issuanceId: delivery.issuanceId,
          type: "BADGE_ISSUED",
          recipientEmail: delivery.recipientEmail,
        },
        emailConfig.policy,
        emailConfig.allowlist,
      ))
    ) {
      throw new NotificationResendError("Recipient is not authorized for external email");
    }
    if (delivery.status === "PENDING" || delivery.status === "PROCESSING") {
      return { alreadyQueued: true, deliveryId: delivery.id };
    }
    const now = new Date();
    if (delivery.lastResendAt && now.valueOf() - delivery.lastResendAt.valueOf() < cooldownMs) {
      throw new NotificationResendError("Please wait before resending this notification");
    }
    await tx.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        nextAttemptAt: now,
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
        resendCount: { increment: 1 },
        lastResendAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: authenticated.id,
        action: "notification.resend_requested",
        entityType: "NotificationDelivery",
        entityId: delivery.id,
        contextJson: { notificationDeliveryId: delivery.id, issuanceId: delivery.issuanceId },
      },
    });
    return { alreadyQueued: false, deliveryId: delivery.id };
  });
}
