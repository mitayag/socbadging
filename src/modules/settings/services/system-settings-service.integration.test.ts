import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";
import type { Actor } from "@/modules/identity/types";

import { updateSystemSettings } from "./system-settings-service";

const auditFailureTrigger = "task1_settings_audit_failure";
const testHookKey = Symbol.for("hau-soc-badging.system-settings-test-hooks");

type SystemSettingsTestHooks = {
  beforeAdministratorLock?: () => Promise<void>;
  afterAdministratorLock?: () => Promise<void>;
};

const administrator: Actor = {
  id: "task1-settings-admin",
  name: "Task One Administrator",
  email: "task1-settings-admin@example.test",
  role: "ADMIN",
};

const baselineInput = {
  issuerName: "HAU School of Computing",
  issuerUrl: "https://soc.hau.edu.ph",
  issuerLogoPath: "/images/issuer-logo.png",
  supportContact: "support@hau.edu.ph",
  sharingEnabled: true,
};

function installHooks(hooks: SystemSettingsTestHooks) {
  (globalThis as typeof globalThis & { [testHookKey]?: SystemSettingsTestHooks })[testHookKey] =
    hooks;
}

function clearHooks() {
  delete (globalThis as typeof globalThis & { [testHookKey]?: SystemSettingsTestHooks })[
    testHookKey
  ];
}

async function dropTestTriggers() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${auditFailureTrigger}`);
}

async function createAdministrator() {
  await prisma.user.create({
    data: {
      id: administrator.id,
      name: administrator.name,
      email: administrator.email,
      normalizedEmail: administrator.email,
      passwordHash: "not-used-by-integration-test",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
}

async function removeFixture() {
  await prisma.auditLog.deleteMany({
    where: { action: "settings.updated", entityType: "SystemSetting", entityId: "default" },
  });
  await prisma.systemSetting.deleteMany({ where: { id: "default" } });
  await prisma.user.deleteMany({ where: { id: administrator.id } });
}

beforeEach(async () => {
  clearHooks();
  await dropTestTriggers();
  await removeFixture();
  await createAdministrator();
});

afterEach(async () => {
  clearHooks();
  await dropTestTriggers();
  await removeFixture();
});

describe("system settings MariaDB transactions", () => {
  it("rolls back the singleton write when the settings audit insert fails", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${auditFailureTrigger} BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task 1 forced audit failure'`,
    );

    await expect(updateSystemSettings(administrator, baselineInput)).rejects.toThrow();

    await expect(prisma.systemSetting.count({ where: { id: "default" } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: administrator.id, action: "settings.updated" },
      }),
    ).resolves.toBe(0);
  });

  it("serializes concurrent updates so the second audit records every persisted field transition", async () => {
    await prisma.systemSetting.create({ data: { id: "default", ...baselineInput } });
    const first = { ...baselineInput, issuerName: "HAU SOC First Update" };
    const second = { ...baselineInput, supportContact: "help@hau.edu.ph" };

    await Promise.all([
      updateSystemSettings(administrator, first),
      updateSystemSettings(administrator, second),
    ]);

    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: administrator.id, action: "settings.updated" },
      select: { contextJson: true },
      orderBy: { createdAt: "asc" },
    });
    const changedFields = audits.map((audit) =>
      (audit.contextJson as { changedFields: string[] }).changedFields.sort(),
    );

    expect(changedFields).toHaveLength(2);
    expect(changedFields.map((fields) => fields.length).sort()).toEqual([1, 2]);
    expect(changedFields).toContainEqual(["issuerName", "supportContact"]);
  });

  it("rejects a stale Administrator actor when suspension commits before its transaction lock", async () => {
    installHooks({
      beforeAdministratorLock: async () => {
        await prisma.user.update({
          where: { id: administrator.id },
          data: { status: "SUSPENDED" },
        });
      },
    });

    await expect(updateSystemSettings(administrator, baselineInput)).rejects.toThrow(
      "Administrator account is no longer active",
    );
    await expect(prisma.systemSetting.count({ where: { id: "default" } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { actorUserId: administrator.id, action: "settings.updated" },
      }),
    ).resolves.toBe(0);
  });

  it("holds the authoritative Administrator lock until its settings update and audit commit", async () => {
    let suspensionSettled = false;
    let suspension: Promise<unknown> | undefined;
    installHooks({
      afterAdministratorLock: async () => {
        suspension = prisma.user
          .update({ where: { id: administrator.id }, data: { status: "SUSPENDED" } })
          .then((result) => {
            suspensionSettled = true;
            return result;
          });
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(suspensionSettled).toBe(false);
      },
    });

    await expect(updateSystemSettings(administrator, baselineInput)).resolves.toEqual(
      baselineInput,
    );
    await suspension;
    expect(suspensionSettled).toBe(true);
  });
});
