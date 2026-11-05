import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";

import { processBrevoDeliveryEvent } from "./notification-delivery-event-service";

const prefix = "stage4-event-integration-";
const ownerId = `${prefix}owner`;
const classId = `${prefix}class`;
const badgeId = `${prefix}badge`;
const studentId = `${prefix}student`;
const issuanceId = `${prefix}issuance`;
const deliveryId = `${prefix}delivery`;
const messageId = `<${prefix}message@example.test>`;
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
    where: {
      OR: [{ notificationDeliveryId: deliveryId }, { providerEventId: { startsWith: prefix } }],
    },
  });
  await prisma.notificationDeliveryAttempt.deleteMany({
    where: { notificationDeliveryId: deliveryId },
  });
  await prisma.notificationDelivery.deleteMany({ where: { issuanceId } });
  await prisma.badgeIssuance.deleteMany({ where: { id: issuanceId } });
  await prisma.classStudent.deleteMany({ where: { classId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: badgeId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: `${prefix}event-${Math.random().toString(36).slice(2)}`,
    event: "delivered",
    email: recipient,
    "message-id": messageId,
    date: "2026-11-02T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Stage 4 Event Owner",
      email: `${prefix}owner@example.test`,
      normalizedEmail: `${prefix}owner@example.test`,
      passwordHash: "not-used",
      role: "FACULTY",
      status: "ACTIVE",
    },
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: ownerId,
      courseCode: "S4-EVENT",
      title: "Stage 4 Events",
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
      firstName: "Event",
      lastName: "Recipient",
      email: recipient,
    },
  });
  await prisma.classStudent.create({ data: { classId, studentId, enrollmentStatus: "ACTIVE" } });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeId,
      classId,
      ownerUserId: ownerId,
      name: "Stage 4 Event Badge",
      description: "Stage 4 event integration badge.",
      criteria: "Complete the event integration test.",
      imagePath: "badges/event.png",
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
      issuerUserId: ownerId,
      status: "ACTIVE",
      issuedAt: new Date(),
      recipientSnapshotJson: {},
      achievementSnapshotJson: {},
      issuerSnapshotJson: {},
      credentialJson: {},
      snapshotVersion: 1,
    },
  });
  await prisma.notificationDelivery.create({
    data: {
      id: deliveryId,
      issuanceId,
      type: "BADGE_ISSUED",
      status: "SENT",
      deliveryChannel: "brevo",
      recipientEmail: recipient,
      recipientFirstName: "Event",
      badgeName: "Stage 4 Event Badge",
      issuerName: "HAU SOC",
      verificationUrl: `http://localhost:3000/credentials/${"s".repeat(32)}`,
      occurredAt: new Date(),
      providerMessageId: messageId,
      sentAt: new Date("2026-11-02T07:59:00.000Z"),
      smtpAcceptedAt: new Date("2026-11-02T07:59:00.000Z"),
    },
  });
});

afterEach(cleanup);

describe("notification delivery event projection", () => {
  it("applies delivered, rejects duplicate replay, and ignores stale events", async () => {
    const delivered = event();
    await expect(processBrevoDeliveryEvent(prisma, delivered)).resolves.toMatchObject({
      status: "APPLIED",
    });
    let delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.providerStatus).toBe("DELIVERED");

    await expect(processBrevoDeliveryEvent(prisma, delivered)).resolves.toEqual({
      status: "DUPLICATE",
    });
    await expect(
      processBrevoDeliveryEvent(
        prisma,
        event({ event: "deferred", date: "2026-11-02T07:58:00.000Z" }),
      ),
    ).resolves.toMatchObject({ status: "STALE" });
    delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery.providerStatus).toBe("DELIVERED");
    expect(
      await prisma.notificationDeliveryEvent.count({
        where: { notificationDeliveryId: deliveryId },
      }),
    ).toBe(2);
  });

  it("advances to terminal bounce/complaint and refuses regression to delivered", async () => {
    await processBrevoDeliveryEvent(prisma, event());
    await expect(
      processBrevoDeliveryEvent(
        prisma,
        event({
          event: "hard_bounce",
          date: "2026-11-02T08:01:00.000Z",
          reason: "Mailbox unavailable",
        }),
      ),
    ).resolves.toMatchObject({ status: "APPLIED" });
    let delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.providerStatus).toBe("BOUNCED");

    await expect(
      processBrevoDeliveryEvent(
        prisma,
        event({ event: "delivered", date: "2026-11-02T08:02:00.000Z" }),
      ),
    ).resolves.toMatchObject({ status: "STALE" });
    delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery.providerStatus).toBe("BOUNCED");

    await expect(
      processBrevoDeliveryEvent(
        prisma,
        event({ event: "complaint", date: "2026-11-02T08:03:00.000Z", reason: "Spam complaint" }),
      ),
    ).resolves.toMatchObject({ status: "APPLIED" });
    delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery.providerStatus).toBe("COMPLAINT");
  });

  it("records an unmatched event without changing a delivery", async () => {
    const result = await processBrevoDeliveryEvent(
      prisma,
      event({
        id: `${prefix}unmatched`,
        email: "unknown@example.test",
        "message-id": "<unknown@example.test>",
      }),
    );
    expect(result).toEqual({ status: "UNMATCHED" });
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.providerStatus).toBeNull();
  });
});
