import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";

import { isRecipientAllowedByPolicy, type EmailRecipientPolicy } from "@/config/env";
import { RecipientSnapshotSchema } from "@/modules/issuance/services/snapshot-schemas";

type DatabaseClient =
  Pick<PrismaClient, "badgeIssuance"> | Pick<Prisma.TransactionClient, "badgeIssuance">;

export type DeliveryRecipient = {
  issuanceId: string;
  type: NotificationType;
  recipientEmail: string;
};

function parseRecipientEmail(value: Prisma.JsonValue): string | null {
  const normalized = typeof value === "string" ? (JSON.parse(value) as Prisma.JsonValue) : value;
  const parsed = RecipientSnapshotSchema.safeParse(normalized);
  return parsed.success ? parsed.data.email.trim().toLowerCase() : null;
}

/**
 * Production/staging delivery must be tied to an actual issuance envelope and its immutable
 * recipient snapshot. This prevents arbitrary recipient substitution at the queue layer.
 */
export async function isSystemIssuedDeliveryRecipient(
  db: DatabaseClient,
  delivery: DeliveryRecipient,
): Promise<boolean> {
  const issuance = await db.badgeIssuance.findUnique({
    where: { id: delivery.issuanceId },
    select: { recipientSnapshotJson: true, status: true },
  });
  if (!issuance) return false;

  let snapshotEmail: string | null;
  try {
    snapshotEmail = parseRecipientEmail(issuance.recipientSnapshotJson);
  } catch {
    return false;
  }
  if (!snapshotEmail) return false;
  if (snapshotEmail !== delivery.recipientEmail.trim().toLowerCase()) return false;
  if (delivery.type === "BADGE_REVOKED" && issuance.status !== "REVOKED") return false;
  return true;
}

export async function isDeliveryRecipientAllowed(
  db: DatabaseClient,
  delivery: DeliveryRecipient,
  policy: EmailRecipientPolicy,
  allowlist: readonly string[],
): Promise<boolean> {
  if (!isRecipientAllowedByPolicy(policy, delivery.recipientEmail, allowlist)) return false;
  if (policy === "local") return true;
  return isSystemIssuedDeliveryRecipient(db, delivery);
}
