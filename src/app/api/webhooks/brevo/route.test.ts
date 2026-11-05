import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  processEvents: vi.fn(),
}));

vi.mock("@/config/env", () => ({ loadBrevoWebhookConfig: mocks.loadConfig }));
vi.mock("@/modules/notifications/services/notification-delivery-event-service", () => ({
  processBrevoDeliveryEvents: mocks.processEvents,
}));
vi.mock("@/platform/db/prisma", () => ({ prisma: {} }));

import { POST } from "./route";

const secret = "test-webhook-secret";
const payload = {
  id: "brevo-route-event-1",
  event: "delivered",
  email: "recipient@example.test",
  "message-id": "<message-1@example.test>",
  date: "2026-11-02T08:00:00.000Z",
};
const body = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(body).digest("hex");

function request(raw: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/brevo", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
}

describe("Brevo webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue({ enabled: true, secret });
    mocks.processEvents.mockResolvedValue([
      { status: "APPLIED", notificationDeliveryId: "delivery-1" },
    ]);
  });

  it("returns 404 when the webhook is disabled", async () => {
    mocks.loadConfig.mockReturnValue({ enabled: false, secret: undefined });
    const response = await POST(request(body, { "x-brevo-signature": signature }));
    expect(response.status).toBe(404);
  });

  it("rejects an invalid signature before processing", async () => {
    const response = await POST(request(body, { "x-brevo-signature": "00".repeat(32) }));
    expect(response.status).toBe(401);
    expect(mocks.processEvents).not.toHaveBeenCalled();
  });

  it("rejects oversized payloads", async () => {
    const response = await POST(
      request(body, { "x-brevo-signature": signature, "content-length": String(70 * 1024) }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects invalid event payloads after signature verification", async () => {
    const invalid = JSON.stringify({ event: "unknown", email: "recipient@example.test" });
    const invalidSignature = createHmac("sha256", secret).update(invalid).digest("hex");
    const response = await POST(request(invalid, { "x-brevo-signature": invalidSignature }));
    expect(response.status).toBe(400);
    expect(mocks.processEvents).not.toHaveBeenCalled();
  });

  it("processes a signed event and returns sanitized counts", async () => {
    const response = await POST(request(body, { "x-brevo-signature": signature }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: 1,
      applied: 1,
      stale: 0,
      duplicate: 0,
      unmatched: 0,
    });
    expect(mocks.processEvents).toHaveBeenCalledTimes(1);
  });

  it("supports the x-sib-signature alias", async () => {
    const response = await POST(request(body, { "x-sib-signature": signature }));
    expect(response.status).toBe(200);
  });
});
