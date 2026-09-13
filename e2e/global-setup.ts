import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prefix = "phase6-e2e-";
const activePublicId = "A".repeat(32);
const expiredPublicId = "B".repeat(32);
const revokedPublicId = "C".repeat(32);
const ratePublicId = "E".repeat(32);
const desktopRevocablePublicId = "F".repeat(32);
const mobileRevocablePublicId = "G".repeat(32);
const signedDesktopPublicId = "H".repeat(32);
const signedMobilePublicId = "I".repeat(32);
const signedExpiredPublicId = "J".repeat(32);
const signedTamperedPublicId = "K".repeat(32);
const signedOriginalPublicId = "L".repeat(32);
const signedReplacementPublicId = "M".repeat(32);

type SignerFixture = {
  privateKeyPath: string;
  appUrl: string;
  keyId: string;
  issuerUrl: string;
  publicKeyMultibase: string;
  fingerprint: string;
  signerToken: string;
  signerControlToken: string;
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function emptyRevocationList(): string {
  const compressed = gzipSync(Buffer.alloc(16 * 1024), { level: 6 });
  compressed[8] = 0;
  compressed[9] = 3;
  return `u${compressed.toString("base64url")}`;
}

async function signDocument(
  document: unknown,
  signerToken: string,
): Promise<Record<string, unknown>> {
  const response = await fetch("http://127.0.0.1:3101/v1/sign", {
    method: "POST",
    headers: {
      authorization: `Bearer ${signerToken}`,
      "content-type": "application/json",
      "x-correlation-id": randomUUID(),
    },
    body: JSON.stringify({ operation: "credential.sign", document }),
  });
  if (!response.ok) throw new Error(`E2E signer rejected fixture: ${response.status}`);
  const result = (await response.json()) as { document?: Record<string, unknown> };
  if (!result.document) throw new Error("E2E signer returned no signed document");
  return result.document;
}

function unsignedCredential(options: {
  appUrl: string;
  publicId: string;
  statusListUrl: string;
  statusIndex: number;
  issuerUrl: string;
  validUntil?: string;
}) {
  const credentialUrl = `${options.appUrl}/credentials/${options.publicId}`;
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
    ],
    id: credentialUrl,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: "Phase 8 Signed Badge",
    issuer: {
      id: options.issuerUrl,
      type: ["Profile"],
      name: "HAU School of Computing",
      image: { id: `${options.appUrl}/images/hausoclogo.png`, type: "Image" },
    },
    validFrom: "2026-08-25T08:00:00.000Z",
    ...(options.validUntil ? { validUntil: options.validUntil } : {}),
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject",
          identityHash: `sha256$${"a".repeat(64)}`,
          identityType: "emailAddress",
          hashed: true,
        },
      ],
      achievement: {
        id: `${options.appUrl}/achievements/${options.publicId.toLowerCase()}`,
        type: ["Achievement"],
        name: "Phase 8 Signed Badge",
        description: "A disposable signed browser-regression credential.",
        criteria: { narrative: "Complete the Phase 8 conformance activity." },
        image: { id: `${options.appUrl}/images/hausoclogo.png`, type: "Image" },
        tag: ["Open Badges"],
      },
    },
    credentialStatus: {
      id: `${options.statusListUrl}#${options.statusIndex}`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: String(options.statusIndex),
      statusListCredential: options.statusListUrl,
    },
    credentialSchema: [
      {
        id: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
        type: "1EdTechJsonSchemaValidator2019",
      },
    ],
  };
}

function connect(urlValue: string) {
  const url = new URL(urlValue);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      // The disposable reset toggles a session-scoped MariaDB setting, so setup intentionally
      // uses one connection. The application under test has its own pool.
      connectionLimit: 1,
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
    imagePath: "images/hausoclogo.png",
    image: { id: `${appUrl}/images/hausoclogo.png`, type: "Image" },
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
  const signerFixture = JSON.parse(
    await readFile(resolve(process.cwd(), ".playwright-e2e-signer.json"), "utf8"),
  ) as SignerFixture;
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
    signingKey: `${prefix}signing-key`,
    retiredSigningKey: `${prefix}signing-key-retired`,
    compromisedSigningKey: `${prefix}signing-key-compromised`,
    statusList: `${prefix}status-list`,
    signedDesktop: `${prefix}signed-desktop`,
    signedMobile: `${prefix}signed-mobile`,
    signedExpired: `${prefix}signed-expired`,
    signedTampered: `${prefix}signed-tampered`,
    signedOriginal: `${prefix}signed-original`,
    signedReplacement: `${prefix}signed-replacement`,
    badgeSigned: `${prefix}badge-signed`,
    badgeLiveIndividualDesktop: `${prefix}badge-live-individual-desktop`,
    badgeLiveIndividualMobile: `${prefix}badge-live-individual-mobile`,
    badgeLiveBatchDesktop: `${prefix}badge-live-batch-desktop`,
    badgeLiveBatchMobile: `${prefix}badge-live-batch-mobile`,
    badgeOutageDesktop: `${prefix}badge-outage-desktop`,
    badgeOutageMobile: `${prefix}badge-outage-mobile`,
  };
  const tables = await prisma.$queryRawUnsafe<Array<Record<string, string>>>("SHOW TABLES");
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const row of tables) {
      const table = Object.values(row)[0];
      if (
        table &&
        table !== "_prisma_migrations" &&
        table !== "credential_replacement_guards" &&
        /^[A-Za-z0-9_]+$/.test(table)
      ) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
      }
    }
  } finally {
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  }
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
      ids.badgeSigned,
      ids.badgeLiveIndividualDesktop,
      ids.badgeLiveIndividualMobile,
      ids.badgeLiveBatchDesktop,
      ids.badgeLiveBatchMobile,
      ids.badgeOutageDesktop,
      ids.badgeOutageMobile,
    ].map((id) => ({
      id,
      classId: ids.class,
      ownerUserId: ids.faculty,
      name:
        id === ids.badgeLiveIndividualDesktop
          ? "Phase 8 Individual Desktop Badge"
          : id === ids.badgeLiveIndividualMobile
            ? "Phase 8 Individual Mobile Badge"
            : id === ids.badgeLiveBatchDesktop
              ? "Phase 8 Batch Desktop Badge"
              : id === ids.badgeLiveBatchMobile
                ? "Phase 8 Batch Mobile Badge"
                : id === ids.badgeOutageDesktop
                  ? "Phase 8 Outage Desktop Badge"
                  : id === ids.badgeOutageMobile
                    ? "Phase 8 Outage Mobile Badge"
                    : id === ids.badgeSigned
                      ? "Phase 8 Signed Badge"
                      : "Phase 6 E2E Badge",
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

  const statusListUrl = `${signerFixture.appUrl}/api/status-lists/${ids.statusList}`;
  await prisma.signingKey.create({
    data: {
      id: ids.signingKey,
      verificationMethodUrl: signerFixture.keyId,
      controllerUrl: signerFixture.issuerUrl,
      algorithm: "Ed25519",
      cryptosuite: "eddsa-rdfc-2022",
      publicMultikey: signerFixture.publicKeyMultibase,
      fingerprint: signerFixture.fingerprint,
      status: "ACTIVE",
      activatedAt: new Date("2026-08-25T07:00:00.000Z"),
    },
  });
  await prisma.signingKey.createMany({
    data: [
      {
        id: ids.retiredSigningKey,
        verificationMethodUrl: `${signerFixture.issuerUrl}/keys/retired-e2e`,
        controllerUrl: signerFixture.issuerUrl,
        algorithm: "Ed25519",
        cryptosuite: "eddsa-rdfc-2022",
        publicMultikey: signerFixture.publicKeyMultibase,
        fingerprint: `${signerFixture.fingerprint}-retired-e2e`,
        status: "RETIRED",
        activatedAt: new Date("2026-08-20T07:00:00.000Z"),
        retiredAt: new Date("2026-08-24T07:00:00.000Z"),
      },
      {
        id: ids.compromisedSigningKey,
        verificationMethodUrl: `${signerFixture.issuerUrl}/keys/compromised-e2e`,
        controllerUrl: signerFixture.issuerUrl,
        algorithm: "Ed25519",
        cryptosuite: "eddsa-rdfc-2022",
        publicMultikey: signerFixture.publicKeyMultibase,
        fingerprint: `${signerFixture.fingerprint}-compromised-e2e`,
        status: "COMPROMISED",
        activatedAt: new Date("2026-08-18T07:00:00.000Z"),
        compromisedAt: new Date("2026-08-19T07:00:00.000Z"),
      },
    ],
  });
  const statusDocument = await signDocument(
    {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: statusListUrl,
      type: ["VerifiableCredential", "BitstringStatusListCredential"],
      issuer: signerFixture.issuerUrl,
      validFrom: "2026-08-25T08:00:00.000Z",
      credentialSubject: {
        id: `${statusListUrl}#list`,
        type: "BitstringStatusList",
        statusPurpose: "revocation",
        encodedList: emptyRevocationList(),
      },
    },
    signerFixture.signerToken,
  );
  const statusBody = JSON.stringify(statusDocument);
  await prisma.credentialStatusList.create({
    data: {
      id: ids.statusList,
      publicUrl: statusListUrl,
      capacity: 131_072,
      nextIndex: 8,
      signedCredentialJson: jsonValue(statusDocument),
      version: 0,
      digest: createHash("sha256").update(statusBody).digest("hex"),
      signingKeyId: ids.signingKey,
    },
  });

  const signedDefinitions = [
    [ids.signedDesktop, signedDesktopPublicId, 0, null],
    [ids.signedMobile, signedMobilePublicId, 1, null],
    [ids.signedExpired, signedExpiredPublicId, 2, new Date("2026-08-26T00:00:00.000Z")],
    [ids.signedTampered, signedTamperedPublicId, 3, null],
    [ids.signedOriginal, signedOriginalPublicId, 4, null],
    [ids.signedReplacement, signedReplacementPublicId, 5, null],
  ] as const;
  for (const [id, publicId, index, expiresAt] of signedDefinitions) {
    const legacy = snapshots(publicId, signerFixture.appUrl, ids.badgeSigned);
    legacy.achievement.name = "Phase 8 Signed Badge";
    legacy.achievement.description = "A disposable signed browser-regression credential.";
    legacy.issuer.name = "HAU School of Computing";
    legacy.issuer.url = signerFixture.issuerUrl;
    const unsigned = unsignedCredential({
      appUrl: signerFixture.appUrl,
      publicId,
      statusListUrl,
      statusIndex: index,
      issuerUrl: signerFixture.issuerUrl,
      ...(expiresAt ? { validUntil: expiresAt.toISOString() } : {}),
    });
    const signed = await signDocument(unsigned, signerFixture.signerToken);
    const storedSigned =
      id === ids.signedTampered ? { ...signed, name: "Tampered after signing" } : signed;
    await prisma.badgeIssuance.create({
      data: {
        id,
        publicId,
        classId: ids.class,
        badgeTemplateId: ids.badgeSigned,
        studentId: ids.student,
        issuerUserId: ids.faculty,
        status: "ACTIVE",
        issuedAt: new Date("2026-08-25T08:00:00.000Z"),
        expiresAt,
        recipientSnapshotJson: legacy.recipient,
        achievementSnapshotJson: legacy.achievement,
        issuerSnapshotJson: legacy.issuer,
        credentialJson: legacy.credential,
        signedCredentialJson: jsonValue(storedSigned),
        signingKeyId: ids.signingKey,
        serializerVersion: 2,
        snapshotVersion: 1,
      },
    });
    await prisma.credentialStatusAllocation.create({
      data: {
        id: `${prefix}allocation-${index}`,
        issuanceId: id,
        statusListId: ids.statusList,
        index,
        statusListVersion: 0,
      },
    });
  }
  await prisma.credentialStatusAllocation.createMany({
    data: [
      {
        id: `${prefix}allocation-legacy-desktop`,
        issuanceId: ids.desktopRevocable,
        statusListId: ids.statusList,
        index: 6,
        statusListVersion: 0,
      },
      {
        id: `${prefix}allocation-legacy-mobile`,
        issuanceId: ids.mobileRevocable,
        statusListId: ids.statusList,
        index: 7,
        statusListVersion: 0,
      },
    ],
  });
  await prisma.badgeIssuance.update({
    where: { id: ids.signedOriginal },
    data: { supersededById: ids.signedReplacement },
  });
  await prisma.badgeIssuance.update({
    where: { id: ids.signedReplacement },
    data: { supersedesId: ids.signedOriginal },
  });
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
      issuerUrl: signerFixture.issuerUrl,
      issuerLogoPath: "/images/hausoclogo.png",
      supportContact: null,
      sharingEnabled: true,
    },
    update: {
      issuerName: "E2E Issuer",
      issuerUrl: signerFixture.issuerUrl,
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
    E2E_SIGNED_DESKTOP_PUBLIC_ID: signedDesktopPublicId,
    E2E_SIGNED_MOBILE_PUBLIC_ID: signedMobilePublicId,
    E2E_SIGNED_EXPIRED_PUBLIC_ID: signedExpiredPublicId,
    E2E_SIGNED_TAMPERED_PUBLIC_ID: signedTamperedPublicId,
    E2E_SIGNED_ORIGINAL_PUBLIC_ID: signedOriginalPublicId,
    E2E_SIGNED_REPLACEMENT_PUBLIC_ID: signedReplacementPublicId,
    E2E_SIGNED_DESKTOP_ISSUANCE_ID: ids.signedDesktop,
    E2E_SIGNED_MOBILE_ISSUANCE_ID: ids.signedMobile,
    E2E_SIGNER_CONTROL_TOKEN: signerFixture.signerControlToken,
    E2E_SIGNING_KEY_ID: ids.signingKey,
    E2E_CLASS_ID: ids.class,
  };
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  return async () => {
    await unlink(fixturePath).catch((error: unknown) => {
      if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
    });
    await prisma.$disconnect();
  };
}
