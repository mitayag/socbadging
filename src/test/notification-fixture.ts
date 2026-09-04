import { prisma } from "@/platform/db/prisma";
import type { Actor } from "@/modules/identity/types";

export const notificationAdmin: Actor = {
  id: "p7-admin",
  name: "P7 Admin",
  email: "p7-admin@example.test",
  role: "ADMIN",
};
export const notificationFaculty: Actor = {
  id: "p7-faculty",
  name: "P7 Faculty",
  email: "p7-faculty@example.test",
  role: "FACULTY",
};
export const notificationOtherFaculty: Actor = {
  id: "p7-other",
  name: "P7 Other",
  email: "p7-other@example.test",
  role: "FACULTY",
};

export async function removeNotificationFixture() {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: notificationAdmin.id }, { entityId: "p7-delivery" }] },
  });
  await prisma.notificationDelivery.deleteMany({ where: { issuanceId: "p7-issuance" } });
  await prisma.badgeIssuance.deleteMany({ where: { id: "p7-issuance" } });
  await prisma.badgeTemplate.deleteMany({ where: { id: "p7-badge" } });
  await prisma.student.deleteMany({ where: { id: "p7-student" } });
  await prisma.class.deleteMany({ where: { id: "p7-class" } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [notificationAdmin.id, notificationFaculty.id, notificationOtherFaculty.id] },
    },
  });
}

export async function createNotificationFixture(status: "FAILED" | "SENT" = "FAILED") {
  for (const actor of [notificationAdmin, notificationFaculty, notificationOtherFaculty]) {
    await prisma.user.create({
      data: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        normalizedEmail: actor.email,
        passwordHash: "not-used-by-integration-test",
        role: actor.role,
        status: "ACTIVE",
      },
    });
  }
  await prisma.class.create({
    data: {
      id: "p7-class",
      ownerUserId: notificationFaculty.id,
      courseCode: "P7",
      title: "Phase Seven",
      section: "A",
      term: "First",
      academicYear: "2026-2027",
    },
  });
  await prisma.student.create({
    data: {
      id: "p7-student",
      studentNumber: "P7-001",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada.private@example.test",
    },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: "p7-badge",
      classId: "p7-class",
      ownerUserId: notificationFaculty.id,
      name: "Phase Seven Badge",
      description: "Description",
      criteria: "Criteria",
      imagePath: "badges/p7.png",
    },
  });
  await prisma.badgeIssuance.create({
    data: {
      id: "p7-issuance",
      publicId: "p7-public-token",
      classId: "p7-class",
      badgeTemplateId: "p7-badge",
      studentId: "p7-student",
      issuerUserId: notificationFaculty.id,
      status: "ACTIVE",
      issuedAt: new Date("2026-08-23T00:00:00Z"),
      recipientSnapshotJson: {},
      achievementSnapshotJson: {},
      issuerSnapshotJson: {},
      credentialJson: {},
    },
  });
  await prisma.notificationDelivery.create({
    data: {
      id: "p7-delivery",
      issuanceId: "p7-issuance",
      type: "BADGE_ISSUED",
      status,
      recipientEmail: "ada.private@example.test",
      recipientFirstName: "Ada",
      badgeName: "Phase Seven Badge",
      issuerName: "HAU SOC",
      verificationUrl: "http://localhost:3000/credentials/p7-public-token",
      occurredAt: new Date("2026-08-23T00:00:00Z"),
      attemptCount: 2,
      lastErrorCategory: status === "FAILED" ? "TRANSIENT" : null,
      safeDiagnosticCode: status === "FAILED" ? "ETIMEDOUT" : null,
    },
  });
}
