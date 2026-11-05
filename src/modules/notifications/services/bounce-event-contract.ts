import { z } from "zod";

export const BounceComplaintEventSchema = z
  .object({
    id: z.string().trim().min(1).max(191),
    type: z.enum(["BOUNCE", "COMPLAINT"]),
    recipientEmail: z.email().transform((value) => value.trim().toLowerCase()),
    providerMessageId: z.string().trim().min(1).max(191).optional(),
    occurredAt: z.iso.datetime(),
    severity: z.enum(["TRANSIENT", "PERMANENT"]).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type BounceComplaintEvent = z.output<typeof BounceComplaintEventSchema>;

export type BounceWebhookVerifier = (input: {
  headers: Headers;
  rawBody: string;
}) => Promise<boolean>;

export type EventIdempotencyStore = {
  claim(eventId: string): Promise<"NEW" | "DUPLICATE">;
};

export type SuppressionStore = {
  suppress(event: BounceComplaintEvent): Promise<void>;
};

export type BounceEventResult = "DUPLICATE" | "SUPPRESSED";

/**
 * Provider-neutral processing contract. A future provider adapter must verify the signed webhook
 * before calling this function, claim the event id before side effects, and implement suppression
 * in durable storage. No provider is configured in local development.
 */
export async function processBounceComplaintEvent(
  rawEvent: unknown,
  dependencies: {
    idempotency: EventIdempotencyStore;
    suppression: SuppressionStore;
  },
): Promise<BounceEventResult> {
  const event = BounceComplaintEventSchema.parse(rawEvent);
  const claim = await dependencies.idempotency.claim(event.id);
  if (claim === "DUPLICATE") return "DUPLICATE";
  await dependencies.suppression.suppress(event);
  return "SUPPRESSED";
}
