import "server-only";

import { prisma } from "@/platform/db/prisma";
import type { AuthenticationRepository } from "../services/authenticate";

export const prismaAuthenticationRepository: AuthenticationRepository = {
  findByNormalizedEmail: (email) =>
    prisma.user.findUnique({
      where: { normalizedEmail: email },
      select: { id: true, name: true, email: true, passwordHash: true, role: true, status: true },
    }),
  recordSuccessfulLogin: async (userId) => {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          actorUserId: userId,
          action: "AUTH_LOGIN_SUCCEEDED",
          entityType: "User",
          entityId: userId,
        },
      }),
    ]);
  },
  recordLoginAttempt: async (_email, success) => {
    if (!success)
      await prisma.auditLog.create({
        data: { action: "AUTH_LOGIN_FAILED", entityType: "Authentication" },
      });
  },
};
