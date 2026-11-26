import "server-only";

import { hash } from "argon2";
import { z } from "zod";

import { prisma } from "@/platform/db/prisma";

export const ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION = "administrator.password_reset";

const targetSchema = z.object({
  targetEmail: z.email().transform((value) => value.trim().toLowerCase()),
  targetUserId: z.string().trim().min(1).max(191),
});

const resetSchema = targetSchema.extend({
  newPassword: z.string().min(14).max(200),
  source: z.string().trim().min(1).max(100).default("operator-admin-reset"),
});

export class AdministratorPasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdministratorPasswordResetError";
  }
}

export type AdministratorPasswordResetTarget = {
  id: string;
  email: string;
  normalizedEmail: string;
  name: string;
  role: "ADMIN";
  status: "ACTIVE";
};

export type ResetAdministratorPasswordResult = {
  userId: string;
  email: string;
  sessionsInvalidated: number;
  auditAction: typeof ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION;
};

export async function findAdministratorPasswordResetTarget(raw: {
  targetEmail: string;
  targetUserId: string;
}): Promise<AdministratorPasswordResetTarget> {
  const input = targetSchema.parse(raw);
  const target = await prisma.user.findFirst({
    where: {
      id: input.targetUserId,
      normalizedEmail: input.targetEmail,
      role: "ADMIN",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      name: true,
      role: true,
      status: true,
    },
  });
  if (!target || target.role !== "ADMIN" || target.status !== "ACTIVE") {
    throw new AdministratorPasswordResetError(
      "Target active Administrator was not found; no account was changed",
    );
  }
  return {
    id: target.id,
    email: target.email,
    normalizedEmail: target.normalizedEmail,
    name: target.name,
    role: target.role,
    status: target.status,
  };
}

/**
 * Operator-only Administrator password reset. This is intentionally not exposed through the web
 * application: the caller must already have privileged production access. It preserves the account
 * identity and role, uses the same Argon2id parameters as the rest of the auth stack, invalidates all
 * existing sessions/reset tokens, and appends an audit record.
 */
export async function resetAdministratorPassword(raw: {
  targetEmail: string;
  targetUserId: string;
  newPassword: string;
  source?: string;
}): Promise<ResetAdministratorPasswordResult> {
  const input = resetSchema.parse(raw);
  const target = await findAdministratorPasswordResetTarget(input);
  const passwordHash = await hash(input.newPassword, { type: 2 });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: target.id,
        normalizedEmail: target.normalizedEmail,
        role: "ADMIN",
        status: "ACTIVE",
        deletedAt: null,
      },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new AdministratorPasswordResetError(
        "Target Administrator changed before the reset; no account was changed",
      );
    }

    const sessions = await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION,
        entityType: "User",
        entityId: target.id,
        contextJson: {
          source: input.source,
          targetEmail: target.email,
          sessionsInvalidated: sessions.count,
        },
      },
    });

    return {
      userId: target.id,
      email: target.email,
      sessionsInvalidated: sessions.count,
      auditAction: ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION,
    };
  });
}
