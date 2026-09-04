import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  lockingQuery: vi.fn(),
  settingsFindUnique: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsBootstrap: vi.fn(),
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "mysql://test:test@127.0.0.1:3306/test",
    APP_URL: "http://localhost:3000",
    ISSUER_NAME: "Holy Angel University — School of Computing",
    ISSUER_URL: "http://localhost:3000",
    ISSUER_LOGO_PATH: "/images/hausoclogo.png",
    NODE_ENV: "test",
    PRIVATE_DATABASE_PASSWORD: "must-not-leak",
  }),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    systemSetting: { findUnique: mocks.settingsFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import {
  getAdminSystemSettings,
  getPublicSystemSettings,
  updateSystemSettings,
} from "./system-settings-service";
import { SystemSettingsInputSchema } from "../types";

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@hau.edu.ph",
  role: "ADMIN",
};

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@hau.edu.ph",
  role: "FACULTY",
};

const defaultSettings = {
  issuerName: "Holy Angel University — School of Computing",
  issuerUrl: "http://localhost:3000",
  issuerLogoPath: "/images/hausoclogo.png",
  supportContact: null,
  sharingEnabled: true,
};

const validInput = {
  issuerName: "HAU School of Computing",
  issuerUrl: "https://soc.hau.edu.ph",
  issuerLogoPath: "/images/issuer-logo.png",
  supportContact: "support@hau.edu.ph",
  sharingEnabled: false,
};

function activeAdministrator(overrides: Record<string, unknown> = {}) {
  return { id: administrator.id, role: "ADMIN", status: "ACTIVE", deletedAt: null, ...overrides };
}

function storedSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: "default",
    issuerName: "Legacy Issuer",
    issuerUrl: "https://legacy.example.edu",
    issuerLogoPath: "/images/legacy.png",
    supportContact: "mailto:legacy@example.edu",
    sharingEnabled: true,
    updatedByUserId: "admin-0",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createTransactionFixture() {
  const tx = {
    $executeRaw: mocks.settingsBootstrap,
    $queryRaw: mocks.lockingQuery,
    auditLog: { create: mocks.auditCreate },
    systemSetting: {
      findUnique: mocks.settingsFindUnique,
      upsert: mocks.settingsUpsert,
    },
    user: { findUnique: mocks.userFindUnique },
  };
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  return tx;
}

function lockingRead(query: { strings?: readonly string[] }) {
  const sql = query.strings?.join(" ") ?? "";
  if (sql.includes("FROM users")) return Promise.resolve([activeAdministrator()]);
  if (sql.includes("FROM system_settings")) return Promise.resolve([storedSettings()]);
  return Promise.reject(new Error(`Unexpected locking query: ${sql}`));
}

describe("system settings runtime contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createTransactionFixture();
    mocks.userFindUnique.mockResolvedValue(activeAdministrator());
    mocks.settingsFindUnique.mockResolvedValue(null);
  });

  it("falls back from a blank database state to validated deployment defaults without secrets", async () => {
    const result = await getPublicSystemSettings();

    expect(result).toEqual(defaultSettings);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("uses nullable database overrides while retaining a narrow public response", async () => {
    mocks.settingsFindUnique.mockResolvedValue(
      storedSettings({ issuerName: "HAU SOC", supportContact: "https://support.hau.edu.ph" }),
    );

    await expect(getPublicSystemSettings()).resolves.toEqual({
      issuerName: "HAU SOC",
      issuerUrl: "https://legacy.example.edu",
      issuerLogoPath: "/images/legacy.png",
      supportContact: "https://support.hau.edu.ph",
      sharingEnabled: true,
    });
  });

  it("normalizes an empty support contact to null", () => {
    expect(
      SystemSettingsInputSchema.parse({ ...validInput, supportContact: "   " }).supportContact,
    ).toBe(null);
  });

  it.each([
    ["an overlong issuer URL", { issuerUrl: `https://example.edu/${"a".repeat(2048)}` }],
    ["a non-HTTP issuer URL", { issuerUrl: "javascript:alert(1)" }],
    ["a traversal logo path", { issuerLogoPath: "/images/../secret.png" }],
    ["a protocol-relative logo path", { issuerLogoPath: "//cdn.example.edu/logo.png" }],
    ["an unsafe support contact", { supportContact: "javascript:alert(1)" }],
    ["a mailto contact with a query", { supportContact: "mailto:support@hau.edu.ph?body=secret" }],
    ["an overlong support contact", { supportContact: `https://example.edu/${"a".repeat(2048)}` }],
  ])("rejects %s", (_caseName, override) => {
    expect(() => SystemSettingsInputSchema.parse({ ...validInput, ...override })).toThrow();
  });
});

describe("Administrator-only system settings reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createTransactionFixture();
    mocks.settingsFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue(activeAdministrator());
  });

  it("allows an active Administrator to load the settings form", async () => {
    await expect(getAdminSystemSettings(administrator)).resolves.toEqual(defaultSettings);
  });

  it("denies anonymous and Faculty form access before reading settings", async () => {
    await expect(getAdminSystemSettings(null as never)).rejects.toThrow(AuthorizationError);
    await expect(getAdminSystemSettings(faculty)).rejects.toThrow("Administrator access required");

    expect(mocks.settingsFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["a suspended Administrator", activeAdministrator({ status: "SUSPENDED" })],
    ["a deleted Administrator", activeAdministrator({ status: "DELETED", deletedAt: new Date() })],
    ["an Administrator whose role changed", activeAdministrator({ role: "FACULTY" })],
  ])("denies %s from loading the form", async (_caseName, currentUser) => {
    mocks.userFindUnique.mockResolvedValue(currentUser);

    await expect(getAdminSystemSettings(administrator)).rejects.toThrow(
      "Administrator account is no longer active",
    );
    expect(mocks.settingsFindUnique).not.toHaveBeenCalled();
  });
});

describe("updateSystemSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createTransactionFixture();
    mocks.userFindUnique.mockResolvedValue(activeAdministrator());
    mocks.settingsFindUnique.mockResolvedValue(storedSettings());
    mocks.lockingQuery.mockImplementation(lockingRead);
    mocks.settingsUpsert.mockResolvedValue(storedSettings(validInput));
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("updates the singleton and writes exactly one atomic changed-field-only audit for an active Administrator", async () => {
    await expect(updateSystemSettings(administrator, validInput)).resolves.toEqual(validInput);

    expect(mocks.settingsUpsert).toHaveBeenCalledWith({
      where: { id: "default" },
      create: { id: "default", ...validInput, updatedByUserId: administrator.id },
      update: { ...validInput, updatedByUserId: administrator.id },
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: administrator.id,
        action: "settings.updated",
        entityType: "SystemSetting",
        entityId: "default",
        contextJson: {
          changedFields: [
            "issuerName",
            "issuerUrl",
            "issuerLogoPath",
            "supportContact",
            "sharingEnabled",
          ],
        },
      },
    });
    expect(JSON.stringify(mocks.auditCreate.mock.calls[0])).not.toContain("support@hau.edu.ph");
    expect(mocks.settingsBootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.lockingQuery).toHaveBeenCalledTimes(2);
    expect(mocks.lockingQuery.mock.calls.map(([query]) => query.strings?.join(" "))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("FROM users"),
        expect.stringContaining("FROM system_settings"),
      ]),
    );
    expect(mocks.lockingQuery.mock.calls.map(([query]) => query.strings?.join(" "))).toEqual(
      expect.arrayContaining([expect.stringContaining("FOR UPDATE")]),
    );
  });

  it("normalizes MariaDB boolean lock results before calculating changed audit fields", async () => {
    mocks.lockingQuery.mockImplementation((query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return Promise.resolve([activeAdministrator()]);
      if (sql.includes("FROM system_settings")) {
        return Promise.resolve([storedSettings({ ...validInput, sharingEnabled: 0 })]);
      }
      return Promise.reject(new Error(`Unexpected locking query: ${sql}`));
    });

    await expect(updateSystemSettings(administrator, validInput)).resolves.toEqual(validInput);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contextJson: { changedFields: [] } }),
      }),
    );
  });

  it("denies unauthenticated and Faculty mutation before any write", async () => {
    await expect(updateSystemSettings(null as never, validInput)).rejects.toThrow(
      AuthorizationError,
    );
    await expect(updateSystemSettings(faculty, validInput)).rejects.toThrow(
      "Administrator access required",
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a suspended Administrator", activeAdministrator({ status: "SUSPENDED" })],
    ["a deleted Administrator", activeAdministrator({ status: "DELETED", deletedAt: new Date() })],
    ["an Administrator whose role changed", activeAdministrator({ role: "FACULTY" })],
  ])("denies %s before mutation", async (_caseName, currentUser) => {
    mocks.userFindUnique.mockResolvedValue(currentUser);

    await expect(updateSystemSettings(administrator, validInput)).rejects.toThrow(
      "Administrator account is no longer active",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("revalidates Administrator state inside the transaction before any settings or audit write", async () => {
    mocks.lockingQuery.mockResolvedValueOnce([activeAdministrator({ status: "SUSPENDED" })]);

    await expect(updateSystemSettings(administrator, validInput)).rejects.toThrow(
      "Administrator account is no longer active",
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a deleted Administrator", activeAdministrator({ status: "DELETED", deletedAt: new Date() })],
    ["an Administrator whose role changed", activeAdministrator({ role: "FACULTY" })],
    ["an Administrator who disappeared", null],
  ])(
    "denies %s inside the transaction before any settings or audit write",
    async (_caseName, user) => {
      mocks.lockingQuery.mockResolvedValueOnce(user === null ? [] : [user]);

      await expect(updateSystemSettings(administrator, validInput)).rejects.toThrow(
        "Administrator account is no longer active",
      );
      expect(mocks.settingsBootstrap).not.toHaveBeenCalled();
      expect(mocks.settingsUpsert).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid input before opening a transaction or writing settings", async () => {
    await expect(
      updateSystemSettings(administrator, {
        ...validInput,
        issuerLogoPath: "/images/../secret.png",
      }),
    ).rejects.toThrow();

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settingsBootstrap).not.toHaveBeenCalled();
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
