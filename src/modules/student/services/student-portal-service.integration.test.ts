import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";
import { buildCredentialSnapshots } from "@/modules/issuance/services/credential-snapshot";
import { prisma } from "@/platform/db/prisma";

import {
  getStudentBadgeDetail,
  getStudentDashboard,
  listStudentBadges,
  listStudentNotifications,
  StudentBadgeNotFoundError,
} from "./student-portal-service";

const prefix = "student-portal-integration-";
const adminId = `${prefix}admin`;
const studentAId = `${prefix}student-a`;
const studentBId = `${prefix}student-b`;
const studentCId = `${prefix}student-c`;
const userAId = `${prefix}user-a`;
const userBId = `${prefix}user-b`;
const classId = `${prefix}class`;
const badgeId = `${prefix}badge`;
const issuanceA1 = `${prefix}issuance-a1`;
const issuanceA2 = `${prefix}issuance-a2`;
const issuanceA3 = `${prefix}issuance-a3`;
const issuanceB1 = `${prefix}issuance-b1`;
const issuanceC1 = `${prefix}issuance-c1`;
const studentA: Actor = {
  id: userAId,
  name: "Portal Student A",
  email: `${prefix}a@example.test`,
  role: "STUDENT",
};
const studentB: Actor = {
  id: userBId,
  name: "Portal Student B",
  email: `${prefix}b@example.test`,
  role: "STUDENT",
};
const now = new Date();

function publicId() {
  return randomBytes(24).toString("base64url");
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [studentAId, studentBId] } } });
  await prisma.notificationDelivery.deleteMany({
    where: { issuance: { classId } },
  });
  await prisma.credentialStatusAllocation.deleteMany({ where: { issuance: { classId } } });
  await prisma.badgeIssuance.deleteMany({ where: { classId } });
  await prisma.classStudent.deleteMany({ where: { classId } });
  await prisma.studentToken.deleteMany({ where: { studentId: { in: [studentAId, studentBId] } } });
  await prisma.studentAccount.deleteMany({
    where: { studentId: { in: [studentAId, studentBId] } },
  });
  await prisma.badgeTemplate.deleteMany({ where: { id: badgeId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, userAId, userBId] } } });
  await prisma.student.deleteMany({ where: { id: { in: [studentAId, studentBId, studentCId] } } });
}

function issuanceData(
  id: string,
  options: {
    studentId: string;
    issuerUserId: string;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
    issuedAt: Date;
    expiresAt: Date | null;
  },
) {
  const snapshots = buildCredentialSnapshots({
    publicId: publicId(),
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    recipient: {
      studentId: options.studentId,
      studentNumber: options.studentId,
      displayName: options.studentId === studentAId ? "Portal Student A" : "Portal Student B",
      firstName: options.studentId === studentAId ? "Portal" : "Portal",
      lastName: options.studentId === studentAId ? "A" : "B",
      email: options.studentId === studentAId ? studentA.email : studentB.email,
    },
    achievement: {
      badgeTemplateId: badgeId,
      name: options.studentId === studentAId ? "Portal Badge A" : "Portal Badge B",
      description: "Student portal integration badge.",
      criteria: "Complete the student portal integration activity.",
      imagePath: "badges/student-portal.png",
      skills: ["Portal"],
      templateUpdatedAt: now,
      class: {
        id: classId,
        courseCode: "PORTAL-101",
        title: "Portal Integration",
        section: "A",
        term: "First Semester",
        academicYear: "2026-2027",
      },
      expiresAfterDays: null,
    },
    issuer: { issuerUserId: options.issuerUserId, issuerUserName: "Portal Faculty" },
  });
  return {
    id,
    publicId: snapshots.credential.id.split("/").at(-1)!,
    classId,
    badgeTemplateId: badgeId,
    studentId: options.studentId,
    issuerUserId: options.issuerUserId,
    status: options.status,
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    recipientSnapshotJson: snapshots.recipient,
    achievementSnapshotJson: snapshots.achievement,
    issuerSnapshotJson: snapshots.issuer,
    credentialJson: snapshots.credential,
    snapshotVersion: 1,
  };
}

beforeEach(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        name: "Portal Admin",
        email: `${prefix}admin@example.test`,
        normalizedEmail: `${prefix}admin@example.test`,
        passwordHash: "not-used",
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        id: userAId,
        name: studentA.name,
        email: studentA.email,
        normalizedEmail: studentA.email,
        passwordHash: "not-used",
        role: "STUDENT",
        status: "ACTIVE",
      },
      {
        id: userBId,
        name: studentB.name,
        email: studentB.email,
        normalizedEmail: studentB.email,
        passwordHash: "not-used",
        role: "STUDENT",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.student.createMany({
    data: [
      {
        id: studentAId,
        studentNumber: `${prefix}a`,
        firstName: "Portal",
        lastName: "A",
        email: studentA.email,
      },
      {
        id: studentBId,
        studentNumber: `${prefix}b`,
        firstName: "Portal",
        lastName: "B",
        email: studentB.email,
      },
    ],
  });
  await prisma.studentAccount.createMany({
    data: [
      { userId: userAId, studentId: studentAId, activatedAt: now },
      { userId: userBId, studentId: studentBId, activatedAt: now },
    ],
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: adminId,
      courseCode: "PORTAL-101",
      title: "Portal Integration",
      section: "A",
      term: "First Semester",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.badgeTemplate.create({
    data: {
      id: badgeId,
      classId,
      ownerUserId: adminId,
      name: "Portal Badge",
      description: "Student portal integration badge.",
      criteria: "Complete the student portal integration activity.",
      imagePath: "badges/student-portal.png",
      status: "ACTIVE",
    },
  });
  await prisma.classStudent.createMany({
    data: [
      { classId, studentId: studentAId, enrollmentStatus: "ACTIVE" },
      { classId, studentId: studentBId, enrollmentStatus: "ACTIVE" },
    ],
  });
  await prisma.badgeIssuance.createMany({
    data: [
      issuanceData(issuanceA1, {
        studentId: studentAId,
        issuerUserId: adminId,
        status: "ACTIVE",
        issuedAt: new Date(now.getTime() - 1_000),
        expiresAt: null,
      }),
      issuanceData(issuanceA2, {
        studentId: studentAId,
        issuerUserId: adminId,
        status: "ACTIVE",
        issuedAt: new Date(now.getTime() - 2_000),
        expiresAt: new Date(now.getTime() - 1_000),
      }),
      issuanceData(issuanceA3, {
        studentId: studentAId,
        issuerUserId: adminId,
        status: "REVOKED",
        issuedAt: new Date(now.getTime() - 3_000),
        expiresAt: null,
      }),
      issuanceData(issuanceB1, {
        studentId: studentBId,
        issuerUserId: adminId,
        status: "ACTIVE",
        issuedAt: new Date(now.getTime() - 4_000),
        expiresAt: null,
      }),
    ],
  });
  await prisma.notificationDelivery.createMany({
    data: [
      {
        id: `${prefix}notification-a`,
        issuanceId: issuanceA1,
        type: "BADGE_ISSUED",
        status: "SENT",
        recipientEmail: studentA.email,
        recipientFirstName: "Portal",
        badgeName: "Portal Badge A",
        issuerName: "HAU SOC",
        verificationUrl: `http://localhost:3000/credentials/${issuanceA1}`,
        occurredAt: now,
      },
      {
        id: `${prefix}notification-b`,
        issuanceId: issuanceB1,
        type: "BADGE_ISSUED",
        status: "SENT",
        recipientEmail: studentB.email,
        recipientFirstName: "Portal",
        badgeName: "Portal Badge B",
        issuerName: "HAU SOC",
        verificationUrl: `http://localhost:3000/credentials/${issuanceB1}`,
        occurredAt: now,
      },
    ],
  });
});
afterEach(cleanup);

describe("student portal scoping with MariaDB", () => {
  it("returns only the authenticated student's metrics, badges, and notifications", async () => {
    const dashboard = await getStudentDashboard(studentA);
    expect(dashboard).toMatchObject({ total: 3, active: 1, expired: 1, revoked: 1 });
    expect(dashboard.recent.map((item) => item.issuanceId)).toEqual([
      issuanceA1,
      issuanceA2,
      issuanceA3,
    ]);
    const badges = await listStudentBadges(studentA);
    expect(badges.items.map((item) => item.issuanceId)).toEqual([
      issuanceA1,
      issuanceA2,
      issuanceA3,
    ]);
    const notifications = await listStudentNotifications(studentA);
    expect(notifications.items.map((item) => item.badgeName)).toEqual(["Portal Badge A"]);
  });

  it("does not rely on matching email addresses to expose credentials", async () => {
    await prisma.student.create({
      data: {
        id: studentCId,
        studentNumber: `${prefix}c`,
        firstName: "Portal",
        lastName: "C",
        email: studentA.email,
      },
    });
    await prisma.classStudent.create({
      data: { classId, studentId: studentCId, enrollmentStatus: "ACTIVE" },
    });
    await prisma.badgeIssuance.create({
      data: issuanceData(issuanceC1, {
        studentId: studentCId,
        issuerUserId: adminId,
        status: "ACTIVE",
        issuedAt: new Date(now.getTime() - 5_000),
        expiresAt: null,
      }),
    });
    try {
      const badges = await listStudentBadges(studentA);
      expect(badges.items.map((item) => item.issuanceId)).not.toContain(issuanceC1);
    } finally {
      await prisma.badgeIssuance.deleteMany({ where: { id: issuanceC1 } });
      await prisma.classStudent.deleteMany({ where: { studentId: studentCId } });
      await prisma.student.deleteMany({ where: { id: studentCId } });
    }
  });

  it("supports deterministic student badge sorting", async () => {
    const badges = await listStudentBadges(studentA, { sort: "issued_asc" });
    expect(badges.items.map((item) => item.issuanceId)).toEqual([
      issuanceA3,
      issuanceA2,
      issuanceA1,
    ]);
  });

  it("prevents Student A from opening Student B's credential", async () => {
    await expect(getStudentBadgeDetail(studentA, issuanceA1)).resolves.toMatchObject({
      issuanceId: issuanceA1,
    });
    await expect(getStudentBadgeDetail(studentA, issuanceB1)).rejects.toBeInstanceOf(
      StudentBadgeNotFoundError,
    );
  });
});
