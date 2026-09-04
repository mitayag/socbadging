import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { bootstrapAdministrator } from "../src/modules/identity/services/bootstrap-administrator";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the seed command");
const url = new URL(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 2,
  }),
});

const repository = {
  findByEmail: (email: string) =>
    prisma.user.findUnique({ where: { normalizedEmail: email }, select: { id: true } }),
  createAdministrator: (input: { name: string; email: string; passwordHash: string }) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...input, normalizedEmail: input.email, role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "ADMIN_BOOTSTRAPPED",
          entityType: "User",
          entityId: user.id,
          contextJson: { source: "seed" },
        },
      });
      return user;
    }),
};

try {
  const result = await bootstrapAdministrator(repository, {
    name: process.env.BOOTSTRAP_ADMIN_NAME ?? "System Administrator",
    email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
  });
  console.log(
    result.created
      ? `Administrator created: ${result.userId}`
      : `Administrator already exists: ${result.userId}`,
  );
} finally {
  await prisma.$disconnect();
}
