import "server-only";

import { Prisma } from "@prisma/client";

import { getServerEnv } from "@/config/env";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";
import {
  PublicSystemSettingsSchema,
  SystemSettingsInputSchema,
  type PublicSystemSettings,
  type SystemSettingsInput,
} from "../types";

const SETTINGS_ID = "default";
const systemSettingsTestHookKey = Symbol.for("hau-soc-badging.system-settings-test-hooks");
const settingFieldNames = [
  "issuerName",
  "issuerUrl",
  "issuerLogoPath",
  "supportContact",
  "sharingEnabled",
] as const;

export type StoredSettings = {
  issuerName: string | null;
  issuerUrl: string | null;
  issuerLogoPath: string | null;
  supportContact: string | null;
  sharingEnabled: boolean;
};

type LockedStoredSettings = Omit<StoredSettings, "sharingEnabled"> & {
  sharingEnabled: boolean | number;
};

type CurrentUser = {
  id: string;
  role: "ADMIN" | "FACULTY";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt: Date | null;
};

type SystemSettingsTestHooks = {
  beforeAdministratorLock?: () => Promise<void>;
  afterAdministratorLock?: () => Promise<void>;
};

export function toPublicSettings(record: StoredSettings | null): PublicSystemSettings {
  const env = getServerEnv();
  return PublicSystemSettingsSchema.parse({
    issuerName: record?.issuerName ?? env.ISSUER_NAME,
    issuerUrl: record?.issuerUrl ?? env.ISSUER_URL,
    issuerLogoPath: record?.issuerLogoPath ?? env.ISSUER_LOGO_PATH,
    supportContact: record?.supportContact ?? null,
    sharingEnabled: record?.sharingEnabled ?? true,
  });
}

export function getIssuerPresentation(record: StoredSettings | null) {
  const settings = toPublicSettings(record);
  return {
    issuerName: settings.issuerName,
    issuerUrl: settings.issuerUrl,
    issuerLogoPath: settings.issuerLogoPath,
  };
}

function requireActiveAdministrator(user: CurrentUser | null): void {
  if (user?.role !== "ADMIN" || user.status !== "ACTIVE" || user.deletedAt !== null) {
    throw new AuthorizationError("Administrator account is no longer active");
  }
}

async function findCurrentAdministrator(actor: Actor, client: Pick<typeof prisma, "user">) {
  const user = await client.user.findUnique({
    where: { id: actor.id },
    select: { id: true, role: true, status: true, deletedAt: true },
  });
  requireActiveAdministrator(user);
}

function testHooks(): SystemSettingsTestHooks | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (
    globalThis as typeof globalThis & { [systemSettingsTestHookKey]?: SystemSettingsTestHooks }
  )[systemSettingsTestHookKey];
}

async function lockCurrentAdministrator(actor: Actor, tx: Prisma.TransactionClient): Promise<void> {
  await testHooks()?.beforeAdministratorLock?.();
  const [user] = await tx.$queryRaw<CurrentUser[]>(Prisma.sql`
    SELECT id, role, status, deleted_at AS deletedAt
    FROM users
    WHERE id = ${actor.id}
    FOR UPDATE
  `);
  requireActiveAdministrator(user ?? null);
  await testHooks()?.afterAdministratorLock?.();
}

async function lockSystemSettings(tx: Prisma.TransactionClient): Promise<StoredSettings> {
  // Materialize then lock the singleton row so first-use creation and every later update serialize.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO system_settings (id, sharing_enabled, created_at, updated_at)
    VALUES (${SETTINGS_ID}, TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE id = id
  `);
  const [current] = await tx.$queryRaw<LockedStoredSettings[]>(Prisma.sql`
    SELECT
      issuer_name AS issuerName,
      issuer_url AS issuerUrl,
      issuer_logo_path AS issuerLogoPath,
      support_contact AS supportContact,
      sharing_enabled AS sharingEnabled
    FROM system_settings
    WHERE id = ${SETTINGS_ID}
    FOR UPDATE
  `);
  if (!current) throw new Error("System settings singleton is unavailable");
  return {
    ...current,
    sharingEnabled: current.sharingEnabled === true || current.sharingEnabled === 1,
  };
}

function changedFields(current: StoredSettings | null, next: SystemSettingsInput) {
  return settingFieldNames.filter((field) => current?.[field] !== next[field]);
}

export async function getPublicSystemSettings(): Promise<PublicSystemSettings> {
  const record = await prisma.systemSetting.findUnique({ where: { id: SETTINGS_ID } });
  return toPublicSettings(record);
}

export async function getAdminSystemSettings(actor: Actor): Promise<PublicSystemSettings> {
  requireRole(actor, "ADMIN");
  await findCurrentAdministrator(actor, prisma);
  return getPublicSystemSettings();
}

export async function updateSystemSettings(
  actor: Actor,
  rawInput: unknown,
): Promise<PublicSystemSettings> {
  requireRole(actor, "ADMIN");
  const input = SystemSettingsInputSchema.parse(rawInput);
  await findCurrentAdministrator(actor, prisma);

  return prisma.$transaction(async (tx) => {
    await lockCurrentAdministrator(actor, tx);
    const current = await lockSystemSettings(tx);
    const updated = await tx.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input, updatedByUserId: actor.id },
      update: { ...input, updatedByUserId: actor.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "settings.updated",
        entityType: "SystemSetting",
        entityId: SETTINGS_ID,
        contextJson: { changedFields: changedFields(current, input) },
      },
    });
    return toPublicSettings(updated);
  });
}
