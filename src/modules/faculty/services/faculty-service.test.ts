import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import {
  createFaculty,
  deleteFaculty,
  editFaculty,
  FacultyConflictError,
  listFaculty,
  resetFacultyAccess,
  setFacultyStatus,
  updateOwnProfile,
} from "./faculty-service";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  profileFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  transaction: vi.fn(),
  sessionDeleteMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    user: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
    },
    facultyProfile: {
      findUnique: mocks.profileFindUnique,
      findFirst: mocks.profileFindFirst,
    },
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
const validInput = {
  name: "New Faculty",
  email: "new.faculty@example.edu",
  employeeId: "EMP-100",
  departmentId: "",
  title: "Instructor",
  bio: "",
  temporaryPassword: "TemporaryPass!2026",
};

describe("faculty service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.profileFindUnique.mockResolvedValue(null);
    mocks.profileFindFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        user: {
          create: mocks.userCreate,
          findFirst: mocks.userFindFirst,
          update: mocks.userUpdate,
        },
        session: { deleteMany: mocks.sessionDeleteMany },
        passwordResetToken: { deleteMany: mocks.tokenDeleteMany },
        auditLog: { create: mocks.auditCreate },
      }),
    );
  });

  describe("authorization", () => {
    it("rejects faculty account listing and creation by faculty", async () => {
      await expect(listFaculty(faculty)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(createFaculty(faculty, {})).rejects.toBeInstanceOf(AuthorizationError);
    });
    it("rejects administrator self-service faculty profile updates", async () => {
      await expect(updateOwnProfile(admin, {})).rejects.toBeInstanceOf(AuthorizationError);
    });
    it("rejects faculty edits, status changes, resets, and deletion before database access", async () => {
      await expect(editFaculty(faculty, "target-1", {})).rejects.toBeInstanceOf(AuthorizationError);
      await expect(setFacultyStatus(faculty, "target-1", "INACTIVE")).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await expect(
        resetFacultyAccess(faculty, "target-1", "TemporaryPass!2026"),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(deleteFaculty(faculty, "target-1")).rejects.toBeInstanceOf(AuthorizationError);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });

  describe("listing", () => {
    it("excludes deleted accounts by default and supports each access status", async () => {
      await listFaculty(admin);
      expect(mocks.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
          }),
        }),
      );

      for (const status of ["ACTIVE", "INACTIVE", "SUSPENDED", "DELETED"] as const) {
        await listFaculty(admin, "", status);
        expect(mocks.findMany).toHaveBeenLastCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ status }) }),
        );
      }
    });

    it("supports search, sorting, page sizes, and page clamping", async () => {
      mocks.count.mockResolvedValue(30);
      const result = await listFaculty(admin, "EMP-100", "INACTIVE", 2, {
        pageSize: 25,
        sort: "employeeId",
      });

      expect(result).toMatchObject({
        page: 2,
        pageSize: 25,
        pageCount: 2,
        total: 30,
        hasNext: false,
        hasPrevious: true,
      });
      expect(mocks.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
          orderBy: [{ facultyProfile: { employeeId: "asc" } }, { name: "asc" }],
          where: expect.objectContaining({
            status: "INACTIVE",
            OR: expect.arrayContaining([
              { name: { contains: "EMP-100" } },
              { email: { contains: "EMP-100" } },
              { facultyProfile: { employeeId: { contains: "EMP-100" } } },
            ]),
          }),
        }),
      );

      await listFaculty(admin, "", undefined, 1, { sort: "status" });
      expect(mocks.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ status: "asc" }, { name: "asc" }],
        }),
      );

      mocks.count.mockResolvedValue(3);
      await expect(listFaculty(admin, "", undefined, 9, { pageSize: 10 })).resolves.toMatchObject({
        page: 1,
        pageCount: 1,
      });
    });
  });

  describe("create and edit validation", () => {
    it("rejects a duplicate email before writing", async () => {
      mocks.userFindUnique.mockResolvedValue({ id: "existing" });
      await expect(createFaculty(admin, validInput)).rejects.toBeInstanceOf(FacultyConflictError);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("rejects a duplicate employee ID before writing", async () => {
      mocks.profileFindUnique.mockResolvedValue({ userId: "existing" });
      await expect(createFaculty(admin, validInput)).rejects.toMatchObject({
        field: "employeeId",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("updates email, profile, and audit records for a valid edit", async () => {
      mocks.profileFindUnique.mockResolvedValue({ departmentId: null });
      mocks.userUpdate.mockResolvedValue({ id: "target-1" });
      await editFaculty(admin, "target-1", {
        ...validInput,
        email: "updated.faculty@example.edu",
      });
      expect(mocks.userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "target-1", role: "FACULTY", status: { not: "DELETED" } },
          data: expect.objectContaining({
            name: "New Faculty",
            email: "updated.faculty@example.edu",
            normalizedEmail: "updated.faculty@example.edu",
          }),
        }),
      );
      expect(mocks.auditCreate).toHaveBeenCalledWith({
        data: {
          actorUserId: admin.id,
          action: "faculty.updated",
          entityType: "User",
          entityId: "target-1",
        },
      });
    });

    it("rejects editing to an email owned by another account", async () => {
      mocks.userFindFirst.mockResolvedValue({ id: "other" });
      await expect(
        editFaculty(admin, "target-1", {
          ...validInput,
          email: "taken@example.edu",
        }),
      ).rejects.toBeInstanceOf(FacultyConflictError);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });

  describe("status and deletion", () => {
    it("deactivates faculty, revokes sessions, and audits the change", async () => {
      mocks.userUpdate.mockResolvedValue({ id: "target-1", status: "INACTIVE" });
      await setFacultyStatus(admin, "target-1", "INACTIVE");

      expect(mocks.userUpdate).toHaveBeenCalledWith({
        where: { id: "target-1", role: "FACULTY", status: { not: "DELETED" } },
        data: { status: "INACTIVE", sessionVersion: { increment: 1 } },
      });
      expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "target-1" } });
      expect(mocks.auditCreate).toHaveBeenCalledWith({
        data: {
          actorUserId: admin.id,
          action: "faculty.deactivated",
          entityType: "User",
          entityId: "target-1",
        },
      });
    });

    it("soft-deletes faculty and preserves historical records", async () => {
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
});
