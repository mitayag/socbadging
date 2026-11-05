import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  transaction: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  verify: vi.fn(async (stored: string, value: string) => stored === `hashed:${value}`),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("argon2", () => ({ hash: mocks.hash, verify: mocks.verify }));

import { AccountPasswordError, changeOwnPassword, updateOwnDisplayName } from "./account-service";

const faculty = {
  id: "faculty-1",
  name: "Faculty User",
  email: "faculty@example.test",
  role: "FACULTY" as const,
};

describe("account service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindFirst.mockResolvedValue({
      id: faculty.id,
      passwordHash: "hashed:current-password",
    });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        user: { updateMany: mocks.userUpdateMany },
        session: { deleteMany: mocks.sessionDeleteMany },
        passwordResetToken: { deleteMany: mocks.tokenDeleteMany },
        auditLog: { create: mocks.auditCreate },
      }),
    );
  });

  it("rejects unauthenticated account changes before database access", async () => {
    await expect(updateOwnDisplayName(null, { name: "New Name" })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(
      changeOwnPassword(null, {
        currentPassword: "current-password",
        newPassword: "a-new-password-value",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates the display name only for the current active account and audits it", async () => {
    await expect(updateOwnDisplayName(faculty, { name: "Updated Name" })).resolves.toEqual({
      name: "Updated Name",
    });

    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: faculty.id, status: "ACTIVE", deletedAt: null },
      data: { name: "Updated Name" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: faculty.id,
        action: "account.updated",
        entityType: "User",
        entityId: faculty.id,
      },
    });
  });

  it("rejects an incorrect current password without mutating sessions or credentials", async () => {
    await expect(
      changeOwnPassword(faculty, {
        currentPassword: "wrong-password",
        newPassword: "a-new-password-value",
      }),
    ).rejects.toBeInstanceOf(AccountPasswordError);

    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("hashes the new password, invalidates every session, and audits the change", async () => {
    await expect(
      changeOwnPassword(faculty, {
        currentPassword: "current-password",
        newPassword: "a-new-password-value",
      }),
    ).resolves.toEqual({ changed: true });

    expect(mocks.hash).toHaveBeenCalledWith("a-new-password-value", { type: 2 });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: faculty.id, status: "ACTIVE", deletedAt: null },
      data: { passwordHash: "hashed:a-new-password-value", sessionVersion: { increment: 1 } },
    });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: faculty.id } });
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({ where: { userId: faculty.id } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: faculty.id,
        action: "account.password_changed",
        entityType: "User",
        entityId: faculty.id,
      },
    });
  });

  it("rejects password changes when the current account is no longer active", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(
      changeOwnPassword(faculty, {
        currentPassword: "current-password",
        newPassword: "a-new-password-value",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
