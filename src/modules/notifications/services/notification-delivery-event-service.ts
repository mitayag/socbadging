import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  BrevoWebhookEventSchema,
  deterministicEventId,
  type BrevoWebhookEvent,
} from "./brevo-webhook-adapter";
import { applyRecipientSuppression } from "./recipient-suppression-core";

type ProviderStatus = "DELIVERED" | "DEFERRED" | "BOUNCED" | "BLOCKED" | "INVALID" | "COMPLAINT";

type EventMapping = {
  eventType: "DELIVERED" | "DEFERRED" | "BOUNCED" | "BLOCKED" | "INVALID" | "COMPLAINT";
  providerStatus: ProviderStatus;
  rank: number;
};

const eventMap: Record<BrevoWebhookEvent["event"], EventMapping> = {
  delivered: { eventType: "DELIVERED", providerStatus: "DELIVERED", rank: 30 },
  deferred: { eventType: "DEFERRED", providerStatus: "DEFERRED", rank: 20 },
  soft_bounce: { eventType: "DEFERRED", providerStatus: "DEFERRED", rank: 20 },
  hard_bounce: { eventType: "BOUNCED", providerStatus: "BOUNCED", rank: 40 },
  blocked: { eventType: "BLOCKED", providerStatus: "BLOCKED", rank: 40 },
  invalid_email: { eventType: "INVALID", providerStatus: "INVALID", rank: 40 },
  complaint: { eventType: "COMPLAINT", providerStatus: "COMPLAINT", rank: 40 },
};

const rankByStatus: Record<ProviderStatus, number> = {
  DEFERRED: 20,
  DELIVERED: 30,
  BOUNCED: 40,
  BLOCKED: 40,
  INVALID: 40,
  COMPLAINT: 40,
};

export type BrevoEventResult =
  | { status: "APPLIED"; notificationDeliveryId: string }
  | { status: "STALE"; notificationDeliveryId: string }
  | { status: "DUPLICATE" }
  | { status: "UNMATCHED" };

function messageIdVariants(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const bare = trimmed.replace(/^<+/, "").replace(/>+$/, "");
  return [...new Set([trimmed, bare, `<${bare}>`])];
}

function eventTime(event: BrevoWebhookEvent, receivedAt: Date): Date {
  return event.date ? new Date(event.date) : receivedAt;
}

const suppressionEventTypes = new Set<EventMapping["eventType"]>([
  "BOUNCED",
  "BLOCKED",
  "INVALID",
  "COMPLAINT",
]);

async function applySuppressionForEvent(
  tx: Prisma.TransactionClient,
  event: BrevoWebhookEvent,
  mapping: EventMapping,
  providerEventId: string,
  occurredAt: Date,
  payloadHash: string,
  sourceDeliveryId?: string,
) {
  if (!suppressionEventTypes.has(mapping.eventType)) return;
  await applyRecipientSuppression(tx, {
    provider: "brevo",
    eventType: mapping.eventType as "BOUNCED" | "BLOCKED" | "INVALID" | "COMPLAINT",
    recipientEmail: event.email,
    providerEventId,
    occurredAt,
    ...(sourceDeliveryId ? { sourceDeliveryId } : {}),
    ...(event["message-id"] ? { providerMessageId: event["message-id"] } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    payloadHash,
  });
}

function shouldApply(
  currentStatus: ProviderStatus | null,
  currentAt: Date | null,
  incoming: EventMapping,
  occurredAt: Date,
): boolean {
  if (!currentStatus) return true;
  const currentRank = rankByStatus[currentStatus];
  if (incoming.rank < currentRank) return false;
  if (incoming.rank > currentRank) return true;
  return !currentAt || occurredAt >= currentAt;
}

async function findDelivery(
  tx: Prisma.TransactionClient,
  event: BrevoWebhookEvent,
  occurredAt: Date,
) {
  const variants = messageIdVariants(event["message-id"]);
  if (variants.length) {
    const exact = await tx.notificationDelivery.findFirst({
      where: { providerMessageId: { in: variants } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      select: { id: true, providerStatus: true, providerStatusAt: true },
    });
    if (exact) return exact;
  }
  const candidates = await tx.notificationDelivery.findMany({
    where: {
      recipientEmail: event.email,
      status: "SENT",
      sentAt: {
        gte: new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(occurredAt.getTime() + 60 * 60 * 1000),
      },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take: 2,
    select: { id: true, providerStatus: true, providerStatusAt: true },
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function processBrevoDeliveryEvent(
  prisma: PrismaClient,
  rawEvent: unknown,
  receivedAt = new Date(),
): Promise<BrevoEventResult> {
  const event = BrevoWebhookEventSchema.parse(rawEvent);
  const mapping = eventMap[event.event];
  const occurredAt = eventTime(event, receivedAt);
  const providerEventId = deterministicEventId(event);
  const payloadHash = createHash("sha256").update(JSON.stringify(event)).digest("hex");

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingEvent = await tx.notificationDeliveryEvent.findUnique({
          where: { providerEventId },
          select: { notificationDeliveryId: true },
        });
        if (existingEvent) {
          // Repeated provider events are idempotent, but they must not bypass suppression.
          // Re-applying the suppression is a no-op when the recorded state is already current.
          await applySuppressionForEvent(
            tx,
            event,
            mapping,
            providerEventId,
            occurredAt,
            payloadHash,
            existingEvent.notificationDeliveryId ?? undefined,
          );
          return { status: "DUPLICATE" as const };
        }

        const matched = await findDelivery(tx, event, occurredAt);
        if (!matched) {
          await tx.notificationDeliveryEvent.create({
            data: {
              providerEventId,
              source: "WEBHOOK",
              eventType: mapping.eventType,
              providerStatus: mapping.providerStatus,
              providerMessageId: event["message-id"] ?? null,
              recipientEmail: event.email,
              occurredAt,
              receivedAt,
              payloadHash,
              applied: false,
              metadataJson: {
                reason: event.reason?.slice(0, 200) ?? null,
                date: event.date ?? null,
              },
            },
          });
          await applySuppressionForEvent(
            tx,
            event,
            mapping,
            providerEventId,
            occurredAt,
            payloadHash,
          );
          return { status: "UNMATCHED" as const };
        }

        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            providerStatus: ProviderStatus | null;
            providerStatusAt: Date | null;
          }>
        >(Prisma.sql`
        SELECT id, provider_status AS providerStatus, provider_status_at AS providerStatusAt
        FROM notification_deliveries
        WHERE id = ${matched.id}
        FOR UPDATE
      `);
        const current = rows[0];
        const shouldUpdate = current
          ? shouldApply(current.providerStatus, current.providerStatusAt, mapping, occurredAt)
          : false;

        await tx.notificationDeliveryEvent.create({
          data: {
            notificationDeliveryId: matched.id,
            providerEventId,
            source: "WEBHOOK",
            eventType: mapping.eventType,
            providerStatus: mapping.providerStatus,
            providerMessageId: event["message-id"] ?? null,
            recipientEmail: event.email,
            occurredAt,
            receivedAt,
            payloadHash,
            applied: shouldUpdate,
            metadataJson: {
              reason: event.reason?.slice(0, 200) ?? null,
              date: event.date ?? null,
            },
          },
        });

        if (shouldUpdate) {
          await tx.notificationDelivery.update({
            where: { id: matched.id },
            data: {
              providerStatus: mapping.providerStatus,
              providerStatusAt: occurredAt,
            },
          });
        }

        await applySuppressionForEvent(
          tx,
          event,
          mapping,
          providerEventId,
          occurredAt,
          payloadHash,
          matched.id,
        );

        return shouldUpdate
          ? { status: "APPLIED" as const, notificationDeliveryId: matched.id }
          : { status: "STALE" as const, notificationDeliveryId: matched.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (isUniqueConstraint(error)) {
      await ensureSuppressionForDuplicateEvent(
        prisma,
        event,
        mapping,
        providerEventId,
        occurredAt,
        payloadHash,
      );
      return { status: "DUPLICATE" };
    }
    throw error;
  }
}

async function ensureSuppressionForDuplicateEvent(
  prisma: PrismaClient,
  event: BrevoWebhookEvent,
  mapping: EventMapping,
  providerEventId: string,
  occurredAt: Date,
  payloadHash: string,
) {
  if (!suppressionEventTypes.has(mapping.eventType)) return;
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.notificationDeliveryEvent.findUnique({
        where: { providerEventId },
        select: { notificationDeliveryId: true },
      });
      await applySuppressionForEvent(
        tx,
        event,
        mapping,
        providerEventId,
        occurredAt,
        payloadHash,
        existing?.notificationDeliveryId ?? undefined,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function processBrevoDeliveryEvents(
  prisma: PrismaClient,
  rawEvents: unknown[],
  receivedAt = new Date(),
): Promise<BrevoEventResult[]> {
  const results: BrevoEventResult[] = [];
  for (const rawEvent of rawEvents) {
    results.push(await processBrevoDeliveryEvent(prisma, rawEvent, receivedAt));
  }
  return results;
}
