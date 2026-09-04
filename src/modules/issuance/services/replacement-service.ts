import "server-only";

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { enqueueIssuedNotification } from "@/modules/notifications/services/notification-outbox";
import { buildOpenBadgeCredential } from "@/modules/open-badges/credential-builder";
import { SignedOpenBadgeCredentialSchema } from "@/modules/open-badges/credential-schema";
import { signCredential, verifyCredential } from "@/modules/signing/signer-client";
import { prisma } from "@/platform/db/prisma";

import { generatePublicId } from "./credential-snapshot";
import { reserveUnassignedStatusAllocation } from "./status-allocation-service";
import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
  OpenBadgeCredentialSnapshotSchema,
  RecipientSnapshotSchema,
} from "./snapshot-schemas";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const inputSchema = z.object({ originalIssuanceId: identifier, actorId: identifier }).strict();
const maximumCommitAttempts = 3;
const replacementTestHookKey = Symbol.for("hau-soc-badging.replacement-test-hooks");

export class ReplacementUnavailableError extends Error {
  constructor(message = "Credential replacement is unavailable") {
    super(message);
    this.name = "ReplacementUnavailableError";
  }
}

type ReplacementInput = { originalIssuanceId: string; actorId: string };
type Original = {
  id: string;
  publicId: string;
  classId: string;
  badgeTemplateId: string;
  studentId: string;
  issuerUserId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: Date;
  expiresAt: Date | null;
  supersededById: string | null;
  recipientSnapshotJson: Prisma.JsonValue;
  achievementSnapshotJson: Prisma.JsonValue;
  issuerSnapshotJson: Prisma.JsonValue;
  credentialJson: Prisma.JsonValue;
};
type CurrentAdmin = {
  id: string;
  role: "ADMIN" | "FACULTY";
  status: string;
  deletedAt: Date | null;
};
type LockedSigningKey = {
  id: string;
  verificationMethodUrl: string;
  controllerUrl: string;
  algorithm: string;
  cryptosuite: string;
  publicMultikey: string;
  status: "ACTIVE" | "RETIRED" | "COMPROMISED";
  compromisedAt: Date | null;
};
type ReplacementTestHooks = {
  afterSigningKeyValidation?: (tx: Prisma.TransactionClient) => Promise<void>;
};

function testHooks(): ReplacementTestHooks | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (globalThis as typeof globalThis & { [key: symbol]: unknown })[replacementTestHookKey] as
    ReplacementTestHooks | undefined;
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

function publicCredentialId(
  originalId: string,
  originalPublicId: string,
  publicId: string,
): string {
  if (!originalId.includes(encodeURIComponent(originalPublicId)))
    throw new ReplacementUnavailableError();
  return originalId.replace(encodeURIComponent(originalPublicId), encodeURIComponent(publicId));
}

function validAdmin(actor: CurrentAdmin | undefined, actorId: string) {
  if (
    !actor ||
    actor.id !== actorId ||
    actor.role !== "ADMIN" ||
    actor.status !== "ACTIVE" ||
    actor.deletedAt
  ) {
    throw new AuthorizationError("Administrator account is no longer active");
  }
}

async function loadOriginal(id: string): Promise<Original> {
  const original = await prisma.badgeIssuance.findUnique({
    where: { id },
    select: {
      id: true,
      publicId: true,
      classId: true,
      badgeTemplateId: true,
      studentId: true,
      issuerUserId: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      supersededById: true,
      recipientSnapshotJson: true,
      achievementSnapshotJson: true,
      issuerSnapshotJson: true,
      credentialJson: true,
    },
  });
  if (!original) throw new ReplacementUnavailableError();
  return original;
}

export async function createSignedReplacement(
  raw: ReplacementInput,
): Promise<{ replacementId: string; publicId: string }> {
  const input = inputSchema.parse(raw);
  const administrator = await prisma.user.findUnique({
    where: { id: input.actorId },
    select: { id: true, role: true, status: true, deletedAt: true },
  });
  validAdmin(administrator ?? undefined, input.actorId);
  const original = await loadOriginal(input.originalIssuanceId);
  if (original.supersededById) {
    const existing = await prisma.badgeIssuance.findUnique({
      where: { id: original.supersededById },
      select: { id: true, publicId: true },
    });
    if (existing) return { replacementId: existing.id, publicId: existing.publicId };
  }
  // Safe policy: a revoked historical credential remains terminal; creating an active successor
  // requires a separately approved policy, rather than silently reactivating it.
  if (original.status !== "ACTIVE" || (original.expiresAt && original.expiresAt <= new Date()))
    throw new ReplacementUnavailableError("Only active, unexpired credentials can be replaced");
  const [key] = await Promise.all([
    prisma.signingKey.findFirst({
      where: { status: "ACTIVE", compromisedAt: null },
      select: {
        id: true,
        verificationMethodUrl: true,
        controllerUrl: true,
        algorithm: true,
        cryptosuite: true,
        publicMultikey: true,
        status: true,
        compromisedAt: true,
      },
    }),
  ]);
  if (!key || key.algorithm !== "Ed25519" || key.cryptosuite !== "eddsa-rdfc-2022")
    throw new ReplacementUnavailableError();
  const recipient = RecipientSnapshotSchema.parse(original.recipientSnapshotJson);
  const achievement = AchievementSnapshotSchema.parse(original.achievementSnapshotJson);
  const issuer = IssuerSnapshotSchema.parse(original.issuerSnapshotJson);
  const credential = OpenBadgeCredentialSnapshotSchema.parse(original.credentialJson);
  const publicId = generatePublicId();
  const replacementCredential = {
    ...credential,
    id: publicCredentialId(credential.id, original.publicId, publicId),
  };
  const reservation = await prisma.$transaction((tx) => reserveUnassignedStatusAllocation(tx));
  const unsigned = buildOpenBadgeCredential({
    snapshot: replacementCredential,
    recipientEmail: recipient.email,
    signingKey: key,
    statusAllocation: reservation,
  });
  const correlationId = randomUUID();
  const signed = SignedOpenBadgeCredentialSchema.parse(
    await signCredential(unsigned, correlationId),
  );
  const { proof, ...payload } = signed;
  if (
    !isDeepStrictEqual(payload, unsigned) ||
    proof.verificationMethod !== key.verificationMethodUrl
  )
    throw new ReplacementUnavailableError();
  const verified = await verifyCredential(signed, correlationId);
  if (verified.outcome !== "VERIFIED" || verified.keyId !== key.verificationMethodUrl)
    throw new ReplacementUnavailableError();

  for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Shared commit lock order: actor -> issuance -> status list -> active-key range -> exact
        // key -> allocation. The status-list/key suffix matches signed issuance regeneration, while
        // the active-range/exact-key suffix matches activation and prevents lifecycle interleaving.
        const [current] = await tx.$queryRaw<CurrentAdmin[]>(
          Prisma.sql`SELECT id, role, status, deleted_at AS deletedAt FROM users WHERE id = ${input.actorId} FOR UPDATE`,
        );
        validAdmin(current, input.actorId);
        const [locked] = await tx.$queryRaw<Original[]>(
          Prisma.sql`SELECT id, public_id AS publicId, class_id AS classId, badge_template_id AS badgeTemplateId, student_id AS studentId, issuer_user_id AS issuerUserId, status, issued_at AS issuedAt, expires_at AS expiresAt, superseded_by_id AS supersededById, recipient_snapshot_json AS recipientSnapshotJson, achievement_snapshot_json AS achievementSnapshotJson, issuer_snapshot_json AS issuerSnapshotJson, credential_json AS credentialJson FROM badge_issuances WHERE id = ${original.id} FOR UPDATE`,
        );
        if (
          !locked ||
          locked.status !== "ACTIVE" ||
          (locked.expiresAt && locked.expiresAt <= new Date())
        )
          throw new ReplacementUnavailableError(
            "Only active, unexpired credentials can be replaced",
          );
        if (locked.supersededById) {
          const existing = await tx.badgeIssuance.findUnique({
            where: { id: locked.supersededById },
            select: { id: true, publicId: true },
          });
          if (!existing) throw new ReplacementUnavailableError();
          return { replacementId: existing.id, publicId: existing.publicId };
        }
        const [statusList] = await tx.$queryRaw<
          Array<{
            id: string;
            publicUrl: string;
            purpose: string;
            capacity: number;
            nextIndex: number;
          }>
        >(
          Prisma.sql`SELECT id, public_url AS publicUrl, purpose, capacity, next_index AS nextIndex FROM credential_status_lists WHERE id = ${reservation.listId} FOR UPDATE`,
        );
        if (
          !statusList ||
          statusList.publicUrl !== reservation.statusUrl ||
          statusList.purpose !== "revocation" ||
          reservation.index < 0 ||
          reservation.index >= statusList.capacity ||
          reservation.index >= statusList.nextIndex
        )
          throw new ReplacementUnavailableError();

        const activeKeys = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id
          FROM signing_keys
          WHERE status = 'ACTIVE' AND compromised_at IS NULL
          ORDER BY activated_at DESC, id ASC
          LIMIT 2
          FOR UPDATE
        `);
        const [lockedKey] = await tx.$queryRaw<LockedSigningKey[]>(Prisma.sql`
          SELECT id, verification_method_url AS verificationMethodUrl,
            controller_url AS controllerUrl, algorithm, cryptosuite,
            public_multikey AS publicMultikey, status, compromised_at AS compromisedAt
          FROM signing_keys
          WHERE id = ${key.id}
          FOR UPDATE
        `);
        if (
          activeKeys.length !== 1 ||
          activeKeys[0]?.id !== key.id ||
          !lockedKey ||
          lockedKey.id !== key.id ||
          lockedKey.verificationMethodUrl !== key.verificationMethodUrl ||
          lockedKey.controllerUrl !== key.controllerUrl ||
          lockedKey.cryptosuite !== key.cryptosuite ||
          lockedKey.algorithm !== key.algorithm ||
          lockedKey.publicMultikey !== key.publicMultikey ||
          lockedKey.status !== "ACTIVE" ||
          lockedKey.compromisedAt !== null
        )
          throw new ReplacementUnavailableError();

        await testHooks()?.afterSigningKeyValidation?.(tx);

        const occupied = await tx.credentialStatusAllocation.findUnique({
          where: {
            statusListId_index: { statusListId: reservation.listId, index: reservation.index },
          },
          select: { id: true },
        });
        if (occupied) throw new ReplacementUnavailableError();
        const created = await tx.badgeIssuance.create({
          data: {
            classId: locked.classId,
            badgeTemplateId: locked.badgeTemplateId,
            studentId: locked.studentId,
            issuerUserId: locked.issuerUserId,
            publicId,
            issuedAt: locked.issuedAt,
            expiresAt: locked.expiresAt,
            status: "ACTIVE",
            recipientSnapshotJson: recipient as Prisma.InputJsonValue,
            achievementSnapshotJson: achievement as Prisma.InputJsonValue,
            issuerSnapshotJson: issuer as Prisma.InputJsonValue,
            credentialJson: replacementCredential as Prisma.InputJsonValue,
            signedCredentialJson: signed as Prisma.InputJsonValue,
            signingKeyId: key.id,
            serializerVersion: 1,
            supersedesId: locked.id,
          },
          select: { id: true, publicId: true },
        });
        await tx.badgeIssuance.update({
          where: { id: locked.id },
          data: { supersededById: created.id },
        });
        await tx.credentialStatusAllocation.create({
          data: {
            issuanceId: created.id,
            statusListId: reservation.listId,
            index: reservation.index,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: input.actorId,
            action: "badge.replaced",
            entityType: "BadgeIssuance",
            entityId: created.id,
            contextJson: {
              originalIssuanceId: locked.id,
              replacementId: created.id,
              originalPublicId: locked.publicId,
              publicId: created.publicId,
              signingKeyId: key.id,
              statusListId: reservation.listId,
              statusListIndex: reservation.index,
            },
          },
        });
        await enqueueIssuedNotification(tx, {
          issuanceId: created.id,
          recipientEmail: recipient.email,
          recipientFirstName: recipient.firstName,
          badgeName: achievement.name,
          issuerName: issuer.name,
          verificationUrl: signed.id,
          occurredAt: locked.issuedAt,
        });
        return { replacementId: created.id, publicId: created.publicId };
      });
    } catch (error) {
      if (!isRetryableMariaDbTransactionError(error)) throw error;
      if (attempt + 1 >= maximumCommitAttempts) throw new ReplacementUnavailableError();
    }
  }
  throw new ReplacementUnavailableError();
}
