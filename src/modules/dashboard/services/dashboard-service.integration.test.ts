import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { getDashboardData } from "./dashboard-service";

const prefix = "dashboard-integration-";
const admin: Actor = {
  id: `${prefix}admin`,
  name: "Dashboard Admin",
  email: `${prefix}admin@example.test`,
  role: "ADMIN",
};
const facultyOne: Actor = {
  id: `${prefix}faculty-one`,
  name: "Dashboard Faculty One",
  email: `${prefix}faculty-one@example.test`,
  role: "FACULTY",
};
const facultyTwo: Actor = {
  id: `${prefix}faculty-two`,
  name: "Dashboard Faculty Two",
  email: `${prefix}faculty-two@example.test`,
  role: "FACULTY",
};
const classOneId = `${prefix}class-one`;
const classTwoId = `${prefix}class-two`;
const studentOneId = `${prefix}student-one`;
const studentTwoId = `${prefix}student-two`;
const studentThreeId = `${prefix}student-three`;
const badgeOneId = `${prefix}badge-one`;
const badgeTwoId = `${prefix}badge-two`;
const badgeThreeId = `${prefix}badge-three`;
const userIds = [admin.id, facultyOne.id, facultyTwo.id];
const classIds = [classOneId, classTwoId];

let baseline: Awaited<ReturnType<typeof getDashboardData>>["stats"];

function issuance(
  id: string,
  options: {
    classId: string;
    badgeTemplateId: string;
    studentId: string;
    issuerUserId: string;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
    issuedAt: Date;
    expiresAt?: Date | null;
    recipientFirstName: string;
    recipientLastName: string;
    badgeName: string;
    courseCode: string;
  },
) {
  return {
    id: `${prefix}${id}`,
    publicId: `${prefix}public-${id}`,
    classId: options.classId,
    badgeTemplateId: options.badgeTemplateId,
    studentId: options.studentId,
    issuerUserId: options.issuerUserId,
    status: options.status,
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt ?? null,
    recipientSnapshotJson: {
      firstName: options.recipientFirstName,
      lastName: options.recipientLastName,
      displayName: `${options.recipientFirstName} ${options.recipientLastName}`,
    },
    achievementSnapshotJson: {
      name: options.badgeName,
      class: {
        courseCode: options.courseCode,
        title: "Dashboard Integration",
      },
    },
    issuerSnapshotJson: {},
    credentialJson: {},
    snapshotVersion: 1,
  };
}

async function removeFixture() {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.notificationDelivery.deleteMany({
    where: { issuance: { classId: { in: classIds } } },
  });
  await prisma.credentialStatusAllocation.deleteMany({
    where: { issuance: { classId: { in: classIds } } },
  });
  await prisma.badgeIssuance.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.classStudent.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.student.deleteMany({
    where: { id: { in: [studentOneId, studentTwoId, studentThreeId] } },
  });
  await prisma.badgeTemplate.deleteMany({
    where: { id: { in: [badgeOneId, badgeTwoId, badgeThreeId] } },
  });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createFixture() {
  const fixtureNow = new Date();
  const secondsAgo = (seconds: number) => new Date(fixtureNow.getTime() - seconds * 1000);
  await prisma.user.createMany({
    data: [
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        normalizedEmail: admin.email,
        passwordHash: "not-used-by-integration-test",
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        id: facultyOne.id,
        name: facultyOne.name,
        email: facultyOne.email,
        normalizedEmail: facultyOne.email,
        passwordHash: "not-used-by-integration-test",
        role: "FACULTY",
        status: "ACTIVE",
      },
      {
        id: facultyTwo.id,
        name: facultyTwo.name,
        email: facultyTwo.email,
        normalizedEmail: facultyTwo.email,
        passwordHash: "not-used-by-integration-test",
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.createMany({
    data: [
      {
        id: classOneId,
        ownerUserId: facultyOne.id,
        courseCode: "DASH-101",
        title: "Dashboard One",
        section: "A",
        term: "First Semester",
        academicYear: "2026-2027",
        status: "ACTIVE",
      },
      {
        id: classTwoId,
        ownerUserId: facultyTwo.id,
        courseCode: "DASH-202",
        title: "Dashboard Two",
        section: "B",
        term: "First Semester",
        academicYear: "2026-2027",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.student.createMany({
    data: [
      {
        id: studentOneId,
        studentNumber: `${prefix}student-one-number`,
        firstName: "Maria",
        lastName: "Santos",
        email: `${prefix}student-one@example.test`,
      },
      {
        id: studentTwoId,
        studentNumber: `${prefix}student-two-number`,
        firstName: "Juan",
        lastName: "Dela Cruz",
        email: `${prefix}student-two@example.test`,
      },
      {
        id: studentThreeId,
        studentNumber: `${prefix}student-three-number`,
        firstName: "Ana",
        lastName: "Reyes",
        email: `${prefix}student-three@example.test`,
      },
    ],
  });
  await prisma.classStudent.createMany({
    data: [
      { classId: classOneId, studentId: studentOneId, enrollmentStatus: "ACTIVE" },
      { classId: classOneId, studentId: studentTwoId, enrollmentStatus: "ACTIVE" },
      { classId: classOneId, studentId: studentThreeId, enrollmentStatus: "REMOVED" },
      { classId: classTwoId, studentId: studentThreeId, enrollmentStatus: "ACTIVE" },
    ],
  });
  await prisma.badgeTemplate.createMany({
    data: [
      {
        id: badgeOneId,
        classId: classOneId,
        ownerUserId: facultyOne.id,
        name: "Dashboard Badge One",
        description: "Dashboard integration badge.",
        criteria: "Complete dashboard integration.",
        imagePath: "badges/dashboard-one.png",
        status: "ACTIVE",
      },
      {
        id: badgeTwoId,
        classId: classOneId,
        ownerUserId: facultyOne.id,
        name: "Dashboard Badge Two",
        description: "Archived dashboard integration badge.",
        criteria: "Complete dashboard integration.",
        imagePath: "badges/dashboard-two.png",
        status: "ARCHIVED",
      },
      {
        id: badgeThreeId,
        classId: classTwoId,
        ownerUserId: facultyTwo.id,
        name: "Dashboard Badge Three",
        description: "Dashboard integration badge for the second class.",
        criteria: "Complete dashboard integration.",
        imagePath: "badges/dashboard-three.png",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.badgeIssuance.createMany({
    data: [
      issuance("issuance-one", {
        classId: classOneId,
        badgeTemplateId: badgeOneId,
        studentId: studentOneId,
        issuerUserId: facultyOne.id,
        status: "ACTIVE",
        issuedAt: secondsAgo(1),
        recipientFirstName: "Maria",
        recipientLastName: "Santos",
        badgeName: "Dashboard Badge One",
        courseCode: "DASH-101",
      }),
      issuance("issuance-two", {
        classId: classOneId,
        badgeTemplateId: badgeOneId,
        studentId: studentTwoId,
        issuerUserId: facultyOne.id,
        status: "ACTIVE",
        issuedAt: secondsAgo(2),
        expiresAt: new Date(fixtureNow.getTime() + 30 * 24 * 60 * 60 * 1000),
        recipientFirstName: "Juan",
        recipientLastName: "Dela Cruz",
        badgeName: "Dashboard Badge One",
        courseCode: "DASH-101",
      }),
      issuance("issuance-three", {
        classId: classOneId,
        badgeTemplateId: badgeOneId,
        studentId: studentOneId,
        issuerUserId: facultyOne.id,
        status: "REVOKED",
        issuedAt: secondsAgo(3),
        recipientFirstName: "Maria",
        recipientLastName: "Santos",
        badgeName: "Dashboard Badge One",
        courseCode: "DASH-101",
      }),
      issuance("issuance-four", {
        classId: classOneId,
        badgeTemplateId: badgeOneId,
        studentId: studentTwoId,
        issuerUserId: facultyOne.id,
        status: "ACTIVE",
        issuedAt: secondsAgo(4),
        expiresAt: new Date(fixtureNow.getTime() - 60 * 60 * 1000),
        recipientFirstName: "Juan",
        recipientLastName: "Dela Cruz",
        badgeName: "Dashboard Badge One",
        courseCode: "DASH-101",
      }),
      issuance("issuance-five", {
        classId: classTwoId,
        badgeTemplateId: badgeThreeId,
        studentId: studentThreeId,
        issuerUserId: facultyTwo.id,
        status: "ACTIVE",
        issuedAt: secondsAgo(5),
        recipientFirstName: "Ana",
        recipientLastName: "Reyes",
        badgeName: "Dashboard Badge Three",
        courseCode: "DASH-202",
      }),
      issuance("issuance-six", {
        classId: classTwoId,
        badgeTemplateId: badgeThreeId,
        studentId: studentThreeId,
        issuerUserId: facultyTwo.id,
        status: "EXPIRED",
        issuedAt: secondsAgo(6),
        recipientFirstName: "Ana",
        recipientLastName: "Reyes",
        badgeName: "Dashboard Badge Three",
        courseCode: "DASH-202",
      }),
    ],
  });
  await prisma.auditLog.createMany({
    data: [
      {
        id: `${prefix}audit-one`,
        actorUserId: facultyOne.id,
        action: "badge.issued",
        entityType: "BadgeIssuance",
        entityId: `${prefix}issuance-one`,
        createdAt: secondsAgo(1),
      },
      {
        id: `${prefix}audit-two`,
        actorUserId: facultyOne.id,
        action: "class.updated",
        entityType: "Class",
        entityId: classOneId,
        createdAt: secondsAgo(2),
      },
      {
        id: `${prefix}audit-three`,
        actorUserId: facultyTwo.id,
        action: "badge.revoked",
        entityType: "BadgeIssuance",
        entityId: `${prefix}issuance-five`,
        createdAt: secondsAgo(3),
      },
      {
        id: `${prefix}audit-four`,
        actorUserId: admin.id,
        action: "settings.updated",
        entityType: "SystemSetting",
        entityId: "default",
        createdAt: secondsAgo(4),
      },
    ],
  });
}

describe("dashboard aggregation with MariaDB", () => {
  beforeEach(async () => {
    await removeFixture();
    baseline = (await getDashboardData(admin)).stats;
    await createFixture();
  });
  afterEach(removeFixture);

  it("returns accurate global Administrator statistics and lifecycle counts", async () => {
    const dashboard = await getDashboardData(admin);

    expect(dashboard.role).toBe("ADMIN");
    expect(dashboard.stats).toMatchObject({
      facultyAccounts: (baseline.facultyAccounts ?? 0) + 2,
      classes: baseline.classes + 2,
      students: baseline.students + 3,
      badgeTemplates: baseline.badgeTemplates + 3,
      issuedBadges: baseline.issuedBadges + 6,
      activeCredentials: baseline.activeCredentials + 3,
      revokedCredentials: baseline.revokedCredentials + 1,
      expiredCredentials: baseline.expiredCredentials + 2,
    });
    expect(dashboard.recentIssuances).toHaveLength(5);
    expect(dashboard.recentIssuances[0]).toMatchObject({
      badgeName: "Dashboard Badge One",
      classLabel: "DASH-101 · Dashboard Integration",
      recipientDisplayName: "Maria S.",
      status: "ACTIVE",
    });
    expect(dashboard.recentIssuances.map((item) => item.id)).toEqual([
      `${prefix}issuance-one`,
      `${prefix}issuance-two`,
      `${prefix}issuance-three`,
      `${prefix}issuance-four`,
      `${prefix}issuance-five`,
    ]);
    expect(dashboard.issuancePagination).toMatchObject({
      page: 1,
      pageSize: 5,
      total: baseline.issuedBadges + 6,
      hasPrevious: false,
    });
    expect(dashboard.activityPagination).toMatchObject({ page: 1, pageSize: 5 });
    expect(dashboard.recentActivities[0]?.label).toBe("Badge issued");
    expect(
      dashboard.recentActivities.some((activity) => activity.label === "Issuer settings updated"),
    ).toBe(true);
    expect(dashboard.trend).toHaveLength(14);
    expect(dashboard.trend.reduce((sum, point) => sum + point.count, 0)).toBeGreaterThanOrEqual(6);
    expect(dashboard.quickActions.map((action) => action.label)).toContain("Create Faculty");
  });

  it("paginates recent issuances five records at a time in newest-first order", async () => {
    const first = await getDashboardData(admin);
    expect(first.recentIssuances.map((item) => item.id)).toEqual([
      `${prefix}issuance-one`,
      `${prefix}issuance-two`,
      `${prefix}issuance-three`,
      `${prefix}issuance-four`,
      `${prefix}issuance-five`,
    ]);

    const second = await getDashboardData(admin, { issuancePage: 2 });
    expect(second.issuancePagination).toMatchObject({
      page: 2,
      pageSize: 5,
      hasPrevious: true,
    });
    expect(second.recentIssuances.map((item) => item.id)).toContain(`${prefix}issuance-six`);
    expect(second.recentIssuances.map((item) => item.id)).not.toContain(`${prefix}issuance-one`);
  });

  it("isolates Faculty statistics, activity, and trends to owned classes and badges", async () => {
    const dashboard = await getDashboardData(facultyOne);

    expect(dashboard.role).toBe("FACULTY");
    expect(dashboard.stats).toMatchObject({
      facultyAccounts: null,
      classes: 1,
      students: 2,
      badgeTemplates: 2,
      issuedBadges: 4,
      activeCredentials: 2,
      revokedCredentials: 1,
      expiredCredentials: 1,
    });
    expect(dashboard.recentIssuances.map((item) => item.id)).toEqual([
      `${prefix}issuance-one`,
      `${prefix}issuance-two`,
      `${prefix}issuance-three`,
      `${prefix}issuance-four`,
    ]);
    expect(dashboard.issuancePagination).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 4,
      totalPages: 1,
      hasNext: false,
    });
    expect(dashboard.recentIssuances.some((item) => item.id.includes("issuance-five"))).toBe(false);
    expect(dashboard.recentActivities.map((activity) => activity.label)).toEqual([
      "Badge issued",
      "Class updated",
    ]);
    expect(
      dashboard.recentActivities.some((activity) => activity.actorName === facultyTwo.name),
    ).toBe(false);
    expect(dashboard.trend.reduce((sum, point) => sum + point.count, 0)).toBe(4);
    expect(dashboard.quickActions.map((action) => action.href)).toEqual([
      "/classes",
      `/classes/${classOneId}/badges`,
      `/classes/${classOneId}/issued`,
      "/issued",
    ]);
  });

  it("returns zeroed statistics and empty recent collections for an unused Faculty account", async () => {
    const emptyFaculty: Actor = {
      id: `${prefix}empty-faculty`,
      name: "Empty Faculty",
      email: `${prefix}empty-faculty@example.test`,
      role: "FACULTY",
    };
    await prisma.user.create({
      data: {
        id: emptyFaculty.id,
        name: emptyFaculty.name,
        email: emptyFaculty.email,
        normalizedEmail: emptyFaculty.email,
        passwordHash: "not-used-by-integration-test",
        role: "FACULTY",
        status: "ACTIVE",
      },
    });

    try {
      const dashboard = await getDashboardData(emptyFaculty);
      expect(dashboard.stats).toMatchObject({
        classes: 0,
        students: 0,
        badgeTemplates: 0,
        issuedBadges: 0,
        activeCredentials: 0,
        revokedCredentials: 0,
        expiredCredentials: 0,
      });
      expect(dashboard.recentIssuances).toEqual([]);
      expect(dashboard.recentActivities).toEqual([]);
      expect(dashboard.issuancePagination).toMatchObject({ page: 1, total: 0 });
      expect(dashboard.activityPagination).toMatchObject({ page: 1, total: 0 });
      expect(dashboard.trend.every((point) => point.count === 0)).toBe(true);
      expect(dashboard.quickActions.map((action) => action.href)).toEqual([
        "/classes",
        "/classes",
        "/classes",
        "/issued",
      ]);
    } finally {
      await prisma.user.deleteMany({ where: { id: emptyFaculty.id } });
    }
  });
});
