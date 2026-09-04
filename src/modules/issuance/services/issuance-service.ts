import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type { IssuanceResult } from "@/modules/issuance/types";
import { enqueueIssuedNotification } from "@/modules/notifications/services/notification-outbox";
import { getIssuerPresentation } from "@/modules/settings/services/system-settings-service";

import {
  buildCredentialSnapshots,
  calculateExpiresAt,
  generatePublicId,
} from "./credential-snapshot";
import {
  issueSignedBadge,
  issueSignedBadgeForTest,
  type SignedIssuanceSigner,
} from "./signed-issuance-service";

const issueBadgeInputSchema = z.object({
  classId: z.string().trim().min(1),
  badgeTemplateId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
});

const maximumPublicIdAttempts = 3;

type BadgeMetadata = {
  skills: string[];
  alignment?: Array<{ targetName: string; targetUrl: string }>;
};

export type LoadedIssuanceClass = {
  id: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
  courseCode: string;
  title: string;
  section: string;
  term: string;
  academicYear: string;
};

export type LoadedIssuanceBadgeTemplate = {
  id: string;
  classId: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
  name: string;
  description: string;
  criteria: string;
  imagePath: string;
  metadataJson: Prisma.JsonValue | null;
  expiresAfterDays: number | null;
  updatedAt: Date;
};

export type LoadedIssuanceStudent = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type LoadedIssuanceEnrollment = {
  classId: string;
  studentId: string;
  enrollmentStatus: "ACTIVE" | "REMOVED";
};

export type LoadedIssuanceIssuer = {
  id: string;
  name: string;
  role: "FACULTY" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
};

export type CreateBadgeIssuanceInTransactionInput = {
  tx: Prisma.TransactionClient;
  classRecord: LoadedIssuanceClass;
  badgeTemplate: LoadedIssuanceBadgeTemplate;
  student: LoadedIssuanceStudent;
  enrollment: LoadedIssuanceEnrollment;
  issuer: LoadedIssuanceIssuer;
  issuerPresentation?: {
    issuerName: string;
    issuerUrl: string;
    issuerLogoPath: string;
  };
  issuedAt: Date;
};

const issuerSettingSelect = {
  issuerName: true,
  issuerUrl: true,
  issuerLogoPath: true,
  supportContact: true,
  sharingEnabled: true,
} as const;

/**
 * Reads the typed singleton inside the issuance transaction. Existing snapshots are never read or
 * changed here; the current presentation is used only while creating a new immutable snapshot.
 */
export async function getIssuerPresentationForTransaction(tx: Prisma.TransactionClient) {
  const setting = await tx.systemSetting.findUnique({
    where: { id: "default" },
    select: issuerSettingSelect,
  });
  return getIssuerPresentation(setting);
}

function readBadgeMetadata(value: Prisma.JsonValue | null): BadgeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { skills: [] };

  const metadata = value as { skills?: unknown; alignment?: unknown };
  const skills = Array.isArray(metadata.skills)
    ? metadata.skills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const alignmentSource = Array.isArray(metadata.alignment)
    ? metadata.alignment
    : metadata.alignment
      ? [metadata.alignment]
      : [];
  const alignment = alignmentSource.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as {
      name?: unknown;
      targetName?: unknown;
      targetUrl?: unknown;
      url?: unknown;
    };
    const targetName =
      typeof candidate.targetName === "string" ? candidate.targetName : candidate.name;
    const targetUrl = typeof candidate.targetUrl === "string" ? candidate.targetUrl : candidate.url;
    return typeof targetName === "string" && typeof targetUrl === "string"
      ? [{ targetName, targetUrl }]
      : [];
  });

  return alignment.length ? { skills, alignment } : { skills };
}

function hasExactP2002Target(
  error: unknown,
  allowedTargets: readonly (readonly string[] | string)[],
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { index?: unknown } } };
    };
  };
  if (candidate.code !== "P2002") return false;

  const matches = (target: unknown) =>
    allowedTargets.some((allowed) => {
      if (typeof allowed === "string") return target === allowed;
      if (!Array.isArray(target) || target.length !== allowed.length) return false;
      return target.every((field, index) => field === allowed[index]);
    });

  return (
    matches(candidate.meta?.target) ||
    matches(candidate.meta?.driverAdapterError?.cause?.constraint?.index)
  );
}

function isPublicIdUniqueConflict(error: unknown): boolean {
  return hasExactP2002Target(error, [
    ["publicId"],
    ["public_id"],
    "BadgeIssuance_publicId_key",
    "public_id",
    "badge_issuances_public_id_key",
  ]);
}

/**
 * Creates one immutable credential and its identifier-only audit inside the caller's transaction.
 * Authorization and current-state validation deliberately remain the caller's responsibility.
 */
export async function createBadgeIssuanceInTransaction(
  input: CreateBadgeIssuanceInTransactionInput,
): Promise<{ issuanceId: string; publicId: string }> {
  const expiresAt = calculateExpiresAt(input.issuedAt, input.badgeTemplate.expiresAfterDays);
  const metadata = readBadgeMetadata(input.badgeTemplate.metadataJson);
  let publicIdCollision: unknown;

  for (let attempt = 0; attempt < maximumPublicIdAttempts; attempt += 1) {
    const publicId = generatePublicId();
    const snapshots = buildCredentialSnapshots({
      publicId,
      issuedAt: input.issuedAt,
      expiresAt,
      recipient: {
        studentId: input.student.id,
        studentNumber: input.student.studentNumber,
        displayName: `${input.student.firstName} ${input.student.lastName}`,
        firstName: input.student.firstName,
        lastName: input.student.lastName,
        email: input.student.email,
      },
      achievement: {
        badgeTemplateId: input.badgeTemplate.id,
        name: input.badgeTemplate.name,
        description: input.badgeTemplate.description,
        criteria: input.badgeTemplate.criteria,
        imagePath: input.badgeTemplate.imagePath,
        skills: metadata.skills,
        ...(metadata.alignment ? { alignment: metadata.alignment } : {}),
        templateUpdatedAt: input.badgeTemplate.updatedAt,
        class: {
          id: input.classRecord.id,
          courseCode: input.classRecord.courseCode,
          title: input.classRecord.title,
          section: input.classRecord.section,
          term: input.classRecord.term,
          academicYear: input.classRecord.academicYear,
        },
        expiresAfterDays: input.badgeTemplate.expiresAfterDays,
      },
      issuer: { issuerUserId: input.issuer.id, issuerUserName: input.issuer.name },
      ...(input.issuerPresentation ? { issuerPresentation: input.issuerPresentation } : {}),
    });

    try {
      const created = await input.tx.badgeIssuance.create({
        data: {
          classId: input.classRecord.id,
          badgeTemplateId: input.badgeTemplate.id,
          studentId: input.enrollment.studentId,
          issuerUserId: input.issuer.id,
          status: "ACTIVE",
          publicId,
          issuedAt: input.issuedAt,
          expiresAt,
          recipientSnapshotJson: snapshots.recipient,
          achievementSnapshotJson: snapshots.achievement,
          issuerSnapshotJson: snapshots.issuer,
          credentialJson: snapshots.credential,
          snapshotVersion: 1,
        },
        select: { id: true, publicId: true },
      });

      await input.tx.auditLog.create({
        data: {
          actorUserId: input.issuer.id,
          action: "badge.issued",
          entityType: "BadgeIssuance",
          entityId: created.id,
          contextJson: {
            classId: input.classRecord.id,
            badgeTemplateId: input.badgeTemplate.id,
            studentId: input.enrollment.studentId,
            issuanceId: created.id,
            publicId: created.publicId,
          },
        },
      });

      await enqueueIssuedNotification(input.tx, {
        issuanceId: created.id,
        recipientEmail: snapshots.recipient.email,
        recipientFirstName: snapshots.recipient.firstName,
        badgeName: snapshots.achievement.name,
        issuerName: snapshots.issuer.name,
        verificationUrl: snapshots.credential.id,
        occurredAt: input.issuedAt,
      });

      return { issuanceId: created.id, publicId: created.publicId };
    } catch (error) {
      if (isPublicIdUniqueConflict(error) && attempt + 1 < maximumPublicIdAttempts) {
        publicIdCollision = error;
        continue;
      }
      throw error;
    }
  }

  throw publicIdCollision;
}

export async function issueBadge(
  actor: Actor,
  rawInput: { classId: string; badgeTemplateId: string; studentId: string },
): Promise<IssuanceResult> {
  const faculty = requireRole(actor, "FACULTY");
  const input = issueBadgeInputSchema.parse(rawInput);
  return issueSignedBadge(faculty, input);
}

export function issueBadgeForTest(
  actor: Actor,
  rawInput: { classId: string; badgeTemplateId: string; studentId: string },
  signer: SignedIssuanceSigner,
): Promise<IssuanceResult> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test signer injection is unavailable");
  const faculty = requireRole(actor, "FACULTY");
  const input = issueBadgeInputSchema.parse(rawInput);
  return issueSignedBadgeForTest(faculty, input, signer);
}
