import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  deliveryUpdate: vi.fn(),
  controlledAttemptFindUnique: vi.fn(),
  suppressionFindUnique: vi.fn(),
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
      recipientSuppression: { findUnique: mocks.suppressionFindUnique },
      smtpSubmissionAttempt: { findUnique: mocks.controlledAttemptFindUnique },
    };
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null }])
      .mockResolvedValueOnce([
        { id: "delivery-1", status: "FAILED", recipientEmail: "student@example.edu" },
      ]);
    mocks.controlledAttemptFindUnique.mockResolvedValue(null);
    mocks.suppressionFindUnique.mockResolvedValue(null);
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
      .mockResolvedValueOnce([
        { id: "delivery-1", status: "PENDING", recipientEmail: "student@example.edu" },
      ]);
    await expect(retryNotification(admin, "delivery-1")).resolves.toEqual({ alreadyQueued: true });
    expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("refuses to bypass an active recipient suppression", async () => {
    mocks.suppressionFindUnique.mockResolvedValue({ status: "ACTIVE", reason: "COMPLAINT" });
    await expect(retryNotification(admin, "delivery-1")).rejects.toThrow("Recipient is suppressed");
    expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("enforces the staging allowlist before resetting a retry", async () => {
    const previous = { ...process.env };
    process.env.EMAIL_DELIVERY_MODE = "brevo";
    process.env.EMAIL_RECIPIENT_POLICY = "staging";
    process.env.EXTERNAL_EMAIL_ENABLED = "true";
    process.env.EXTERNAL_EMAIL_ALLOWLIST = "allowed@example.test";
    process.env.BREVO_SMTP_USER = "brevo-user";
    process.env.BREVO_SMTP_PASSWORD = "brevo-password";
    try {
      mocks.queryRaw
        .mockReset()
        .mockResolvedValueOnce([
          { id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null },
        ])
        .mockResolvedValueOnce([
          {
            id: "delivery-1",
            status: "FAILED",
            recipientEmail: "student@example.edu",
            issuanceId: "issuance-1",
            type: "BADGE_ISSUED",
          },
        ]);
      await expect(retryNotification(admin, "delivery-1")).rejects.toThrow(
        "not authorized for email delivery",
      );
      expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
    } finally {
      process.env = previous;
    }
  });

  it("refuses to reset a controlled acceptance notification", async () => {
    mocks.controlledAttemptFindUnique.mockResolvedValue({ id: "attempt-1" });
    await expect(retryNotification(admin, "delivery-1")).rejects.toThrow(
      "Controlled acceptance notification cannot be retried",
    );
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
