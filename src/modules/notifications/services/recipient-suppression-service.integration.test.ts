import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { processBrevoDeliveryEvent } from "./notification-delivery-event-service";
import { deliverClaimed } from "./delivery-worker";
import { RecipientSuppressionError, unsuppressRecipient } from "./recipient-suppression-service";

const prefix = "stage5c1-suppression-";
const admin: Actor = {
  id: `${prefix}admin`,
  name: "Suppression Admin",
  email: `${prefix}admin@example.test`,
  role: "ADMIN",
};
const faculty: Actor = {
  id: `${prefix}faculty`,
  name: "Suppression Faculty",
  email: `${prefix}faculty@example.test`,
  role: "FACULTY",
};
const classId = `${prefix}class`;
const badgeId = `${prefix}badge`;
const studentId = `${prefix}student`;
const issuanceId = `${prefix}issuance`;
const deliveryId = `${prefix}delivery`;
const recipient = `${prefix}recipient@example.test`;

async function cleanup() {
  const suppressions = await prisma.recipientSuppression.findMany({
    where: { normalizedEmail: recipient },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: suppressions.map((suppression) => suppression.id) } },
  });
  await prisma.recipientSuppression.deleteMany({ where: { normalizedEmail: recipient } });
  await prisma.notificationDeliveryEvent.deleteMany({
    where: { OR: [{ notificationDeliveryId: deliveryId }, { recipientEmail: recipient }] },
  });
  await prisma.notificationDeliveryAttempt.deleteMany({
    where: { notificationDeliveryId: deliveryId },
  });
  await prisma.notificationDelivery.deleteMany({ where: { issuanceId } });
  await prisma.badgeIssuance.deleteMany({ where: { id: issuanceId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: badgeId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, faculty.id] } } });
}

async function createFixture() {
  await prisma.user.createMany({
    data: [
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        normalizedEmail: admin.email,
        passwordHash: "not-used",
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        id: faculty.id,
        name: faculty.name,
        email: faculty.email,
        normalizedEmail: faculty.email,
        passwordHash: "not-used",
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: faculty.id,
      courseCode: "S5C1",
      title: "Suppression",
      section: "A",
      term: "First",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: `${prefix}number`,
      firstName: "Suppressed",
      lastName: "Recipient",
      email: recipient,
    },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeId,
      classId,
      ownerUserId: faculty.id,
      name: "Suppression Badge",
      description: "Suppression integration badge.",
      criteria: "Complete the suppression integration activity.",
      imagePath: "badges/suppression.png",
      status: "ACTIVE",
    },
  });
  await prisma.badgeIssuance.create({
    data: {
      id: issuanceId,
      publicId: "s".repeat(32),
      classId,
      badgeTemplateId: badgeId,
      studentId,
      issuerUserId: faculty.id,
      status: "ACTIVE",
      issuedAt: new Date(),
      recipientSnapshotJson: {
        studentId,
        studentNumber: `${prefix}number`,
        displayName: "Suppressed Recipient",
        firstName: "Suppressed",
        lastName: "Recipient",
        email: recipient,
      },
      achievementSnapshotJson: {},
      issuerSnapshotJson: {},
      credentialJson: {},
    },
  });
  await prisma.notificationDelivery.create({
    data: {
      id: deliveryId,
      issuanceId,
      type: "BADGE_ISSUED",
      status: "PENDING",
      deliveryChannel: "mailpit",
      recipientEmail: recipient,
      recipientFirstName: "Suppressed",
      badgeName: "Suppression Badge",
      issuerName: "HAU SOC",
      verificationUrl: `http://localhost:3000/credentials/${"s".repeat(32)}`,
      occurredAt: new Date(),
    },
  });
}

function event(
  event: "hard_bounce" | "complaint" | "invalid_email" | "blocked" | "soft_bounce" | "delivered",
  id: string,
) {
  return {
    id,
    event,
    email: recipient,
    date: "2026-11-04T08:00:00.000Z",
    ...(event === "hard_bounce" ? { reason: "mailbox unavailable" } : {}),
  };
}

beforeEach(async () => {
  await cleanup();
  await createFixture();
});
afterEach(cleanup);

describe("durable recipient suppression with MariaDB", () => {
  it("stores a hard bounce, audits it, and stops already queued sends", async () => {
    const result = await processBrevoDeliveryEvent(
      prisma,
      event("hard_bounce", `${prefix}event-hard-bounce`),
    );
    expect(result.status).toBe("UNMATCHED");

    const suppression = await prisma.recipientSuppression.findUniqueOrThrow({
      where: { normalizedEmail: recipient },
    });
    expect(suppression).toMatchObject({
      reason: "HARD_BOUNCE",
      provider: "brevo",
      status: "ACTIVE",
      providerEventId: `${prefix}event-hard-bounce`,
    });
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery).toMatchObject({
      status: "FAILED",
      lastErrorCategory: "SUPPRESSED",
      safeDiagnosticCode: "RECIPIENT_SUPPRESSED",
    });
    await expect(
      prisma.auditLog.count({
        where: {
          action: "notification.recipient_suppressed",
          entityId: suppression.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("is idempotent for a repeated provider event", async () => {
    const duplicate = event("hard_bounce", `${prefix}event-duplicate`);
    await expect(processBrevoDeliveryEvent(prisma, duplicate)).resolves.toMatchObject({
      status: "UNMATCHED",
    });
    await expect(processBrevoDeliveryEvent(prisma, duplicate)).resolves.toMatchObject({
      status: "DUPLICATE",
    });
    const suppression = await prisma.recipientSuppression.findUniqueOrThrow({
      where: { normalizedEmail: recipient },
    });
    await expect(
      prisma.auditLog.count({
        where: { action: "notification.recipient_suppressed", entityId: suppression.id },
      }),
    ).resolves.toBe(1);
  });

  it("does not downgrade complaint suppression and ignores later delivery events", async () => {
    await processBrevoDeliveryEvent(prisma, event("complaint", `${prefix}event-complaint`));
    await processBrevoDeliveryEvent(
      prisma,
      event("hard_bounce", `${prefix}event-later-hard-bounce`),
    );
    await processBrevoDeliveryEvent(prisma, event("delivered", `${prefix}event-delivered`));

    const suppression = await prisma.recipientSuppression.findUniqueOrThrow({
      where: { normalizedEmail: recipient },
    });
    expect(suppression.reason).toBe("COMPLAINT");
    expect(suppression.status).toBe("ACTIVE");
  });

  it("does not suppress temporary delivery failures", async () => {
    await processBrevoDeliveryEvent(prisma, event("soft_bounce", `${prefix}event-soft-bounce`));
    await processBrevoDeliveryEvent(prisma, event("delivered", `${prefix}event-delivered-temp`));
    await expect(
      prisma.recipientSuppression.count({ where: { normalizedEmail: recipient } }),
    ).resolves.toBe(0);
  });

  it("requires an Administrator and explicit complaint acknowledgement to clear", async () => {
    await processBrevoDeliveryEvent(prisma, event("complaint", `${prefix}event-clear-complaint`));

    await expect(
      unsuppressRecipient(faculty, {
        normalizedEmail: recipient,
        reason: "Faculty cannot override suppression",
        acknowledgeComplaint: true,
      }),
    ).rejects.toThrow("Administrator access required");
    await expect(
      unsuppressRecipient(admin, {
        normalizedEmail: recipient,
        reason: "Operator reviewed the complaint",
      }),
    ).rejects.toBeInstanceOf(RecipientSuppressionError);

    await expect(
      unsuppressRecipient(admin, {
        normalizedEmail: recipient,
        reason: "Operator reviewed the complaint with the recipient",
        acknowledgeComplaint: true,
      }),
    ).resolves.toMatchObject({ previousReason: "COMPLAINT" });

    const cleared = await prisma.recipientSuppression.findUniqueOrThrow({
      where: { normalizedEmail: recipient },
    });
    expect(cleared).toMatchObject({
      status: "CLEARED",
      clearedByUserId: admin.id,
      clearReason: "Operator reviewed the complaint with the recipient",
    });
    await expect(
      prisma.auditLog.count({
        where: { action: "notification.recipient_suppression_cleared", entityId: cleared.id },
      }),
    ).resolves.toBe(1);

    await processBrevoDeliveryEvent(prisma, event("hard_bounce", `${prefix}event-after-clear`));
    const resuppressed = await prisma.recipientSuppression.findUniqueOrThrow({
      where: { normalizedEmail: recipient },
    });
    expect(resuppressed).toMatchObject({ status: "ACTIVE", reason: "HARD_BOUNCE" });
  });

  it("blocks queued worker delivery after suppression is discovered", async () => {
    await processBrevoDeliveryEvent(prisma, event("hard_bounce", `${prefix}event-worker`));
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PROCESSING",
        claimToken: "claim-token",
        claimExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const smtp = { send: vi.fn() };
    const claimed = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    await expect(
      deliverClaimed(prisma, smtp, claimed, {
        batchSize: 20,
        claimLeaseSeconds: 120,
        maxAttempts: 5,
        retryBaseDelaySeconds: 60,
        deliveryChannel: "mailpit",
        recipientPolicy: "local",
        externalEnabled: false,
        controlledAcceptanceOnly: false,
        allowlist: [],
      }),
    ).resolves.toBe("degraded");
    expect(smtp.send).not.toHaveBeenCalled();
    await expect(
      prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      safeDiagnosticCode: "RECIPIENT_SUPPRESSED",
    });
  });

  it("delivers only to the immutable issuance recipient under the production policy", async () => {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PROCESSING",
        claimToken: "production-claim",
        claimExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const smtp = { send: vi.fn().mockResolvedValue({ messageId: "provider-production" }) };
    const claimed = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    const config = {
      batchSize: 20,
      claimLeaseSeconds: 120,
      maxAttempts: 5,
      retryBaseDelaySeconds: 60,
      deliveryChannel: "mailpit" as const,
      recipientPolicy: "production" as const,
      externalEnabled: false,
      controlledAcceptanceOnly: false,
      allowlist: [],
    };

    await expect(deliverClaimed(prisma, smtp, claimed, config)).resolves.toBe("ready");
    expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({ to: recipient }));
    await expect(
      prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    ).resolves.toMatchObject({ status: "SENT" });
  });

  it("rejects recipient substitution under the production policy", async () => {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PROCESSING",
        claimToken: "substitution-claim",
        claimExpiresAt: new Date(Date.now() + 60_000),
        recipientEmail: "substituted@example.test",
      },
    });
    const smtp = { send: vi.fn() };
    const claimed = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    await expect(
      deliverClaimed(prisma, smtp, claimed, {
        batchSize: 20,
        claimLeaseSeconds: 120,
        maxAttempts: 5,
        retryBaseDelaySeconds: 60,
        deliveryChannel: "mailpit",
        recipientPolicy: "production",
        externalEnabled: false,
        controlledAcceptanceOnly: false,
        allowlist: [],
      }),
    ).resolves.toBe("degraded");
    expect(smtp.send).not.toHaveBeenCalled();
    await expect(
      prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      safeDiagnosticCode: "RECIPIENT_NOT_AUTHORIZED",
    });
  });

  it("keeps one suppression row across concurrent permanent events", async () => {
    await Promise.all([
      processBrevoDeliveryEvent(prisma, event("hard_bounce", `${prefix}event-race-1`)),
      processBrevoDeliveryEvent(prisma, event("invalid_email", `${prefix}event-race-2`)),
    ]);
    const suppressions = await prisma.recipientSuppression.findMany({
      where: { normalizedEmail: recipient },
    });
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0]?.status).toBe("ACTIVE");
  });
});
