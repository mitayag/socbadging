import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  processBrevoWebhookEvent,
  toBounceComplaintEvent,
  verifyBrevoWebhookSignature,
} from "./brevo-webhook-adapter";

const body = JSON.stringify({
  id: "brevo-event-1",
  event: "hard_bounce",
  email: "Student@Example.test",
  "message-id": "provider-1",
  date: "2026-11-02T00:00:00.000Z",
  reason: "Mailbox unavailable",
});

describe("Brevo webhook adapter", () => {
  it("verifies a valid HMAC signature and rejects invalid signatures", () => {
    const secret = "webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyBrevoWebhookSignature({ rawBody: body, signature, secret })).toBe(true);
    expect(verifyBrevoWebhookSignature({ rawBody: body, signature: "00".repeat(32), secret })).toBe(
      false,
    );
    expect(verifyBrevoWebhookSignature({ rawBody: body, signature: undefined, secret })).toBe(
      false,
    );
  });

  it("maps hard bounce and complaint events to suppression events", () => {
    expect(
      toBounceComplaintEvent({
        id: "brevo-event-1",
        event: "hard_bounce",
        email: "student@example.test",
        "message-id": "provider-1",
        date: "2026-11-02T00:00:00.000Z",
        reason: "Mailbox unavailable",
      }),
    ).toMatchObject({
      id: "brevo-event-1",
      type: "BOUNCE",
      recipientEmail: "student@example.test",
      severity: "PERMANENT",
    });
    expect(
      toBounceComplaintEvent({
        event: "complaint",
        email: "student@example.test",
        date: "2026-11-02T00:00:00.000Z",
      }),
    ).toMatchObject({ type: "COMPLAINT", severity: "PERMANENT" });
    expect(
      toBounceComplaintEvent({
        event: "delivered",
        email: "student@example.test",
      }),
    ).toBeNull();
    expect(
      toBounceComplaintEvent({
        event: "deferred",
        email: "student@example.test",
      }),
    ).toBeNull();
  });

  it("suppresses a new event once and ignores replayed events", async () => {
    const claim = vi.fn().mockResolvedValueOnce("NEW").mockResolvedValueOnce("DUPLICATE");
    const suppress = vi.fn().mockResolvedValue(undefined);
    const dependencies = { idempotency: { claim }, suppression: { suppress } };

    await expect(processBrevoWebhookEvent(JSON.parse(body), dependencies)).resolves.toBe(
      "SUPPRESSED",
    );
    await expect(processBrevoWebhookEvent(JSON.parse(body), dependencies)).resolves.toBe(
      "DUPLICATE",
    );
    expect(suppress).toHaveBeenCalledTimes(1);
  });

  it("ignores delivered events without suppression", async () => {
    const claim = vi.fn();
    await expect(
      processBrevoWebhookEvent(
        {
          event: "delivered",
          email: "student@example.test",
        },
        { idempotency: { claim }, suppression: { suppress: vi.fn() } },
      ),
    ).resolves.toBe("IGNORED");
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads before side effects", async () => {
    const claim = vi.fn();
    await expect(
      processBrevoWebhookEvent(
        { event: "unknown", email: "student@example.test" },
        { idempotency: { claim }, suppression: { suppress: vi.fn() } },
      ),
    ).rejects.toThrow();
    expect(claim).not.toHaveBeenCalled();
  });
});
