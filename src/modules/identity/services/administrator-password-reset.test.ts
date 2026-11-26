import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  transaction: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  hash: vi.fn(async (value: string) => `hashed:${value}`),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("argon2", () => ({ hash: mocks.hash }));

import {
  ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION,
  AdministratorPasswordResetError,
  findAdministratorPasswordResetTarget,
  resetAdministratorPassword,
} from "./administrator-password-reset";

const target = {
  id: "admin-1",
  email: "admin@hau.edu.ph",
  normalizedEmail: "admin@hau.edu.ph",
  name: "System Administrator",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
};

describe("administrator password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindFirst.mockResolvedValue(target);
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionDeleteMany.mockResolvedValue({ count: 3 });
    mocks.tokenDeleteMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        user: { updateMany: mocks.userUpdateMany },
        session: { deleteMany: mocks.sessionDeleteMany },
        passwordResetToken: { deleteMany: mocks.tokenDeleteMany },
        auditLog: { create: mocks.auditCreate },
      }),
    );
  });

  it("requires the exact active Administrator identity before resetting", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(
      resetAdministratorPassword({
        targetEmail: "ADMIN@HAU.EDU.PH",
        targetUserId: "admin-1",
        newPassword: "A-strong-password-2026!",
      }),
    ).rejects.toBeInstanceOf(AdministratorPasswordResetError);

    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "admin-1",
          normalizedEmail: "admin@hau.edu.ph",
          role: "ADMIN",
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
    );
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects passwords that do not meet the application policy before database access", async () => {
    await expect(
      resetAdministratorPassword({
        targetEmail: "admin@hau.edu.ph",
        targetUserId: "admin-1",
        newPassword: "short",
      }),
    ).rejects.toThrow();

    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("matches the target by ID and normalized email for preflight confirmation", async () => {
    await expect(
      findAdministratorPasswordResetTarget({
        targetEmail: "ADMIN@HAU.EDU.PH",
        targetUserId: "admin-1",
      }),
    ).resolves.toEqual(target);

    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "admin-1",
          normalizedEmail: "admin@hau.edu.ph",
          role: "ADMIN",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("hashes with Argon2id, updates only the target, invalidates sessions, and audits", async () => {
    await expect(
      resetAdministratorPassword({
        targetEmail: "admin@hau.edu.ph",
        targetUserId: "admin-1",
        newPassword: "A-strong-password-2026!",
        source: "operator-test",
      }),
    ).resolves.toEqual({
      userId: "admin-1",
      email: "admin@hau.edu.ph",
      sessionsInvalidated: 3,
      auditAction: ADMINISTRATOR_PASSWORD_RESET_AUDIT_ACTION,
    });

    expect(mocks.hash).toHaveBeenCalledWith("A-strong-password-2026!", { type: 2 });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "admin-1",
        normalizedEmail: "admin@hau.edu.ph",
        role: "ADMIN",
        status: "ACTIVE",
        deletedAt: null,
      },
      data: {
        passwordHash: "hashed:A-strong-password-2026!",
        sessionVersion: { increment: 1 },
      },
    });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "admin-1" } });
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "admin-1" } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: null,
        action: "administrator.password_reset",
        entityType: "User",
        entityId: "admin-1",
        contextJson: {
          source: "operator-test",
          targetEmail: "admin@hau.edu.ph",
          sessionsInvalidated: 3,
        },
      },
    });
  });

  it("aborts without auditing when the target changes before the update", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      resetAdministratorPassword({
        targetEmail: "admin@hau.edu.ph",
        targetUserId: "admin-1",
        newPassword: "A-strong-password-2026!",
      }),
    ).rejects.toBeInstanceOf(AdministratorPasswordResetError);

    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tokenDeleteMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
