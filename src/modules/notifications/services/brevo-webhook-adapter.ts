import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  processBounceComplaintEvent,
  type BounceComplaintEvent,
  type EventIdempotencyStore,
  type SuppressionStore,
} from "./bounce-event-contract";

export const BrevoWebhookEventSchema = z
  .object({
    id: z.string().trim().min(1).max(191).optional(),
    event: z.enum([
      "delivered",
      "deferred",
      "hard_bounce",
      "soft_bounce",
      "complaint",
      "blocked",
      "invalid_email",
    ]),
    email: z.email().transform((value) => value.trim().toLowerCase()),
    "message-id": z.string().trim().max(191).optional(),
    date: z.iso.datetime().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type BrevoWebhookEvent = z.output<typeof BrevoWebhookEventSchema>;

export function verifyBrevoWebhookSignature(input: {
  rawBody: string;
  signature: string | undefined;
  secret: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest();
  const presented = Buffer.from(input.signature, "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export function deterministicEventId(event: BrevoWebhookEvent): string {
  if (event.id) return event.id;
  return createHash("sha256")
    .update(
      `${event.event}\u0000${event.email}\u0000${event["message-id"] ?? ""}\u0000${event.date ?? ""}`,
    )
    .digest("hex");
}

export function toBounceComplaintEvent(event: BrevoWebhookEvent): BounceComplaintEvent | null {
  if (event.event === "delivered" || event.event === "deferred") return null;
  return {
    id: deterministicEventId(event),
    type: event.event === "complaint" ? "COMPLAINT" : "BOUNCE",
    recipientEmail: event.email,
    ...(event["message-id"] ? { providerMessageId: event["message-id"] } : {}),
    occurredAt: event.date ?? new Date().toISOString(),
    ...(event.event === "soft_bounce"
      ? { severity: "TRANSIENT" as const }
      : { severity: "PERMANENT" as const }),
    ...(event.reason ? { reason: event.reason } : {}),
  };
}

export async function processBrevoWebhookEvent(
  rawEvent: unknown,
  dependencies: {
    idempotency: EventIdempotencyStore;
    suppression: SuppressionStore;
  },
): Promise<"IGNORED" | "DUPLICATE" | "SUPPRESSED"> {
  const event = BrevoWebhookEventSchema.parse(rawEvent);
  const mapped = toBounceComplaintEvent(event);
  if (!mapped) return "IGNORED";
  return processBounceComplaintEvent(mapped, dependencies);
}
