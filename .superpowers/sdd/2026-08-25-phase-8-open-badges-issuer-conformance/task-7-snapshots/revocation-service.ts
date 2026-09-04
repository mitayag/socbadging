import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
} from "@/modules/identity/policies/authorization";
import type { Actor, Role } from "@/modules/identity/types";
import { enqueueRevokedNotification } from "@/modules/notifications/services/notification-outbox";
import { prisma } from "@/platform/db/prisma";

import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
  OpenBadgeCredentialSnapshotSchema,
  RecipientSnapshotSchema,
} from "./snapshot-schemas";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const revocationReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value), {
    message: "Revocation reason contains control characters",
  });
const revocationInputSchema = z
  .object({ issuanceId: identifierSchema, reason: revocationReasonSchema })
  .strict();
const revocationTestHookKey = Symbol.for("hau-soc-badging.revocation-test-hooks");

type LockedActor = {
  id: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt: Date | null;
};

type LockedIssuance = {
  id: string;
  publicId: string;
  classId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: Date | null;
  revocationReason: string | null;
  revokedAt: Date | null;
  recipientSnapshotJson: Prisma.JsonValue;
  achievementSnapshotJson: Prisma.JsonValue;
  issuerSnapshotJson: Prisma.JsonValue;
  credentialJson: Prisma.JsonValue;
};

type LockedClass = { id: string; ownerUserId: string };

type RevocationTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeClassLock?: () => Promise<void>;
};

type RevocationResult = { issuanceId: string; publicId: string; alreadyRevoked: boolean };
type RevocationActionResult = RevocationResult & { classId: string };

export class CredentialUnavailableError extends AuthorizationError {
  constructor() {
    super("Credential is unavailable");
    this.name = "CredentialUnavailableError";
  }
}

function testHooks(): RevocationTestHooks | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (globalThis as typeof globalThis & { [revocationTestHookKey]?: RevocationTestHooks })[
    revocationTestHookKey
  ];
}

function requireRevocationRole(actor: Actor | null | undefined): Actor {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.role !== "ADMIN" && authenticated.role !== "FACULTY") {
    throw new AuthorizationError("Authorized role access required");
  }
  return authenticated;
}

function requireCurrentActor(actor: Actor, current: LockedActor | null): void {
  if (
    !current ||
    current.id !== actor.id ||
    current.role !== actor.role ||
    current.status !== "ACTIVE" ||
    current.deletedAt !== null
  ) {
    throw new AuthorizationError("Authorized account is no longer active");
  }
}

function isMariaDbRecordChangedSinceRead(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  return (
    candidate.code === "P2010" &&
    String(candidate.meta?.code ?? candidate.meta?.driverAdapterError?.cause?.originalCode) ===
      "1020"
  );
}

async function authoritativeLockingRead<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (isMariaDbRecordChangedSinceRead(error)) throw new CredentialUnavailableError();
    throw error;
  }
}

function reasonCategory(reason: string): "short" | "medium" | "long" {
  if (reason.length <= 100) return "short";
  if (reason.length <= 500) return "medium";
  return "long";
}

async function revokeAttempt(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: z.output<typeof revocationInputSchema>,
): Promise<RevocationActionResult> {
  await testHooks()?.beforeActorLock?.(tx);
  const [currentActor] = await authoritativeLockingRead(
    tx.$queryRaw<LockedActor[]>(Prisma.sql`
      SELECT id, role, status, deleted_at AS deletedAt
      FROM users
      WHERE id = ${actor.id}
      FOR UPDATE
    `),
  );
  requireCurrentActor(actor, currentActor ?? null);

  const [issuance] = await authoritativeLockingRead(
    tx.$queryRaw<LockedIssuance[]>(Prisma.sql`
      SELECT
        id,
        public_id AS publicId,
        class_id AS classId,
        status,
        expires_at AS expiresAt,
        revocation_reason AS revocationReason,
        revoked_at AS revokedAt,
        recipient_snapshot_json AS recipientSnapshotJson,
        achievement_snapshot_json AS achievementSnapshotJson,
        issuer_snapshot_json AS issuerSnapshotJson,
        credential_json AS credentialJson
      FROM badge_issuances
      WHERE id = ${input.issuanceId}
      FOR UPDATE
    `),
  );
  if (!issuance) throw new CredentialUnavailableError();

  await testHooks()?.beforeClassLock?.();
  const [classRecord] = await authoritativeLockingRead(
    tx.$queryRaw<LockedClass[]>(Prisma.sql`
      SELECT id, owner_user_id AS ownerUserId
      FROM classes
      WHERE id = ${issuance.classId}
      FOR UPDATE
    `),
  );
  if (!classRecord || (actor.role === "FACULTY" && classRecord.ownerUserId !== actor.id)) {
    throw new CredentialUnavailableError();
  }

  if (issuance.status === "REVOKED") {
    return {
      issuanceId: issuance.id,
      publicId: issuance.publicId,
      classId: classRecord.id,
      alreadyRevoked: true,
    };
  }

  const revokedAt = new Date();
  const updated = await tx.badgeIssuance.update({
    where: { id: issuance.id },
    data: { status: "REVOKED", revocationReason: input.reason, revokedAt },
    select: { id: true, publicId: true },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "badge.revoked",
      entityType: "BadgeIssuance",
      entityId: issuance.id,
      contextJson: {
        issuanceId: issuance.id,
        publicId: issuance.publicId,
        classId: issuance.classId,
        reasonLength: input.reason.length,
        reasonCategory: reasonCategory(input.reason),
      },
    },
  });
  const recipient = RecipientSnapshotSchema.parse(issuance.recipientSnapshotJson);
  const achievement = AchievementSnapshotSchema.parse(issuance.achievementSnapshotJson);
  const issuer = IssuerSnapshotSchema.parse(issuance.issuerSnapshotJson);
  const credential = OpenBadgeCredentialSnapshotSchema.parse(issuance.credentialJson);
  const settings = await tx.systemSetting.findUnique({
    where: { id: "default" },
    select: { supportContact: true },
  });
  await enqueueRevokedNotification(tx, {
    issuanceId: issuance.id,
    recipientEmail: recipient.email,
    recipientFirstName: recipient.firstName,
    badgeName: achievement.name,
    issuerName: issuer.name,
    verificationUrl: credential.id,
    occurredAt: revokedAt,
    ...(settings?.supportContact ? { supportContact: settings.supportContact } : {}),
  });
  return {
    issuanceId: updated.id,
    publicId: updated.publicId,
    classId: classRecord.id,
    alreadyRevoked: false,
  };
}

async function revokeCredentialInternal(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<RevocationActionResult> {
  const authorizedActor = requireRevocationRole(actor);
  const input = revocationInputSchema.parse(rawInput);
  return prisma.$transaction((tx) => revokeAttempt(tx, authorizedActor, input));
}

export async function revokeCredential(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<RevocationResult> {
  const result = await revokeCredentialInternal(actor, rawInput);
  return {
    issuanceId: result.issuanceId,
    publicId: result.publicId,
    alreadyRevoked: result.alreadyRevoked,
  };
}

export function revokeCredentialForAction(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<RevocationActionResult> {
  return revokeCredentialInternal(actor, rawInput);
}
