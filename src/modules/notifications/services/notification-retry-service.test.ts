import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  deliveryUpdate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { retryNotification } from "./notification-retry-service";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@example.edu", role: "ADMIN" };

describe("notification retry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const tx = {
      $queryRaw: mocks.queryRaw,
      auditLog: { create: mocks.auditCreate },
      notificationDelivery: { update: mocks.deliveryUpdate },
    };
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null }])
      .mockResolvedValueOnce([{ id: "delivery-1", status: "FAILED" }]);
  });

  it("atomically resets an eligible job and appends a privacy-safe audit event", async () => {
    await expect(retryNotification(admin, "delivery-1")).resolves.toEqual({ alreadyQueued: false });
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "PENDING",
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "admin-1",
        action: "notification.retry_requested",
        entityType: "NotificationDelivery",
        entityId: "delivery-1",
        contextJson: { notificationDeliveryId: "delivery-1" },
      },
    });
  });

  it("does not duplicate retry or audit when the job is already queued", async () => {
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null }])
      .mockResolvedValueOnce([{ id: "delivery-1", status: "PENDING" }]);
    await expect(retryNotification(admin, "delivery-1")).resolves.toEqual({ alreadyQueued: true });
    expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("denies Faculty before opening a transaction", async () => {
    await expect(
      retryNotification({ ...admin, role: "FACULTY" }, "delivery-1"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
