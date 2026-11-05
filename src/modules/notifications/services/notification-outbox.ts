import "server-only";

import type { Prisma } from "@prisma/client";

import { loadEmailDeliveryConfig } from "@/config/env";

type EnqueueNotificationInput = {
  issuanceId: string;
  recipientEmail: string;
  recipientFirstName: string;
  badgeName: string;
  badgeImageUrl?: string;
  issuerName: string;
  verificationUrl: string;
  occurredAt: Date;
  expiresAt?: Date | null;
  supportContact?: string;
};

async function enqueue(
  tx: Prisma.TransactionClient,
  type: "BADGE_ISSUED" | "BADGE_REVOKED",
  input: EnqueueNotificationInput,
) {
  return tx.notificationDelivery.create({
    data: {
      issuanceId: input.issuanceId,
      type,
      status: "PENDING",
      deliveryChannel: loadEmailDeliveryConfig(process.env).mode,
      recipientEmail: input.recipientEmail,
      recipientFirstName: input.recipientFirstName,
      badgeName: input.badgeName,
      badgeImageUrl: input.badgeImageUrl,
      issuerName: input.issuerName,
      verificationUrl: input.verificationUrl,
      occurredAt: input.occurredAt,
      expiresAt: input.expiresAt,
      supportContact: input.supportContact,
    },
  });
}

export function enqueueIssuedNotification(
  tx: Prisma.TransactionClient,
  input: EnqueueNotificationInput,
) {
  return enqueue(tx, "BADGE_ISSUED", input);
}

export function enqueueRevokedNotification(
  tx: Prisma.TransactionClient,
  input: EnqueueNotificationInput,
) {
  return enqueue(tx, "BADGE_REVOKED", input);
}
