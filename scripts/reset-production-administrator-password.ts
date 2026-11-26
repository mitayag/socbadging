import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { z } from "zod";

const emailSchema = z.email().transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(14).max(200);
const AUDIT_ACTION = "administrator.password_reset";

type TargetAdministrator = {
  id: string;
  email: string;
  normalizedEmail: string;
  name: string;
  role: "ADMIN";
  status: "ACTIVE";
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isInsideProject(path: string): boolean {
  const root = resolve(process.cwd());
  return path === root || path.startsWith(`${root}/`);
}

function assertOutsideProject(path: string, name: string): string {
  if (!isAbsolute(path)) throw new Error(`${name} must be an absolute path outside the repository`);
  const resolved = resolve(path);
  if (isInsideProject(resolved)) {
    throw new Error(`${name} must be outside the project working tree`);
  }
  return resolved;
}

async function prepareCredentialsFile(path: string): Promise<string> {
  const resolved = assertOutsideProject(path, "ADMIN_RESET_CREDENTIAL_FILE");
  if (process.env.ADMIN_RESET_REPLACE_CREDENTIALS !== "YES") {
    try {
      const existing = await stat(resolved);
      if (existing.isFile()) {
        throw new Error(
          "ADMIN_RESET_CREDENTIAL_FILE already exists; set ADMIN_RESET_REPLACE_CREDENTIALS=YES to replace it",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  } else {
    await unlink(resolved).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await mkdir(dirname(resolved), { recursive: true, mode: 0o700 });
  return resolved;
}

async function writeCredentials(path: string, data: Record<string, unknown>): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function readOperatorPassword(path: string): Promise<string> {
  const resolved = assertOutsideProject(path, "ADMIN_RESET_PASSWORD_FILE");
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("ADMIN_RESET_PASSWORD_FILE must be a regular file");
  if ((info.mode & 0o777) !== 0o600) {
    throw new Error("ADMIN_RESET_PASSWORD_FILE must have mode 600");
  }
  return passwordSchema.parse((await readFile(resolved, "utf8")).trim());
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const url = new URL(databaseUrl);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
  });
}

async function findTargetAdministrator(
  prisma: PrismaClient,
  targetEmail: string,
  targetUserId: string | undefined,
): Promise<TargetAdministrator> {
  const matches = await prisma.user.findMany({
    where: {
      normalizedEmail: targetEmail,
      role: "ADMIN",
      status: "ACTIVE",
      ...(targetUserId ? { id: targetUserId } : {}),
    },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      name: true,
      role: true,
      status: true,
    },
    take: 2,
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active Administrator for ${targetEmail}; found ${matches.length}. No account was changed`,
    );
  }
  const target = matches[0];
  if (!target || target.role !== "ADMIN" || target.status !== "ACTIVE") {
    throw new Error("Target active Administrator was not found; no account was changed");
  }
  return {
    id: target.id,
    email: target.email,
    normalizedEmail: target.normalizedEmail,
    name: target.name,
    role: "ADMIN",
    status: "ACTIVE",
  };
}

async function resetPassword(
  prisma: PrismaClient,
  target: TargetAdministrator,
  newPassword: string,
  source: string,
) {
  const passwordHash = await hash(newPassword, { type: 2 });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: target.id,
        normalizedEmail: target.normalizedEmail,
        role: "ADMIN",
        status: "ACTIVE",
      },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new Error("Target Administrator changed before the reset; no account was changed");
    }

    const sessions = await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: AUDIT_ACTION,
        entityType: "User",
        entityId: target.id,
        contextJson: {
          source,
          targetEmail: target.email,
          sessionsInvalidated: sessions.count,
        },
      },
    });

    return {
      userId: target.id,
      email: target.email,
      sessionsInvalidated: sessions.count,
      auditAction: AUDIT_ACTION,
    };
  });
}

async function main() {
  if (process.env.ADMIN_RESET_APPROVED !== "YES") {
    throw new Error("Set ADMIN_RESET_APPROVED=YES only after explicit operator approval");
  }

  const targetEmail = emailSchema.parse(required("ADMIN_RESET_TARGET_EMAIL"));
  const targetUserId = process.env.ADMIN_RESET_TARGET_USER_ID?.trim() || undefined;
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (bootstrapEmail && targetEmail !== bootstrapEmail) {
    throw new Error(
      "ADMIN_RESET_TARGET_EMAIL must match BOOTSTRAP_ADMIN_EMAIL; refusing to reset a different account",
    );
  }

  const prisma = createPrismaClient();
  let pendingCredentialsPath: string | undefined;
  try {
    const target = await findTargetAdministrator(prisma, targetEmail, targetUserId);
    console.log(
      JSON.stringify(
        {
          status: "TARGET_CONFIRMED",
          targetEmail: target.email,
          targetUserId: target.id,
          role: target.role,
          accountStatus: target.status,
        },
        null,
        2,
      ),
    );

    const credentialsPath = await prepareCredentialsFile(required("ADMIN_RESET_CREDENTIAL_FILE"));
    const password = process.env.ADMIN_RESET_PASSWORD_FILE?.trim()
      ? await readOperatorPassword(required("ADMIN_RESET_PASSWORD_FILE"))
      : randomBytes(36).toString("base64url");
    const createdAt = new Date().toISOString();
    const source = process.env.ADMIN_RESET_SOURCE?.trim() || "operator-admin-reset";

    pendingCredentialsPath = credentialsPath;
    await writeCredentials(credentialsPath, {
      targetEmail: target.email,
      targetUserId: target.id,
      password,
      createdAt,
      source,
    });

    const result = await resetPassword(prisma, target, password, source);
    pendingCredentialsPath = undefined;
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          targetEmail: result.email,
          targetUserId: result.userId,
          sessionsInvalidated: result.sessionsInvalidated,
          auditAction: result.auditAction,
          credentialsFile: credentialsPath,
          passwordPrinted: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (pendingCredentialsPath) {
      await unlink(pendingCredentialsPath).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            "The unapplied credentials file could not be removed; remove it manually without displaying its contents.",
          );
        }
      });
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Administrator password reset failed");
  console.error("No password was printed.");
  process.exitCode = 1;
});
