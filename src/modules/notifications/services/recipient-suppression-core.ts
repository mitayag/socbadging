import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import type {
  NotificationEventType,
  PrismaClient,
  RecipientSuppressionReason,
} from "@prisma/client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type TerminalEventType = Extract<
  NotificationEventType,
  "BOUNCED" | "BLOCKED" | "INVALID" | "COMPLAINT"
>;

const terminalEventTypes = new Set<NotificationEventType>([
  "BOUNCED",
  "BLOCKED",
  "INVALID",
  "COMPLAINT",
]);

const reasonByEventType: Record<TerminalEventType, RecipientSuppressionReason> = {
  BOUNCED: "HARD_BOUNCE",
  BLOCKED: "BLOCKED_PERMANENT",
  INVALID: "INVALID_RECIPIENT",
  COMPLAINT: "COMPLAINT",
};

export type ProviderSuppressionEvent = {
  provider: string;
  eventType: TerminalEventType;
  recipientEmail: string;
  providerEventId: string;
  occurredAt: Date;
  sourceDeliveryId?: string;
  providerMessageId?: string;
  reason?: string;
  payloadHash?: string;
};

export type SuppressionResult = {
  action: "CREATED" | "UPDATED" | "RESUPPLIED" | "UNCHANGED";
  id: string;
  reason: RecipientSuppressionReason;
};

export type RecipientSuppressionSummary = {
  id: string;
  normalizedEmail: string;
  recipientEmail: string;
  reason: RecipientSuppressionReason;
  provider: string;
  providerEventId: string | null;
  sourceDeliveryId: string | null;
  suppressedAt: string;
  updatedAt: string;
  clearedAt: string | null;
};

export class RecipientSuppressedError extends Error {
  constructor(
    message = "Recipient is suppressed. An Administrator must clear the suppression before sending.",
    public readonly reason: RecipientSuppressionReason | null = null,
  ) {
    super(message);
    this.name = "RecipientSuppressedError";
  }
}

export class RecipientSuppressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipientSuppressionError";
  }
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

function truncate(value: string | undefined, maximum: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : undefined;
}

function evidenceFor(event: ProviderSuppressionEvent): Prisma.InputJsonValue {
  return {
    eventType: event.eventType,
    provider: event.provider,
    occurredAt: event.occurredAt.toISOString(),
    ...(event.providerMessageId
      ? { providerMessageId: truncate(event.providerMessageId, 191) }
      : {}),
    ...(event.reason ? { reason: truncate(event.reason, 200) } : {}),
    ...(event.payloadHash ? { payloadHash: event.payloadHash } : {}),
  };
}

function reasonFor(eventType: NotificationEventType): RecipientSuppressionReason | null {
  if (!terminalEventTypes.has(eventType)) return null;
  return reasonByEventType[eventType as TerminalEventType];
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  input: {
    suppressionId: string;
    action: string;
    normalizedEmail: string;
    reason: RecipientSuppressionReason;
    provider: string;
    providerEventId: string;
    sourceDeliveryId?: string;
    occurredAt: Date;
    previousReason?: RecipientSuppressionReason;
    actorUserId?: string;
  },
) {
  await tx.auditLog.create({
    data: {
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: input.action,
      entityType: "RecipientSuppression",
      entityId: input.suppressionId,
      contextJson: {
        normalizedEmail: input.normalizedEmail,
        reason: input.reason,
        previousReason: input.previousReason ?? null,
        provider: input.provider,
        providerEventId: input.providerEventId,
        sourceDeliveryId: input.sourceDeliveryId ?? null,
        occurredAt: input.occurredAt.toISOString(),
      },
    },
  });
}

export async function isRecipientSuppressed(db: DatabaseClient, email: string): Promise<boolean> {
  const normalizedEmail = normalizeRecipientEmail(email);
  if (!normalizedEmail) return false;
  const suppression = await db.recipientSuppression.findUnique({
    where: { normalizedEmail },
    select: { status: true },
  });
  return suppression?.status === "ACTIVE";
}

export async function getActiveSuppression(db: DatabaseClient, email: string) {
  const normalizedEmail = normalizeRecipientEmail(email);
  if (!normalizedEmail) return null;
  return db.recipientSuppression.findUnique({
    where: { normalizedEmail },
    select: { id: true, status: true, reason: true },
  });
}

export async function assertRecipientNotSuppressed(
  db: DatabaseClient,
  email: string,
): Promise<void> {
  const suppression = await getActiveSuppression(db, email);
  if (suppression?.status === "ACTIVE") {
    throw new RecipientSuppressedError(undefined, suppression.reason);
  }
}

async function stopQueuedDeliveries(tx: Prisma.TransactionClient, normalizedEmail: string) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE notification_deliveries
    SET
      status = 'FAILED',
      last_error_category = 'SUPPRESSED',
      safe_diagnostic_code = 'RECIPIENT_SUPPRESSED',
      claim_token = NULL,
      claim_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP(3)
    WHERE LOWER(recipient_email) = ${normalizedEmail}
      AND status IN ('PENDING', 'RETRY_SCHEDULED')
  `);
}

type LockedSuppression = {
  id: string;
  reason: RecipientSuppressionReason;
  status: "ACTIVE" | "CLEARED";
};

export async function lockSuppression(
  tx: Prisma.TransactionClient,
  normalizedEmail: string,
): Promise<LockedSuppression | null> {
  const [row] = await tx.$queryRaw<LockedSuppression[]>(Prisma.sql`
    SELECT id, reason, status
    FROM recipient_suppressions
    WHERE normalized_email = ${normalizedEmail}
    FOR UPDATE
  `);
  return row ?? null;
}

export async function applyRecipientSuppression(
  tx: Prisma.TransactionClient,
  event: ProviderSuppressionEvent,
): Promise<SuppressionResult | null> {
  const reason = reasonFor(event.eventType);
  if (!reason) return null;

  const recipientEmail = event.recipientEmail.trim();
  const normalizedEmail = normalizeRecipientEmail(recipientEmail);
  if (!normalizedEmail) return null;
  const evidenceJson = evidenceFor(event);

  const candidateId = randomUUID();
  await tx.$executeRaw(Prisma.sql`
    INSERT IGNORE INTO recipient_suppressions (
      id,
      normalized_email,
      recipient_email,
      reason,
      provider,
      provider_event_id,
      source_delivery_id,
      suppressed_at,
      evidence_json,
      status,
      created_at,
      updated_at
    ) VALUES (
      ${candidateId},
      ${normalizedEmail},
      ${recipientEmail.slice(0, 191)},
      ${reason},
      ${event.provider},
      ${event.providerEventId},
      ${event.sourceDeliveryId ?? null},
      ${event.occurredAt},
      ${JSON.stringify(evidenceJson)},
      'ACTIVE',
      CURRENT_TIMESTAMP(3),
      CURRENT_TIMESTAMP(3)
    )
  `);

  const existing = await lockSuppression(tx, normalizedEmail);
  if (!existing) throw new RecipientSuppressionError("Recipient suppression could not be locked");

  if (existing.id === candidateId) {
    await stopQueuedDeliveries(tx, normalizedEmail);
    await appendAudit(tx, {
      suppressionId: existing.id,
      action: "notification.recipient_suppressed",
      normalizedEmail,
      reason: existing.reason,
      provider: event.provider,
      providerEventId: event.providerEventId,
      ...(event.sourceDeliveryId ? { sourceDeliveryId: event.sourceDeliveryId } : {}),
      occurredAt: event.occurredAt,
    });
    return { action: "CREATED", id: existing.id, reason: existing.reason };
  }

  if (existing.status === "ACTIVE") {
    await stopQueuedDeliveries(tx, normalizedEmail);
    if (existing.reason === "COMPLAINT" && reason !== "COMPLAINT") {
      return { action: "UNCHANGED", id: existing.id, reason: existing.reason };
    }
    if (existing.reason === reason) {
      return { action: "UNCHANGED", id: existing.id, reason: existing.reason };
    }
    const updated = await tx.recipientSuppression.update({
      where: { id: existing.id },
      data: {
        reason,
        provider: event.provider,
        providerEventId: event.providerEventId,
        sourceDeliveryId: event.sourceDeliveryId ?? null,
        evidenceJson,
      },
      select: { id: true, reason: true },
    });
    await appendAudit(tx, {
      suppressionId: updated.id,
      action: "notification.recipient_suppression_updated",
      normalizedEmail,
      reason: updated.reason,
      previousReason: existing.reason,
      provider: event.provider,
      providerEventId: event.providerEventId,
      ...(event.sourceDeliveryId ? { sourceDeliveryId: event.sourceDeliveryId } : {}),
      occurredAt: event.occurredAt,
    });
    return { action: "UPDATED", id: updated.id, reason: updated.reason };
  }

  const reactivated = await tx.recipientSuppression.update({
    where: { id: existing.id },
    data: {
      recipientEmail: recipientEmail.slice(0, 191),
      reason,
      provider: event.provider,
      providerEventId: event.providerEventId,
      sourceDeliveryId: event.sourceDeliveryId ?? null,
      suppressedAt: event.occurredAt,
      evidenceJson,
      status: "ACTIVE",
      clearedAt: null,
      clearedByUserId: null,
      clearReason: null,
    },
    select: { id: true, reason: true },
  });
  await stopQueuedDeliveries(tx, normalizedEmail);
  await appendAudit(tx, {
    suppressionId: reactivated.id,
    action: "notification.recipient_suppressed",
    normalizedEmail,
    reason: reactivated.reason,
    provider: event.provider,
    providerEventId: event.providerEventId,
    ...(event.sourceDeliveryId ? { sourceDeliveryId: event.sourceDeliveryId } : {}),
    occurredAt: event.occurredAt,
  });
  return { action: "RESUPPLIED", id: reactivated.id, reason: reactivated.reason };
}
