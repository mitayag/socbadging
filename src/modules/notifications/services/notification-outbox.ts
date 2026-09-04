import "server-only";

import type { Prisma } from "@prisma/client";

type EnqueueNotificationInput = {
  issuanceId: string;
  recipientEmail: string;
  recipientFirstName: string;
  badgeName: string;
  issuerName: string;
  verificationUrl: string;
  occurredAt: Date;
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
      recipientEmail: input.recipientEmail,
      recipientFirstName: input.recipientFirstName,
      badgeName: input.badgeName,
      issuerName: input.issuerName,
      verificationUrl: input.verificationUrl,
      occurredAt: input.occurredAt,
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
