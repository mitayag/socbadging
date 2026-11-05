import type { NotificationDelivery, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { claimDueDeliveries, deliverClaimed, runDeliveryCycle } from "./delivery-worker";

const delivery: NotificationDelivery = {
  id: "delivery-1",
  issuanceId: "issuance-1",
  type: "BADGE_ISSUED",
  status: "PROCESSING",
  deliveryChannel: "mailpit",
  recipientEmail: "student@example.edu",
  recipientFirstName: "Ada",
  badgeName: "Secure Systems",
  badgeImageUrl: null,
  issuerName: "HAU SOC",
  verificationUrl: "https://badges.example.edu/credentials/public-token",
  expiresAt: null,
  supportContact: null,
  occurredAt: new Date("2026-08-23T00:00:00Z"),
  attemptCount: 0,
  resendCount: 0,
  lastResendAt: null,
  nextAttemptAt: new Date("2026-08-23T00:00:00Z"),
  claimToken: "claim-1",
  claimExpiresAt: new Date("2026-08-23T00:02:00Z"),
  lastErrorCategory: null,
  safeDiagnosticCode: null,
  providerMessageId: null,
  smtpAcceptedAt: null,
  providerStatus: null,
  providerStatusAt: null,
  sentAt: null,
  createdAt: new Date("2026-08-23T00:00:00Z"),
  updatedAt: new Date("2026-08-23T00:00:00Z"),
};
const attemptHistory = () => ({
  create: vi.fn().mockResolvedValue({ id: "attempt-history-1" }),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
});
const config = {
  batchSize: 20,
  claimLeaseSeconds: 120,
  maxAttempts: 5,
  retryBaseDelaySeconds: 60,
  deliveryChannel: "mailpit" as const,
  recipientPolicy: "local" as const,
  externalEnabled: false,
  controlledAcceptanceOnly: false,
  allowlist: [],
};

const noSuppression = () => ({
  recipientSuppression: { findUnique: vi.fn().mockResolvedValue(null) },
});

describe("delivery worker", () => {
  it("claims only the configured delivery channel", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await claimDueDeliveries(
      { notificationDelivery: { findMany } } as unknown as PrismaClient,
      config,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deliveryChannel: "mailpit" }) }),
    );
  });

  it("refuses a non-allowlisted Brevo recipient without calling SMTP", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn() };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany },
        ...noSuppression(),
        badgeIssuance: {
          findUnique: vi.fn().mockResolvedValue({
            recipientSnapshotJson: {
              studentId: "student-1",
              studentNumber: "S-1",
              displayName: "Blocked Recipient",
              firstName: "Blocked",
              lastName: "Recipient",
              email: "blocked@example.test",
            },
            status: "ACTIVE",
          }),
        },
      } as unknown as PrismaClient,
      smtp,
      { ...delivery, deliveryChannel: "brevo", recipientEmail: "blocked@example.test" },
      {
        ...config,
        deliveryChannel: "brevo",
        recipientPolicy: "staging",
        externalEnabled: true,
        allowlist: ["allowed@example.test"],
      },
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(smtp.send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastErrorCategory: "PERMANENT",
          safeDiagnosticCode: "RECIPIENT_NOT_AUTHORIZED",
        }),
      }),
    );
  });

  it("refuses a substituted recipient even when the production policy permits the address", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn() };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany },
        ...noSuppression(),
        badgeIssuance: {
          findUnique: vi.fn().mockResolvedValue({
            recipientSnapshotJson: {
              studentId: "student-1",
              studentNumber: "S-1",
              displayName: "Original Recipient",
              firstName: "Original",
              lastName: "Recipient",
              email: "original@example.test",
            },
            status: "ACTIVE",
          }),
        },
      } as unknown as PrismaClient,
      smtp,
      { ...delivery, deliveryChannel: "brevo", recipientEmail: "substituted@example.test" },
      {
        ...config,
        deliveryChannel: "brevo",
        recipientPolicy: "production",
        externalEnabled: true,
        allowlist: [],
      },
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(smtp.send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ safeDiagnosticCode: "RECIPIENT_NOT_AUTHORIZED" }),
      }),
    );
  });

  it("allows a matching production recipient with no allowlist", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-1" }) };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany },
        notificationDeliveryAttempt: attemptHistory(),
        smtpSubmissionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
        ...noSuppression(),
        badgeIssuance: {
          findUnique: vi.fn().mockResolvedValue({
            recipientSnapshotJson: {
              studentId: "student-1",
              studentNumber: "S-1",
              displayName: "Ada Student",
              firstName: "Ada",
              lastName: "Student",
              email: delivery.recipientEmail,
            },
            status: "ACTIVE",
          }),
        },
      } as unknown as PrismaClient,
      smtp,
      { ...delivery, deliveryChannel: "brevo" },
      {
        ...config,
        deliveryChannel: "brevo",
        recipientPolicy: "production",
        externalEnabled: true,
        allowlist: [],
      },
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(smtp.send).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
    );
  });

  it("stops a claimed send when the recipient is durably suppressed", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn() };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany },
        recipientSuppression: {
          findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", reason: "HARD_BOUNCE" }),
        },
      } as unknown as PrismaClient,
      smtp,
      delivery,
      config,
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(smtp.send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastErrorCategory: "SUPPRESSED",
          safeDiagnosticCode: "RECIPIENT_SUPPRESSED",
        }),
      }),
    );
  });

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
      {
        notificationDelivery,
        smtpSubmissionAttempt: { findMany: vi.fn().mockResolvedValue([]) },
        notificationDeliveryAttempt: attemptHistory(),
        ...noSuppression(),
      } as unknown as PrismaClient,
      smtp,
      config,
    );

    expect(result).toEqual({ processed: 1, mailStatus: "degraded" });
  });

  it("records success only for the owned claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-1" }) };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany },
        notificationDeliveryAttempt: attemptHistory(),
        ...noSuppression(),
      } as unknown as PrismaClient,
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

  it("persists attempt history and SMTP acceptance separately from provider delivery", async () => {
    const createAttempt = vi.fn().mockResolvedValue({ id: "history-1" });
    const updateAttempt = vi.fn().mockResolvedValue({ count: 1 });
    const updateDelivery = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-1" }) };
    await deliverClaimed(
      {
        notificationDelivery: { updateMany: updateDelivery },
        notificationDeliveryAttempt: { create: createAttempt, updateMany: updateAttempt },
        ...noSuppression(),
      } as unknown as PrismaClient,
      smtp,
      delivery,
      config,
      new Date("2026-08-23T00:01:00Z"),
    );
    expect(createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationDeliveryId: "delivery-1",
        attemptNumber: 1,
        deliveryChannel: "mailpit",
        outcome: "STARTED",
      }),
    });
    expect(updateAttempt).toHaveBeenCalledWith({
      where: { id: "history-1", outcome: "STARTED" },
      data: expect.objectContaining({ outcome: "ACCEPTED", providerMessageId: "provider-1" }),
    });
    expect(updateDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          smtpAcceptedAt: new Date("2026-08-23T00:01:00Z"),
        }),
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
      {
        notificationDelivery: { updateMany },
        notificationDeliveryAttempt: attemptHistory(),
        ...noSuppression(),
      } as unknown as PrismaClient,
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

describe("controlled acceptance delivery", () => {
  const controlledDelivery: NotificationDelivery = {
    ...delivery,
    deliveryChannel: "brevo",
    recipientEmail: "authorized-test-recipient@example.org",
  };
  const controlledConfig = {
    ...config,
    deliveryChannel: "brevo" as const,
    externalEnabled: true,
    controlledAcceptanceOnly: true,
    allowlist: ["authorized-test-recipient@example.org"],
  };
  const controlledAttempt = {
    id: "attempt-1",
    notificationDeliveryId: "delivery-1",
    deliveryChannel: "brevo",
    recipient: "authorized-test-recipient@example.org",
    acceptanceKey: "brevo-live-acceptance",
    attemptToken: null,
    submissionState: "NOT_STARTED",
    submissionStartedAt: null,
    smtpCompletedAt: null,
    providerMessageId: null,
    lastErrorCode: null,
    createdAt: new Date("2026-11-02T00:00:00Z"),
    updatedAt: new Date("2026-11-02T00:00:00Z"),
  };

  it("submits at most once and records ACCEPTED plus SENT", async () => {
    const reservationUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const txAttemptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const txDeliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-1" }) };
    const prisma = {
      notificationDelivery: { updateMany: vi.fn() },
      notificationDeliveryAttempt: attemptHistory(),
      ...noSuppression(),
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(controlledAttempt),
        updateMany: reservationUpdate,
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          smtpSubmissionAttempt: { updateMany: txAttemptUpdate },
          notificationDelivery: { updateMany: txDeliveryUpdate },
        }),
      ),
    } as unknown as PrismaClient;

    await expect(deliverClaimed(prisma, smtp, controlledDelivery, controlledConfig)).resolves.toBe(
      "ready",
    );
    expect(smtp.send).toHaveBeenCalledTimes(1);
    expect(txAttemptUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ submissionState: "SUBMISSION_RESERVED" }),
      data: expect.objectContaining({
        submissionState: "ACCEPTED",
        providerMessageId: "provider-1",
      }),
    });
    expect(txDeliveryUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "PROCESSING" }),
      data: expect.objectContaining({ status: "SENT", providerMessageId: "provider-1" }),
    });
  });

  it("does not submit when the durable attempt is already consumed", async () => {
    const smtp = { send: vi.fn() };
    const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      notificationDelivery: { updateMany: deliveryUpdate },
      ...noSuppression(),
      smtpSubmissionAttempt: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ ...controlledAttempt, submissionState: "SUBMISSION_RESERVED" }),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaClient;

    await expect(deliverClaimed(prisma, smtp, controlledDelivery, controlledConfig)).resolves.toBe(
      "degraded",
    );
    expect(smtp.send).not.toHaveBeenCalled();
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          safeDiagnosticCode: "CONTROLLED_SUBMISSION_CONSUMED",
        }),
      }),
    );
  });

  it("records OUTCOME_UNKNOWN on timeout without retrying", async () => {
    const reservationUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const txAttemptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const txDeliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const smtp = {
      send: vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
    };
    const prisma = {
      notificationDelivery: { updateMany: vi.fn() },
      notificationDeliveryAttempt: attemptHistory(),
      ...noSuppression(),
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(controlledAttempt),
        updateMany: reservationUpdate,
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          smtpSubmissionAttempt: { updateMany: txAttemptUpdate },
          notificationDelivery: { updateMany: txDeliveryUpdate },
        }),
      ),
    } as unknown as PrismaClient;

    await expect(deliverClaimed(prisma, smtp, controlledDelivery, controlledConfig)).resolves.toBe(
      "degraded",
    );
    expect(smtp.send).toHaveBeenCalledTimes(1);
    expect(txAttemptUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ submissionState: "SUBMISSION_RESERVED" }),
      data: expect.objectContaining({ submissionState: "OUTCOME_UNKNOWN" }),
    });
    expect(txDeliveryUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "PROCESSING" }),
      data: expect.objectContaining({ status: "FAILED", safeDiagnosticCode: "ETIMEDOUT" }),
    });
  });

  it("refuses an unarmed Brevo notification in controlled-only mode", async () => {
    const smtp = { send: vi.fn() };
    const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      notificationDelivery: { updateMany: deliveryUpdate },
      ...noSuppression(),
      smtpSubmissionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(deliverClaimed(prisma, smtp, controlledDelivery, controlledConfig)).resolves.toBe(
      "degraded",
    );
    expect(smtp.send).not.toHaveBeenCalled();
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          safeDiagnosticCode: "CONTROLLED_ACCEPTANCE_REQUIRED",
        }),
      }),
    );
  });
});
