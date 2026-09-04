import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { createFaculty, deleteFaculty, listFaculty, updateOwnProfile } from "./faculty-service";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

const admin = { id: "a1", name: "Admin", email: "admin@example.edu", role: "ADMIN" as const };
const faculty = {
  id: "f1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY" as const,
};

describe("faculty service authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        user: { findFirst: mocks.userFindFirst, update: mocks.userUpdate },
        session: { deleteMany: mocks.sessionDeleteMany },
        passwordResetToken: { deleteMany: mocks.tokenDeleteMany },
        auditLog: { create: mocks.auditCreate },
      }),
    );
  });
  it("rejects faculty account listing and creation by faculty", async () => {
    await expect(listFaculty(faculty)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createFaculty(faculty, {})).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("rejects administrator self-service faculty profile updates", async () => {
    await expect(updateOwnProfile(admin, {})).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("rejects faculty deletion by a Faculty actor before database access", async () => {
    await expect(deleteFaculty(faculty, "target-1")).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("excludes deleted faculty by default and includes them when explicitly filtered", async () => {
    await listFaculty(admin);
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["ACTIVE", "SUSPENDED"] } }),
      }),
    );

    await listFaculty(admin, "", "DELETED");
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "DELETED" }) }),
    );
  });
  it("soft-deletes faculty and revokes access in one audited transaction", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
    mocks.userUpdate.mockResolvedValue({ id: "target-1", status: "DELETED" });

    await expect(deleteFaculty(admin, "target-1")).resolves.toMatchObject({
      id: "target-1",
      status: "DELETED",
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "target-1", role: "FACULTY", status: { not: "DELETED" } },
      data: {
        status: "DELETED",
        deletedAt: expect.any(Date),
        sessionVersion: { increment: 1 },
      },
    });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "target-1" } });
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "target-1" } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: admin.id,
        action: "faculty.deleted",
        entityType: "User",
        entityId: "target-1",
        contextJson: { previousStatus: "ACTIVE" },
      },
    });
  });
  it("rejects an unavailable deletion target without side effects", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(deleteFaculty(admin, "missing")).rejects.toThrow(
      "Faculty account is unavailable for deletion",
    );
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tokenDeleteMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
