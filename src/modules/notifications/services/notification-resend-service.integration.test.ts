import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { NotificationResendError, resendIssuedNotification } from "./notification-resend-service";

const prefix = "notification-resend-integration-";
const admin: Actor = {
  id: `${prefix}admin`,
  name: "Resend Admin",
  email: `${prefix}admin@example.test`,
  role: "ADMIN",
};
const owner: Actor = {
  id: `${prefix}owner`,
  name: "Resend Owner",
  email: `${prefix}owner@example.test`,
  role: "FACULTY",
};
const other: Actor = {
  id: `${prefix}other`,
  name: "Resend Other",
  email: `${prefix}other@example.test`,
  role: "FACULTY",
};
const classId = `${prefix}class`;
const badgeId = `${prefix}badge`;
const studentId = `${prefix}student`;
const issuanceId = `${prefix}issuance`;
const deliveryId = `${prefix}delivery`;

async function cleanup() {
  await prisma.recipientSuppression.deleteMany({
    where: { normalizedEmail: `${prefix}student@example.test` },
  });
  await prisma.smtpSubmissionAttempt.deleteMany({
    where: { notificationDeliveryId: deliveryId },
  });
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, owner.id, other.id] } },
  });
  await prisma.notificationDelivery.deleteMany({ where: { issuanceId } });
  await prisma.badgeIssuance.deleteMany({ where: { id: issuanceId } });
  await prisma.classStudent.deleteMany({ where: { classId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: badgeId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, owner.id, other.id] } } });
}

beforeEach(async () => {
  await cleanup();
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
        id: owner.id,
        name: owner.name,
        email: owner.email,
        normalizedEmail: owner.email,
        passwordHash: "not-used",
        role: "FACULTY",
        status: "ACTIVE",
      },
      {
        id: other.id,
        name: other.name,
        email: other.email,
        normalizedEmail: other.email,
        passwordHash: "not-used",
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: owner.id,
      courseCode: "RESEND-101",
      title: "Resend",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: `${prefix}number`,
      firstName: "Resend",
      lastName: "Student",
      email: `${prefix}student@example.test`,
    },
  });
  await prisma.classStudent.create({
    data: { classId, studentId, enrollmentStatus: "ACTIVE" },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeId,
      classId,
      ownerUserId: owner.id,
      name: "Resend Badge",
      description: "Resend integration badge.",
      criteria: "Complete the resend integration activity.",
      imagePath: "badges/resend.png",
      status: "ACTIVE",
    },
  });
  await prisma.badgeIssuance.create({
    data: {
      id: issuanceId,
      publicId: "r".repeat(32),
      classId,
      badgeTemplateId: badgeId,
      studentId,
      issuerUserId: owner.id,
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
      recipientEmail: `${prefix}student@example.test`,
      recipientFirstName: "Resend",
      badgeName: "Resend Badge",
      issuerName: "HAU SOC",
      verificationUrl: `http://localhost:3000/credentials/${"r".repeat(32)}`,
      occurredAt: new Date(),
      sentAt: new Date(),
    },
  });
});
afterEach(cleanup);

describe("notification resend with MariaDB", () => {
  it("allows an Administrator to resend a SENT notification with audit", async () => {
    await expect(resendIssuedNotification(admin, { deliveryId })).resolves.toMatchObject({
      alreadyQueued: false,
      deliveryId,
    });
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      select: { status: true, resendCount: true, lastResendAt: true },
    });
    expect(delivery.status).toBe("PENDING");
    expect(delivery.resendCount).toBe(1);
    expect(delivery.lastResendAt).not.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: admin.id, action: "notification.resend_requested" },
      }),
    ).resolves.toBe(1);
  });

  it("allows the owning Faculty member and rejects a non-owner", async () => {
    await expect(resendIssuedNotification(other, { issuanceId })).rejects.toBeInstanceOf(Error);
    await expect(resendIssuedNotification(owner, { issuanceId })).resolves.toMatchObject({
      alreadyQueued: false,
    });
  });

  it("refuses to resend a notification from a different delivery channel", async () => {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { deliveryChannel: "brevo" },
    });
    await expect(resendIssuedNotification(admin, { deliveryId })).rejects.toBeInstanceOf(
      NotificationResendError,
    );
  });

  it("refuses to resend a controlled acceptance notification", async () => {
    await prisma.smtpSubmissionAttempt.create({
      data: {
        notificationDeliveryId: deliveryId,
        deliveryChannel: "brevo",
        recipient: `${prefix}student@example.test`,
        submissionState: "SUBMISSION_RESERVED",
      },
    });
    await expect(resendIssuedNotification(admin, { deliveryId })).rejects.toThrow(
      "Controlled acceptance notification cannot be resent",
    );
  });

  it("refuses to resend to a suppressed recipient even for an Administrator", async () => {
    await prisma.recipientSuppression.create({
      data: {
        normalizedEmail: `${prefix}student@example.test`,
        recipientEmail: `${prefix}student@example.test`,
        reason: "HARD_BOUNCE",
        provider: "brevo",
        providerEventId: `${prefix}resend-suppression-event`,
        suppressedAt: new Date(),
        status: "ACTIVE",
      },
    });
    await expect(resendIssuedNotification(admin, { deliveryId })).rejects.toThrow(
      "Recipient is suppressed",
    );
    await expect(
      prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    ).resolves.toMatchObject({ status: "SENT", resendCount: 0 });
  });

  it("enforces the staging allowlist on resend", async () => {
    const previous = { ...process.env };
    process.env.EMAIL_DELIVERY_MODE = "brevo";
    process.env.EMAIL_RECIPIENT_POLICY = "staging";
    process.env.EXTERNAL_EMAIL_ENABLED = "true";
    process.env.EXTERNAL_EMAIL_ALLOWLIST = "allowed@example.test";
    process.env.BREVO_SMTP_USER = "brevo-user";
    process.env.BREVO_SMTP_PASSWORD = "brevo-password";
    try {
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { deliveryChannel: "brevo" },
      });
      await expect(resendIssuedNotification(admin, { deliveryId })).rejects.toThrow(
        "not authorized for external email",
      );
      await expect(
        prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
      ).resolves.toMatchObject({ status: "SENT", resendCount: 0 });
    } finally {
      process.env = previous;
    }
  });

  it("enforces the resend cooldown", async () => {
    await resendIssuedNotification(admin, { deliveryId });
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: "SENT" },
    });
    await expect(resendIssuedNotification(admin, { deliveryId })).rejects.toBeInstanceOf(
      NotificationResendError,
    );
  });
});
