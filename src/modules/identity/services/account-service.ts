import "server-only";

import { hash, verify } from "argon2";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const nameSchema = z.object({
  name: z.string().trim().min(2).max(191),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(14).max(200),
});

export class AccountPasswordError extends Error {
  constructor(message = "Current password is invalid") {
    super(message);
    this.name = "AccountPasswordError";
  }
}

export async function updateOwnDisplayName(actor: Actor | null | undefined, raw: unknown) {
  const authenticated = requireAuthenticated(actor);
  const input = nameSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: authenticated.id, status: "ACTIVE", deletedAt: null },
      data: { name: input.name },
    });
    if (updated.count !== 1) throw new AuthorizationError("Account is no longer active");
    await tx.auditLog.create({
      data: {
        actorUserId: authenticated.id,
        action: "account.updated",
        entityType: "User",
        entityId: authenticated.id,
      },
    });
    return { name: input.name };
  });
}

export async function changeOwnPassword(actor: Actor | null | undefined, raw: unknown) {
  const authenticated = requireAuthenticated(actor);
  const input = passwordSchema.parse(raw);
  const user = await prisma.user.findFirst({
    where: { id: authenticated.id, status: "ACTIVE", deletedAt: null },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new AuthorizationError("Account is no longer active");
  const matches = await verify(user.passwordHash, input.currentPassword).catch(() => false);
  if (!matches) throw new AccountPasswordError();

  const passwordHash = await hash(input.newPassword, { type: 2 });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: authenticated.id, status: "ACTIVE", deletedAt: null },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AuthorizationError("Account is no longer active");
    await tx.session.deleteMany({ where: { userId: authenticated.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: authenticated.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: authenticated.id,
        action: "account.password_changed",
        entityType: "User",
        entityId: authenticated.id,
      },
    });
    return { changed: true };
  });
}
