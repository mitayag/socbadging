import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";

import {
  armControlledAcceptance,
  controlledAcceptanceKey,
  reconcileControlledSubmissions,
  reserveControlledSubmission,
} from "./controlled-acceptance-service";

const prefix = "controlled-acceptance-integration-";
const ownerId = `${prefix}owner`;
const classId = `${prefix}class`;
const badgeId = `${prefix}badge`;
const studentId = `${prefix}student`;
const issuanceId = `${prefix}issuance`;
const deliveryId = `${prefix}delivery`;
const recipient = "authorized-test-recipient@example.org";

function newClient(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 4,
    }),
  });
}

async function cleanup() {
  await prisma.smtpSubmissionAttempt.deleteMany({ where: { notificationDeliveryId: deliveryId } });
  await prisma.notificationDelivery.deleteMany({ where: { issuanceId } });
  await prisma.badgeIssuance.deleteMany({ where: { id: issuanceId } });
  await prisma.classStudent.deleteMany({ where: { classId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.badgeTemplate.deleteMany({ where: { id: badgeId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
}

beforeEach(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Controlled Acceptance Owner",
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
      courseCode: "CTRL-101",
      title: "Controlled Acceptance",
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
      firstName: "Controlled",
      lastName: "Acceptance",
      email: recipient,
    },
  });
  await prisma.classStudent.create({
    data: { classId, studentId, enrollmentStatus: "ACTIVE" },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeId,
      classId,
      ownerUserId: ownerId,
      name: "Controlled Acceptance Badge",
      description: "Controlled acceptance integration badge.",
      criteria: "Complete the controlled acceptance integration activity.",
      imagePath: "badges/controlled-acceptance.png",
      status: "ACTIVE",
    },
  });
  await prisma.badgeIssuance.create({
    data: {
      id: issuanceId,
      publicId: "c".repeat(32),
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
      status: "PENDING",
      deliveryChannel: "brevo",
      recipientEmail: recipient,
      recipientFirstName: "Controlled",
      badgeName: "Controlled Acceptance Badge",
      issuerName: "HAU SOC",
      verificationUrl: `http://localhost:3000/credentials/${"c".repeat(32)}`,
      occurredAt: new Date(),
    },
  });
});

afterEach(cleanup);

describe("controlled acceptance with MariaDB", () => {
  it("allows only one of two concurrent reservations across separate clients", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    const first = newClient();
    const second = newClient();
    try {
      const results = await Promise.all([
        reserveControlledSubmission(first, {
          id: deliveryId,
          deliveryChannel: "brevo",
          recipientEmail: recipient,
        }),
        reserveControlledSubmission(second, {
          id: deliveryId,
          deliveryChannel: "brevo",
          recipientEmail: recipient,
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual(["CONSUMED", "RESERVED"]);
    } finally {
      await first.$disconnect();
      await second.$disconnect();
    }
  });

  it("preserves the consumed attempt across a fresh client", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    const first = newClient();
    const second = newClient();
    try {
      await expect(
        reserveControlledSubmission(first, {
          id: deliveryId,
          deliveryChannel: "brevo",
          recipientEmail: recipient,
        }),
      ).resolves.toMatchObject({ status: "RESERVED" });
      await expect(
        reserveControlledSubmission(second, {
          id: deliveryId,
          deliveryChannel: "brevo",
          recipientEmail: recipient,
        }),
      ).resolves.toMatchObject({ status: "CONSUMED" });
    } finally {
      await first.$disconnect();
      await second.$disconnect();
    }
  });

  it("rejects a second controlled acceptance arm for the same notification", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    await expect(armControlledAcceptance(prisma, deliveryId)).rejects.toThrow(
      "Controlled acceptance is already armed",
    );
  });

  it("terminalizes a reserved attempt after a simulated crash without sending", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    const worker = newClient();
    try {
      await reserveControlledSubmission(worker, {
        id: deliveryId,
        deliveryChannel: "brevo",
        recipientEmail: recipient,
      });
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "PROCESSING",
          claimToken: "crashed-worker",
          claimExpiresAt: new Date(Date.now() - 60_000),
        },
      });
      await reconcileControlledSubmissions(prisma, new Date());
      const attempt = await prisma.smtpSubmissionAttempt.findUniqueOrThrow({
        where: { notificationDeliveryId: deliveryId },
      });
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
      });
      expect(attempt.submissionState).toBe("OUTCOME_UNKNOWN");
      expect(attempt.lastErrorCode).toBe("SUBMISSION_OUTCOME_UNKNOWN");
      expect(delivery.status).toBe("FAILED");
      expect(delivery.safeDiagnosticCode).toBe("SUBMISSION_OUTCOME_UNKNOWN");
    } finally {
      await worker.$disconnect();
    }
  });

  it("marks the delivery SENT when SMTP acceptance was recorded before a crash", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    await prisma.smtpSubmissionAttempt.update({
      where: { notificationDeliveryId: deliveryId },
      data: {
        submissionState: "ACCEPTED",
        smtpCompletedAt: new Date(),
        providerMessageId: "provider-crash-window",
      },
    });
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PROCESSING",
        claimToken: "crashed-worker",
        claimExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    await reconcileControlledSubmissions(prisma, new Date());
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.status).toBe("SENT");
    expect(delivery.providerMessageId).toBe("provider-crash-window");
  });

  it("keeps the unique acceptance key scoped to one controlled test", async () => {
    await armControlledAcceptance(prisma, deliveryId);
    const attempt = await prisma.smtpSubmissionAttempt.findUniqueOrThrow({
      where: { notificationDeliveryId: deliveryId },
    });
    expect(attempt.acceptanceKey).toBe(controlledAcceptanceKey);
  });
});
