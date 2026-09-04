import type { NotificationDelivery, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { deliverClaimed, runDeliveryCycle } from "./delivery-worker";

const delivery: NotificationDelivery = {
  id: "delivery-1",
  issuanceId: "issuance-1",
  type: "BADGE_ISSUED",
  status: "PROCESSING",
  recipientEmail: "student@example.edu",
  recipientFirstName: "Ada",
  badgeName: "Secure Systems",
  issuerName: "HAU SOC",
  verificationUrl: "https://badges.example.edu/credentials/public-token",
  supportContact: null,
  occurredAt: new Date("2026-08-23T00:00:00Z"),
  attemptCount: 0,
  nextAttemptAt: new Date("2026-08-23T00:00:00Z"),
  claimToken: "claim-1",
  claimExpiresAt: new Date("2026-08-23T00:02:00Z"),
  lastErrorCategory: null,
  safeDiagnosticCode: null,
  providerMessageId: null,
  sentAt: null,
  createdAt: new Date("2026-08-23T00:00:00Z"),
  updatedAt: new Date("2026-08-23T00:00:00Z"),
};
const config = {
  batchSize: 20,
  claimLeaseSeconds: 120,
  maxAttempts: 5,
  retryBaseDelaySeconds: 60,
};

describe("delivery worker", () => {
  it("reports degraded mail state when a claimed SMTP delivery fails", async () => {
    const notificationDelivery = {
      findMany: vi.fn().mockResolvedValue([delivery]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(delivery),
    };
    const smtp = {
      send: vi.fn().mockRejectedValue(Object.assign(new Error("down"), { code: "ECONNREFUSED" })),
    };

    const result = await runDeliveryCycle(
      { notificationDelivery } as unknown as PrismaClient,
      smtp,
      config,
    );

    expect(result).toEqual({ processed: 1, mailStatus: "degraded" });
  });

  it("records success only for the owned claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-1" }) };
    await deliverClaimed(
      { notificationDelivery: { updateMany } } as unknown as PrismaClient,
      smtp,
      delivery,
      config,
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery-1", status: "PROCESSING", claimToken: "claim-1" },
        data: expect.objectContaining({ status: "SENT", providerMessageId: "provider-1" }),
      }),
    );
  });

  it("schedules a safe transient retry without persisting the raw error", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = {
      send: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("private server response"), { code: "ETIMEDOUT" }),
        ),
    };
    await deliverClaimed(
      { notificationDelivery: { updateMany } } as unknown as PrismaClient,
      smtp,
      delivery,
      config,
      new Date("2026-08-23T00:01:00Z"),
    );
    const data = updateMany.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      status: "RETRY_SCHEDULED",
      attemptCount: 1,
      lastErrorCategory: "TRANSIENT",
      safeDiagnosticCode: "ETIMEDOUT",
    });
    expect(JSON.stringify(data)).not.toContain("private server response");
  });
});
