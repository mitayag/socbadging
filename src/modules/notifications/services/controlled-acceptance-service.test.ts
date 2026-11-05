import type { PrismaClient, SmtpSubmissionAttempt } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  ControlledAcceptanceError,
  armControlledAcceptance,
  controlledAcceptanceKey,
  reconcileControlledSubmissions,
  reserveControlledSubmission,
} from "./controlled-acceptance-service";

const now = new Date("2026-11-02T06:00:00Z");
const delivery = {
  id: "delivery-1",
  deliveryChannel: "brevo",
  recipientEmail: "authorized-test-recipient@example.org",
};

function attempt(overrides: Partial<SmtpSubmissionAttempt> = {}): SmtpSubmissionAttempt {
  return {
    id: "attempt-1",
    notificationDeliveryId: "delivery-1",
    deliveryChannel: "brevo",
    recipient: "authorized-test-recipient@example.org",
    acceptanceKey: controlledAcceptanceKey,
    attemptToken: null,
    submissionState: "NOT_STARTED",
    submissionStartedAt: null,
    smtpCompletedAt: null,
    providerMessageId: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("controlled acceptance reservation", () => {
  it("reserves exactly one submission for a NOT_STARTED attempt", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt()),
        updateMany,
      },
    } as unknown as PrismaClient;

    const result = await reserveControlledSubmission(client, delivery, now);
    expect(result.status).toBe("RESERVED");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "attempt-1", submissionState: "NOT_STARTED" },
      data: expect.objectContaining({
        submissionState: "SUBMISSION_RESERVED",
        attemptToken: expect.any(String),
        submissionStartedAt: now,
      }),
    });
  });

  it("rejects a duplicate reservation after the attempt is consumed", async () => {
    const updateMany = vi.fn();
    const client = {
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt({ submissionState: "SUBMISSION_RESERVED" })),
        updateMany,
      },
    } as unknown as PrismaClient;

    const result = await reserveControlledSubmission(client, delivery, now);
    expect(result.status).toBe("CONSUMED");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a recipient mismatch before reservation", async () => {
    const updateMany = vi.fn();
    const client = {
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt({ recipient: "other@example.test" })),
        updateMany,
      },
    } as unknown as PrismaClient;

    const result = await reserveControlledSubmission(client, delivery, now);
    expect(result.status).toBe("RECIPIENT_MISMATCH");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a channel mismatch before reservation", async () => {
    const updateMany = vi.fn();
    const client = {
      smtpSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt({ deliveryChannel: "mailpit" })),
        updateMany,
      },
    } as unknown as PrismaClient;

    const result = await reserveControlledSubmission(client, delivery, now);
    expect(result.status).toBe("CHANNEL_MISMATCH");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns NOT_CONTROLLED when no attempt exists", async () => {
    const client = {
      smtpSubmissionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(reserveControlledSubmission(client, delivery, now)).resolves.toEqual({
      status: "NOT_CONTROLLED",
    });
  });
});

describe("controlled acceptance arming", () => {
  it("arms exactly one pending Brevo notification for the authorized recipient", async () => {
    const create = vi.fn().mockResolvedValue(attempt());
    const client = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          id: "delivery-1",
          deliveryChannel: "brevo",
          recipientEmail: "authorized-test-recipient@example.org",
          status: "PENDING",
        }),
      },
      smtpSubmissionAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as PrismaClient;

    await armControlledAcceptance(client, "delivery-1");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationDeliveryId: "delivery-1",
        deliveryChannel: "brevo",
        recipient: "authorized-test-recipient@example.org",
        acceptanceKey: controlledAcceptanceKey,
        submissionState: "NOT_STARTED",
      }),
    });
  });

  it("rejects a wrong recipient", async () => {
    const client = {
      notificationDelivery: { findUnique: vi.fn() },
      smtpSubmissionAttempt: { findFirst: vi.fn(), create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      armControlledAcceptance(client, "delivery-1", "other@example.test"),
    ).rejects.toBeInstanceOf(ControlledAcceptanceError);
  });

  it("rejects a second controlled acceptance attempt", async () => {
    const client = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          id: "delivery-1",
          deliveryChannel: "brevo",
          recipientEmail: "authorized-test-recipient@example.org",
          status: "PENDING",
        }),
      },
      smtpSubmissionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: "attempt-existing" }),
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    await expect(armControlledAcceptance(client, "delivery-1")).rejects.toThrow(
      "Controlled acceptance is already armed",
    );
  });
});

describe("controlled acceptance reconciliation", () => {
  it("terminalizes an expired reserved attempt without sending", async () => {
    const attemptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      smtpSubmissionAttempt: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...attempt({ submissionState: "SUBMISSION_RESERVED" }),
            notificationDelivery: {
              id: "delivery-1",
              status: "PROCESSING",
              claimExpiresAt: new Date("2026-11-02T05:00:00Z"),
            },
          },
        ]),
        updateMany: attemptUpdate,
      },
      notificationDelivery: { updateMany: deliveryUpdate },
    } as unknown as PrismaClient;

    await expect(reconcileControlledSubmissions(client, now)).resolves.toBe(1);
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: "attempt-1", submissionState: "SUBMISSION_RESERVED" },
      data: expect.objectContaining({
        submissionState: "OUTCOME_UNKNOWN",
        lastErrorCode: "SUBMISSION_OUTCOME_UNKNOWN",
      }),
    });
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "delivery-1", status: { in: expect.any(Array) } }),
      data: expect.objectContaining({ status: "FAILED", attemptCount: { increment: 1 } }),
    });
  });

  it("marks a delivery SENT when the attempt was accepted before a crash", async () => {
    const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      smtpSubmissionAttempt: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...attempt({
              submissionState: "ACCEPTED",
              smtpCompletedAt: now,
              providerMessageId: "provider-1",
            }),
            notificationDelivery: {
              id: "delivery-1",
              status: "PROCESSING",
              claimExpiresAt: new Date("2026-11-02T05:00:00Z"),
            },
          },
        ]),
        updateMany: vi.fn(),
      },
      notificationDelivery: { updateMany: deliveryUpdate },
    } as unknown as PrismaClient;

    await expect(reconcileControlledSubmissions(client, now)).resolves.toBe(1);
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "delivery-1" }),
      data: expect.objectContaining({
        status: "SENT",
        providerMessageId: "provider-1",
      }),
    });
  });

  it("does not reconcile a controlled attempt while its claim is still active", async () => {
    const deliveryUpdate = vi.fn();
    const client = {
      smtpSubmissionAttempt: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
      notificationDelivery: { updateMany: deliveryUpdate },
    } as unknown as PrismaClient;

    await expect(reconcileControlledSubmissions(client, now)).resolves.toBe(0);
    expect(deliveryUpdate).not.toHaveBeenCalled();
  });
});
