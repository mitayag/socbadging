import { describe, expect, it, vi } from "vitest";

import { enqueueIssuedNotification, enqueueRevokedNotification } from "./notification-outbox";

function transactionDouble() {
  return { notificationDelivery: { create: vi.fn(async ({ data }) => data) } };
}

describe("notification outbox", () => {
  it("stores an immutable issued-email snapshot", async () => {
    const tx = transactionDouble();
    await enqueueIssuedNotification(tx as never, {
      issuanceId: "issuance-1",
      recipientEmail: "student@example.edu",
      recipientFirstName: "Ada",
      badgeName: "Dean's List",
      issuerName: "HAU SOC",
      verificationUrl: "https://badges.example.edu/credentials/public-token",
      occurredAt: new Date("2026-08-23T00:00:00Z"),
    });
    expect(tx.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issuanceId: "issuance-1",
        type: "BADGE_ISSUED",
        status: "PENDING",
        recipientEmail: "student@example.edu",
        recipientFirstName: "Ada",
      }),
    });
  });

  it("stores a revoked snapshot without a private revocation reason", async () => {
    const tx = transactionDouble();
    await enqueueRevokedNotification(tx as never, {
      issuanceId: "issuance-1",
      recipientEmail: "student@example.edu",
      recipientFirstName: "Ada",
      badgeName: "Dean's List",
      issuerName: "HAU SOC",
      verificationUrl: "https://badges.example.edu/credentials/public-token",
      occurredAt: new Date("2026-08-23T00:00:00Z"),
      supportContact: "support@example.edu",
    });
    const data = tx.notificationDelivery.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ type: "BADGE_REVOKED", supportContact: "support@example.edu" });
    expect(data).not.toHaveProperty("revocationReason");
  });
});
