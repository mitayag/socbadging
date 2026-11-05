import "server-only";

import { Prisma, type RecipientSuppressionReason } from "@prisma/client";
import { z } from "zod";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import {
  RecipientSuppressionError,
  lockSuppression,
  normalizeRecipientEmail,
  type RecipientSuppressionSummary,
} from "./recipient-suppression-core";

export * from "./recipient-suppression-core";

export async function listActiveSuppressions(
  actor: Actor | null | undefined,
): Promise<RecipientSuppressionSummary[]> {
  const administrator = requireRole(actor, "ADMIN");
  const current = await requireActiveAdministrator(administrator.id);

  const rows = await current.recipientSuppression.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ suppressedAt: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      normalizedEmail: true,
      recipientEmail: true,
      reason: true,
      provider: true,
      providerEventId: true,
      sourceDeliveryId: true,
      suppressedAt: true,
      updatedAt: true,
      clearedAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    suppressedAt: row.suppressedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    clearedAt: row.clearedAt?.toISOString() ?? null,
  }));
}

const unsuppressInputSchema = z
  .object({
    normalizedEmail: z.email().transform((value) => normalizeRecipientEmail(value)),
    reason: z.string().trim().min(5).max(1000),
    acknowledgeComplaint: z.boolean().default(false),
  })
  .strict();

export async function unsuppressRecipient(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<{ id: string; previousReason: RecipientSuppressionReason }> {
  const administrator = requireRole(actor, "ADMIN");
  const input = unsuppressInputSchema.parse(rawInput);

  return prismaTransaction(async (tx) => {
    const [currentActor] = await tx.$queryRaw<
      Array<{ id: string; role: string; status: string; deletedAt: Date | null }>
    >(Prisma.sql`
      SELECT id, role, status, deleted_at AS deletedAt
      FROM users
      WHERE id = ${administrator.id}
      FOR UPDATE
    `);
    if (
      !currentActor ||
      currentActor.role !== "ADMIN" ||
      currentActor.status !== "ACTIVE" ||
      currentActor.deletedAt !== null
    ) {
      throw new AuthorizationError("Active Administrator account required");
    }

    const existing = await lockSuppression(tx, input.normalizedEmail);
    if (!existing || existing.status !== "ACTIVE") {
      throw new RecipientSuppressionError("No active suppression exists for this recipient");
    }
    if (existing.reason === "COMPLAINT" && !input.acknowledgeComplaint) {
      throw new RecipientSuppressionError(
        "Complaint suppression requires explicit Administrator acknowledgement",
      );
    }

    const clearedAt = new Date();
    await tx.recipientSuppression.update({
      where: { id: existing.id },
      data: {
        status: "CLEARED",
        clearedAt,
        clearedByUserId: administrator.id,
        clearReason: input.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "notification.recipient_suppression_cleared",
        entityType: "RecipientSuppression",
        entityId: existing.id,
        contextJson: {
          normalizedEmail: input.normalizedEmail,
          previousReason: existing.reason,
          reasonLength: input.reason.length,
          complaintAcknowledged: input.acknowledgeComplaint,
          clearedAt: clearedAt.toISOString(),
        },
      },
    });
    return { id: existing.id, previousReason: existing.reason };
  });
}

async function requireActiveAdministrator(actorId: string) {
  const current = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true, status: true, deletedAt: true },
  });
  if (!current || current.role !== "ADMIN" || current.status !== "ACTIVE" || current.deletedAt) {
    throw new AuthorizationError("Active Administrator account required");
  }
  return prisma;
}

function prismaTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback);
}
