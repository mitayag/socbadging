import { describe, expect, it, vi } from "vitest";

import { BounceComplaintEventSchema, processBounceComplaintEvent } from "./bounce-event-contract";

const event = {
  id: "event-1",
  type: "BOUNCE" as const,
  recipientEmail: "Student@Example.test",
  providerMessageId: "provider-1",
  occurredAt: "2026-11-01T00:00:00.000Z",
  severity: "PERMANENT" as const,
  reason: "Mailbox unavailable",
};

describe("provider-neutral bounce/complaint contract", () => {
  it("normalizes recipient email and rejects unknown fields", () => {
    expect(BounceComplaintEventSchema.parse(event).recipientEmail).toBe("student@example.test");
    expect(() => BounceComplaintEventSchema.parse({ ...event, unexpected: true })).toThrow();
  });

  it("suppresses a new event exactly once", async () => {
    const claim = vi.fn().mockResolvedValue("NEW");
    const suppress = vi.fn().mockResolvedValue(undefined);
    await expect(
      processBounceComplaintEvent(event, {
        idempotency: { claim },
        suppression: { suppress },
      }),
    ).resolves.toBe("SUPPRESSED");
    expect(claim).toHaveBeenCalledWith("event-1");
    expect(suppress).toHaveBeenCalledWith(expect.objectContaining({ id: "event-1" }));
  });

  it("does not suppress a replayed event", async () => {
    const suppress = vi.fn();
    await expect(
      processBounceComplaintEvent(event, {
        idempotency: { claim: vi.fn().mockResolvedValue("DUPLICATE") },
        suppression: { suppress },
      }),
    ).resolves.toBe("DUPLICATE");
    expect(suppress).not.toHaveBeenCalled();
  });

  it("rejects malformed provider payloads before side effects", async () => {
    const claim = vi.fn();
    await expect(
      processBounceComplaintEvent(
        { ...event, type: "DELIVERY" },
        { idempotency: { claim }, suppression: { suppress: vi.fn() } },
      ),
    ).rejects.toThrow();
    expect(claim).not.toHaveBeenCalled();
  });
});
