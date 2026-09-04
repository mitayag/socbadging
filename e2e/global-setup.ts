import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prefix = "phase6-e2e-";
const activePublicId = "A".repeat(32);
const expiredPublicId = "B".repeat(32);
const revokedPublicId = "C".repeat(32);
const ratePublicId = "E".repeat(32);
const desktopRevocablePublicId = "F".repeat(32);
const mobileRevocablePublicId = "G".repeat(32);

function connect(urlValue: string) {
  const url = new URL(urlValue);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });
}

function snapshots(publicId: string, appUrl: string, badgeTemplateId: string) {
  const issuedAt = new Date("2026-08-15T08:00:00.000Z");
  const issuer = {
    name: "Phase 6 E2E Issuer",
    url: "https://issuer.example.test",
    logoUrl: `${appUrl}/images/hausoclogo.png`,
    issuerUserId: `${prefix}faculty`,
    issuerUserName: "E2E Faculty",
  };
  const achievement = {
    badgeTemplateId,
    id: `${appUrl}/achievements/${badgeTemplateId}`,
    type: ["Achievement"],
    name: "Phase 6 E2E Badge",
    description: "A disposable browser-regression credential.",
    criteria: { narrative: "Complete the E2E verification activity." },
    imagePath: "badges/e2e.png",
    image: { id: `${appUrl}/api/media/badges/e2e.png`, type: "Image" },
    skills: ["Verification"],
    tag: ["Verification"],
    templateUpdatedAt: issuedAt.toISOString(),
    class: {
      id: `${prefix}class`,
      courseCode: "E2E-600",
      title: "Phase 6 E2E",
      section: "A",
      term: "Test",
      academicYear: "2026-2027",
    },
    expiresAfterDays: null,
  };
  return {
    recipient: {
      studentId: `${prefix}student`,
      studentNumber: "e2e-internal-student",
      displayName: "E2E Recipient",
      firstName: "E2E",
      lastName: "Recipient",
      email: "e2e-recipient@example.test",
    },
    achievement,
    issuer,
    credential: {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      id: `${appUrl}/credentials/${publicId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      name: achievement.name,
      issuer: {
        id: issuer.url,
        type: ["Profile"],
        name: issuer.name,
        image: { id: issuer.logoUrl, type: "Image" },
      },
      validFrom: issuedAt.toISOString(),
      credentialSubject: {
        type: ["AchievementSubject"],
        identifier: [
          {
            type: "IdentityObject",
            identityHash: "a".repeat(64),
            identityType: "email",
            hashed: true,
          },
        ],
        achievement: {
          id: achievement.id,
          type: ["Achievement"],
          name: achievement.name,
          description: achievement.description,
          criteria: achievement.criteria,
          image: achievement.image,
          tag: achievement.tag,
        },
      },
    },
  };
}

export default async function globalSetup() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || process.env.E2E_CONFIRM_DISPOSABLE_DATABASE !== "true") {
    throw new Error(
      "E2E requires TEST_DATABASE_URL and E2E_CONFIRM_DISPOSABLE_DATABASE=true for a disposable local database.",
    );
  }
  const appUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
  const fixturePath = resolve(process.cwd(), ".playwright-e2e-fixture.json");
  const password = `phase7-e2e-${randomUUID()}`;
  const prisma = connect(databaseUrl);
  const ids = {
    admin: `${prefix}admin`,
    faculty: `${prefix}faculty`,
    nonOwner: `${prefix}non-owner`,
    class: `${prefix}class`,
    badgeActive: `${prefix}badge-active`,
    badgeExpired: `${prefix}badge-expired`,
    badgeRevoked: `${prefix}badge-revoked`,
    badgeRate: `${prefix}badge-rate`,
    badgeDesktopRevocable: `${prefix}badge-desktop-revocable`,
    badgeMobileRevocable: `${prefix}badge-mobile-revocable`,
    student: `${prefix}student`,
    active: `${prefix}issuance-active`,
    expired: `${prefix}issuance-expired`,
    revoked: `${prefix}issuance-revoked`,
    desktopRevocable: `${prefix}issuance-desktop-revocable`,
    mobileRevocable: `${prefix}issuance-mobile-revocable`,
    rate: `${prefix}issuance-rate`,
    desktopNotification: `${prefix}notification-desktop`,
    mobileNotification: `${prefix}notification-mobile`,
  };
  const oldSettings = await prisma.systemSetting.findUnique({ where: { id: "default" } });
  const oldSettingsData = oldSettings
    ? {
        issuerName: oldSettings.issuerName,
        issuerUrl: oldSettings.issuerUrl,
        issuerLogoPath: oldSettings.issuerLogoPath,
        supportContact: oldSettings.supportContact,
        sharingEnabled: oldSettings.sharingEnabled,
        updatedByUserId: oldSettings.updatedByUserId,
      }
    : null;

  async function cleanup() {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [ids.admin, ids.faculty, ids.nonOwner] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [ids.admin, ids.faculty, ids.nonOwner] } },
    });
    await prisma.notificationDelivery.deleteMany({ where: { issuance: { classId: ids.class } } });
    await prisma.badgeIssuance.deleteMany({ where: { classId: ids.class } });
    await prisma.classStudent.deleteMany({ where: { classId: ids.class } });
    await prisma.badgeTemplate.deleteMany({ where: { classId: ids.class } });
    await prisma.class.deleteMany({ where: { id: ids.class } });
    await prisma.student.deleteMany({ where: { id: ids.student } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.faculty, ids.nonOwner] } } });
  }

  await cleanup();
  const passwordHash = await argon2.hash(password);
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "E2E Administrator",
        email: "phase6-e2e-admin@example.test",
        normalizedEmail: "phase6-e2e-admin@example.test",
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        id: ids.faculty,
        name: "E2E Faculty",
        email: "phase6-e2e-faculty@example.test",
        normalizedEmail: "phase6-e2e-faculty@example.test",
        passwordHash,
        role: "FACULTY",
        status: "ACTIVE",
      },
      {
        id: ids.nonOwner,
        name: "E2E Non Owner",
        email: "phase6-e2e-nonowner@example.test",
        normalizedEmail: "phase6-e2e-nonowner@example.test",
        passwordHash,
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: ids.class,
      ownerUserId: ids.faculty,
      courseCode: "E2E-600",
      title: "Phase 6 E2E",
      section: "A",
      term: "Test",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: ids.student,
      studentNumber: "e2e-internal-student",
      firstName: "E2E",
      lastName: "Recipient",
      email: "e2e-recipient@example.test",
    },
  });
  await prisma.classStudent.create({
    data: { classId: ids.class, studentId: ids.student, enrollmentStatus: "ACTIVE" },
  });
  await prisma.badgeTemplate.createMany({
    data: [
      ids.badgeActive,
      ids.badgeExpired,
      ids.badgeRevoked,
      ids.badgeRate,
      ids.badgeDesktopRevocable,
      ids.badgeMobileRevocable,
    ].map((id) => ({
      id,
      classId: ids.class,
      ownerUserId: ids.faculty,
      name: "Phase 6 E2E Badge",
      description: "E2E",
      criteria: "E2E",
      imagePath: "badges/e2e.png",
      status: "ACTIVE",
    })),
  });
  for (const [id, publicId, badgeTemplateId, status, expiresAt, revokedAt, revocationReason] of [
    [ids.active, activePublicId, ids.badgeActive, "ACTIVE", null, null, null],
    [
      ids.expired,
      expiredPublicId,
      ids.badgeExpired,
      "ACTIVE",
      new Date("2026-01-01T00:00:00.000Z"),
      null,
      null,
    ],
    [
      ids.revoked,
      revokedPublicId,
      ids.badgeRevoked,
      "REVOKED",
      null,
      new Date("2026-08-15T09:00:00.000Z"),
      "E2E revoked",
    ],
    [
      ids.desktopRevocable,
      desktopRevocablePublicId,
      ids.badgeDesktopRevocable,
      "ACTIVE",
      null,
      null,
      null,
    ],
    [
      ids.mobileRevocable,
      mobileRevocablePublicId,
      ids.badgeMobileRevocable,
      "ACTIVE",
      null,
      null,
      null,
    ],
    [ids.rate, ratePublicId, ids.badgeRate, "ACTIVE", null, null, null],
  ] as const) {
    const value = snapshots(publicId, appUrl, badgeTemplateId);
    await prisma.badgeIssuance.create({
      data: {
        id,
        publicId,
        classId: ids.class,
        badgeTemplateId,
        studentId: ids.student,
        issuerUserId: ids.faculty,
        status,
        issuedAt: new Date("2026-08-15T08:00:00.000Z"),
        expiresAt,
        revokedAt,
        revocationReason,
        recipientSnapshotJson: value.recipient,
        achievementSnapshotJson: value.achievement,
        issuerSnapshotJson: value.issuer,
        credentialJson: value.credential,
        snapshotVersion: 1,
      },
    });
  }
  await prisma.notificationDelivery.createMany({
    data: (
      [
        [ids.desktopNotification, ids.desktopRevocable],
        [ids.mobileNotification, ids.mobileRevocable],
      ] as const
    ).map(([id, issuanceId]) => ({
      id,
      issuanceId,
      type: "BADGE_ISSUED" as const,
      status: "FAILED" as const,
      recipientEmail: "e2e-recipient@example.test",
      recipientFirstName: "E2E",
      badgeName: "Phase 6 E2E Badge",
      issuerName: "E2E Issuer",
      verificationUrl: `${appUrl}/credentials/${
        issuanceId === ids.desktopRevocable ? desktopRevocablePublicId : mobileRevocablePublicId
      }`,
      supportContact: null,
      occurredAt: new Date("2026-08-15T08:00:00.000Z"),
      attemptCount: 1,
      lastErrorCategory: "TRANSIENT",
      safeDiagnosticCode: "ECONNECTION",
    })),
  });
  await prisma.systemSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      issuerName: "E2E Issuer",
      issuerUrl: "https://issuer.example.test",
      issuerLogoPath: "/images/hausoclogo.png",
      supportContact: null,
      sharingEnabled: true,
    },
    update: {
      issuerName: "E2E Issuer",
      issuerUrl: "https://issuer.example.test",
      issuerLogoPath: "/images/hausoclogo.png",
      supportContact: null,
      sharingEnabled: true,
    },
  });

  const fixture = {
    E2E_ACTIVE_PUBLIC_ID: activePublicId,
    E2E_EXPIRED_PUBLIC_ID: expiredPublicId,
    E2E_REVOKED_PUBLIC_ID: revokedPublicId,
    E2E_DESKTOP_REVOCABLE_PUBLIC_ID: desktopRevocablePublicId,
    E2E_MOBILE_REVOCABLE_PUBLIC_ID: mobileRevocablePublicId,
    E2E_RATE_PUBLIC_ID: ratePublicId,
    E2E_DESKTOP_OWNED_ISSUANCE_ID: ids.desktopRevocable,
    E2E_MOBILE_OWNED_ISSUANCE_ID: ids.mobileRevocable,
    E2E_FACULTY_EMAIL: "phase6-e2e-faculty@example.test",
    E2E_FACULTY_PASSWORD: password,
    E2E_ADMIN_EMAIL: "phase6-e2e-admin@example.test",
    E2E_ADMIN_PASSWORD: password,
    E2E_NON_OWNER_EMAIL: "phase6-e2e-nonowner@example.test",
    E2E_NON_OWNER_PASSWORD: password,
    E2E_DESKTOP_NOTIFICATION_ID: ids.desktopNotification,
    E2E_MOBILE_NOTIFICATION_ID: ids.mobileNotification,
  };
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  return async () => {
    await cleanup();
    if (oldSettingsData)
      await prisma.systemSetting.upsert({
        where: { id: "default" },
        create: { id: "default", ...oldSettingsData },
        update: oldSettingsData,
      });
    else await prisma.systemSetting.deleteMany({ where: { id: "default" } });
    await unlink(fixturePath).catch((error: unknown) => {
      if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
    });
    await prisma.$disconnect();
  };
}
