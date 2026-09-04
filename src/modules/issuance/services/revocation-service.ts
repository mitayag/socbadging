import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
} from "@/modules/identity/policies/authorization";
import type { Actor, Role } from "@/modules/identity/types";
import { enqueueRevokedNotification } from "@/modules/notifications/services/notification-outbox";
import { signCredential as signCredentialWithClient } from "@/modules/signing/signer-client";
import {
  lockCredentialStatusList,
  regenerateSignedStatusList,
  type StatusListSigner,
} from "@/modules/verification/services/status-list-service";
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
type StatusAllocationReference = { statusListId: string };
type LockedStatusAllocation = {
  issuanceId: string;
  statusListId: string;
  index: number;
  isRevoked: boolean;
};

type RevocationTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  beforeClassLock?: () => Promise<void>;
  beforeStatusListLock?: () => Promise<void>;
};

type RevocationResult = { issuanceId: string; publicId: string; alreadyRevoked: boolean };
type RevocationActionResult = RevocationResult & { classId: string };

const maximumRevocationAttempts = 3;
const defaultStatusListSigner: StatusListSigner = { signCredential: signCredentialWithClient };

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

function isRetryableMariaDbTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } };
    };
  };
  if (candidate.code === "P2034") return true;
  if (
    candidate.code === "P2039" &&
    typeof candidate.message === "string" &&
    /Database error\. Code: `(1020|1213)`\./.test(candidate.message)
  ) {
    return true;
  }
  if (candidate.code !== "P2010") return false;
  const databaseCode = String(
    candidate.meta?.code ??
      candidate.meta?.driverAdapterError?.cause?.originalCode ??
      candidate.meta?.driverAdapterError?.cause?.code,
  );
  return databaseCode === "1020" || databaseCode === "1213";
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
  signer: StatusListSigner,
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
  // Resolve the immutable parent association without locking the allocation, then lock the
  // parent before the allocation row. This matches status-list regeneration's lock order.
  const [allocationReference] = await authoritativeLockingRead(
    tx.$queryRaw<StatusAllocationReference[]>(Prisma.sql`
      SELECT status_list_id AS statusListId
      FROM credential_status_allocations
      WHERE issuance_id = ${issuance.id}
    `),
  );
  if (!allocationReference) throw new CredentialUnavailableError();
  await testHooks()?.beforeStatusListLock?.();
  await lockCredentialStatusList(tx, allocationReference.statusListId);
  const [allocation] = await authoritativeLockingRead(
    tx.$queryRaw<LockedStatusAllocation[]>(Prisma.sql`
      SELECT
        issuance_id AS issuanceId,
        status_list_id AS statusListId,
        \`index\`,
        is_revoked AS isRevoked
      FROM credential_status_allocations
      WHERE issuance_id = ${issuance.id}
      FOR UPDATE
    `),
  );
  if (!allocation || allocation.statusListId !== allocationReference.statusListId) {
    throw new CredentialUnavailableError();
  }

  const updated = await tx.badgeIssuance.update({
    where: { id: issuance.id },
    data: { status: "REVOKED", revocationReason: input.reason, revokedAt },
    select: { id: true, publicId: true },
  });
  await tx.credentialStatusAllocation.update({
    where: { issuanceId: allocation.issuanceId },
    data: { isRevoked: true, revokedAt },
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
  await regenerateSignedStatusList(tx, allocation.statusListId, signer);
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
  signer: StatusListSigner,
): Promise<RevocationActionResult> {
  const authorizedActor = requireRevocationRole(actor);
  const input = revocationInputSchema.parse(rawInput);
  for (let attempt = 0; attempt < maximumRevocationAttempts; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => revokeAttempt(tx, authorizedActor, input, signer));
    } catch (error) {
      if (!isRetryableMariaDbTransactionError(error) || attempt + 1 >= maximumRevocationAttempts) {
        throw error;
      }
    }
  }
  throw new CredentialUnavailableError();
}

export async function revokeCredential(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<RevocationResult> {
  const result = await revokeCredentialInternal(actor, rawInput, defaultStatusListSigner);
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
  return revokeCredentialInternal(actor, rawInput, defaultStatusListSigner);
}

export function revokeCredentialForTest(
  actor: Actor | null | undefined,
  rawInput: unknown,
  signer: StatusListSigner,
): Promise<RevocationResult> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test signer injection is unavailable");
  return revokeCredentialInternal(actor, rawInput, signer).then((result) => ({
    issuanceId: result.issuanceId,
    publicId: result.publicId,
    alreadyRevoked: result.alreadyRevoked,
  }));
}
