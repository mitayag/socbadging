import { hash, verify } from "argon2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import {
  activateStudentAccount,
  createStudent,
  deactivateStudentAccount,
  editStudent,
  inviteStudentAccount,
  listStudentAccounts,
  completeRequiredPasswordChange,
  directResetStudentPassword,
  requestStudentPasswordResetLink,
  requestStudentRecovery,
  resetStudentPassword,
  setStudentAccountStatus,
  StudentAccountError,
  StudentConflictError,
} from "./student-account-service";

const prefix = "student-account-integration-";
const admin: Actor = {
  id: `${prefix}admin`,
  name: "Student Account Admin",
  email: `${prefix}admin@example.test`,
  role: "ADMIN",
};
const studentId = `${prefix}student`;
const studentEmail = `${prefix}student@example.test`;
const createdStudentEmail = `${prefix}created@example.test`;
const faculty: Actor = {
  id: `${prefix}faculty`,
  name: "Student Account Faculty",
  email: `${prefix}faculty@example.test`,
  role: "FACULTY",
};
const unassignedFaculty: Actor = {
  id: `${prefix}unassigned-faculty`,
  name: "Unassigned Faculty",
  email: `${prefix}unassigned-faculty@example.test`,
  role: "FACULTY",
};
const resetClassId = `${prefix}reset-class`;
const adminPassword = "Admin-Password-2026!";
const facultyPassword = "Faculty-Password-2026!";
const unassignedFacultyPassword = "Unassigned-Password-2026!";

async function cleanup() {
  const students = await prisma.student.findMany({
    where: {
      OR: [{ studentNumber: { startsWith: prefix } }, { email: { startsWith: prefix } }],
    },
    select: { id: true },
  });
  const studentIds = students.map((student) => student.id);
  const accounts = await prisma.studentAccount.findMany({
    where: { studentId: { in: studentIds } },
    select: { userId: true },
  });
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { id: admin.id },
        { email: { startsWith: prefix } },
        { id: { in: accounts.map((account) => account.userId) } },
      ],
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: { in: userIds } }, { entityId: { in: studentIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.studentToken.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.classStudent.deleteMany({ where: { classId: resetClassId } });
  await prisma.class.deleteMany({ where: { id: resetClassId } });
  await prisma.studentAccount.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
}

beforeEach(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      normalizedEmail: admin.email,
      passwordHash: await hash(adminPassword, { type: 2 }),
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: faculty.id,
        name: faculty.name,
        email: faculty.email,
        normalizedEmail: faculty.email,
        passwordHash: await hash(facultyPassword, { type: 2 }),
        role: "FACULTY",
        status: "ACTIVE",
      },
      {
        id: unassignedFaculty.id,
        name: unassignedFaculty.name,
        email: unassignedFaculty.email,
        normalizedEmail: unassignedFaculty.email,
        passwordHash: await hash(unassignedFacultyPassword, { type: 2 }),
        role: "FACULTY",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.class.create({
    data: {
      id: resetClassId,
      ownerUserId: faculty.id,
      courseCode: "RESET-101",
      title: "Password Reset Class",
      section: "A",
      term: "Test",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      studentNumber: `${prefix}number`,
      firstName: "Portal",
      lastName: "Student",
      email: studentEmail,
    },
  });
  await prisma.classStudent.create({
    data: { classId: resetClassId, studentId, enrollmentStatus: "ACTIVE" },
  });
});
afterEach(cleanup);

describe("student account lifecycle with MariaDB", () => {
  it("invites, activates, and prevents activation replay", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    expect(activated.studentId).toBe(studentId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { role: true, status: true, email: true, passwordHash: true },
    });
    expect(user).toMatchObject({ role: "STUDENT", status: "ACTIVE", email: studentEmail });
    await expect(verify(user.passwordHash, "Student-Password-2026!")).resolves.toBe(true);
    await expect(prisma.studentAccount.findUnique({ where: { studentId } })).resolves.toMatchObject(
      { userId: activated.userId },
    );
    await expect(
      activateStudentAccount(invitation.token, "Another-Password-2026!"),
    ).rejects.toBeInstanceOf(StudentAccountError);
  });

  it("rejects expired activation tokens", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    await prisma.studentToken.updateMany({
      where: { studentId, type: "ACTIVATION" },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      activateStudentAccount(invitation.token, "Student-Password-2026!"),
    ).rejects.toThrow("Activation link is invalid or expired");
  });

  it("rejects invitation when the student email is already used by another user", async () => {
    await prisma.user.create({
      data: {
        id: `${prefix}conflict`,
        name: "Existing User",
        email: studentEmail,
        normalizedEmail: studentEmail,
        passwordHash: "not-used-by-integration-test",
        role: "FACULTY",
        status: "ACTIVE",
      },
    });
    await expect(inviteStudentAccount(admin, studentId)).rejects.toThrow(
      "A user with this email already exists",
    );
  });

  it("issues a single-use recovery token, resets the password, and invalidates sessions", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await prisma.session.create({
      data: {
        id: `${prefix}session`,
        sessionToken: `${prefix}session-token`,
        userId: activated.userId,
        expires: new Date(Date.now() + 60_000),
      },
    });
    const recovery = await requestStudentRecovery(studentEmail);
    expect(recovery?.email).toBe(studentEmail);
    await resetStudentPassword(recovery!.token, "Student-Password-2027!");
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { passwordHash: true },
    });
    await expect(verify(user.passwordHash, "Student-Password-2027!")).resolves.toBe(true);
    await expect(resetStudentPassword(recovery!.token, "Student-Password-2028!")).rejects.toThrow(
      "Recovery link is invalid or expired",
    );
  });

  it("suspends a student account and removes active sessions", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await prisma.session.create({
      data: {
        id: `${prefix}suspend-session`,
        sessionToken: `${prefix}suspend-token`,
        userId: activated.userId,
        expires: new Date(Date.now() + 60_000),
      },
    });
    await setStudentAccountStatus(admin, studentId, "SUSPENDED");
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: activated.userId }, select: { status: true } }),
    ).resolves.toEqual({ status: "SUSPENDED" });
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
  });

  it("rejects Faculty actors from student management operations", async () => {
    await expect(listStudentAccounts(faculty, {})).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createStudent(faculty, {
        studentNumber: `${prefix}faculty-number`,
        firstName: "Faculty",
        lastName: "Actor",
        email: `${prefix}faculty-actor@example.test`,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      editStudent(faculty, studentId, {
        studentNumber: `${prefix}faculty-edit`,
        firstName: "Faculty",
        lastName: "Edit",
        email: `${prefix}faculty-edit@example.test`,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deactivateStudentAccount(faculty, studentId)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(setStudentAccountStatus(faculty, studentId, "SUSPENDED")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("creates, searches, sorts, filters, and paginates student records", async () => {
    const created = await createStudent(admin, {
      studentNumber: `${prefix}created-number`,
      firstName: "Created",
      lastName: "Student",
      email: createdStudentEmail,
    });

    const all = await listStudentAccounts(admin, { query: prefix, pageSize: 10 });
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.studentId)).toEqual(
      expect.arrayContaining([studentId, created.id]),
    );

    const byName = await listStudentAccounts(admin, { query: "Created", pageSize: 10 });
    expect(byName.items.map((item) => item.studentId)).toEqual([created.id]);
    const byNumber = await listStudentAccounts(admin, {
      query: `${prefix}created-number`,
      pageSize: 10,
    });
    expect(byNumber.items.map((item) => item.studentId)).toEqual([created.id]);

    const notActivated = await listStudentAccounts(admin, {
      query: prefix,
      status: "NOT_ACTIVATED",
      pageSize: 10,
    });
    expect(notActivated.total).toBe(2);

    for (let index = 0; index < 6; index += 1) {
      await createStudent(admin, {
        studentNumber: `${prefix}bulk-${index}`,
        firstName: "Bulk",
        lastName: `Student${index}`,
        email: `${prefix}bulk-${index}@example.test`,
      });
    }
    const firstPage = await listStudentAccounts(admin, {
      query: `${prefix}bulk-`,
      pageSize: 5,
    });
    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.total).toBe(6);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.hasNext).toBe(true);
    const secondPage = await listStudentAccounts(admin, {
      query: `${prefix}bulk-`,
      pageSize: 5,
      page: 2,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.hasPrevious).toBe(true);

    const sorted = await listStudentAccounts(admin, {
      query: `${prefix}bulk-`,
      sort: "studentNumber",
      pageSize: 10,
    });
    const numbers = sorted.items.map((item) => item.studentNumber);
    expect(numbers).toEqual([...numbers].sort());

    await inviteStudentAccount(admin, created.id);
    const invited = await listStudentAccounts(admin, {
      query: createdStudentEmail,
      status: "INVITED",
      pageSize: 10,
    });
    expect(invited.items.map((item) => item.studentId)).toEqual([created.id]);
    const stillNotActivated = await listStudentAccounts(admin, {
      query: studentEmail,
      status: "NOT_ACTIVATED",
      pageSize: 10,
    });
    expect(stillNotActivated.items.map((item) => item.studentId)).toEqual([studentId]);
  });

  it("rejects duplicate student numbers and emails on create", async () => {
    await expect(
      createStudent(admin, {
        studentNumber: `${prefix}number`,
        firstName: "Duplicate",
        lastName: "Number",
        email: `${prefix}duplicate-number@example.test`,
      }),
    ).rejects.toBeInstanceOf(StudentConflictError);
    await expect(
      createStudent(admin, {
        studentNumber: `${prefix}duplicate-email-number`,
        firstName: "Duplicate",
        lastName: "Email",
        email: studentEmail,
      }),
    ).rejects.toBeInstanceOf(StudentConflictError);
  });

  it("edits student details and enforces uniqueness", async () => {
    const updated = await editStudent(admin, studentId, {
      studentNumber: `${prefix}edited-number`,
      firstName: "Edited",
      lastName: "Student",
      email: `${prefix}edited@example.test`,
    });
    expect(updated).toMatchObject({
      id: studentId,
      studentNumber: `${prefix}edited-number`,
      firstName: "Edited",
      lastName: "Student",
      email: `${prefix}edited@example.test`,
    });
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.updated", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();

    await createStudent(admin, {
      studentNumber: `${prefix}other-number`,
      firstName: "Other",
      lastName: "Student",
      email: `${prefix}other@example.test`,
    });
    await expect(
      editStudent(admin, studentId, {
        studentNumber: `${prefix}other-number`,
        firstName: "Edited",
        lastName: "Student",
        email: `${prefix}edited@example.test`,
      }),
    ).rejects.toBeInstanceOf(StudentConflictError);
    await expect(
      editStudent(admin, studentId, {
        studentNumber: `${prefix}edited-number`,
        firstName: "Edited",
        lastName: "Student",
        email: `${prefix}other@example.test`,
      }),
    ).rejects.toBeInstanceOf(StudentConflictError);
  });

  it("deactivates a portal account without deleting the student record and reactivates it", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await prisma.session.create({
      data: {
        id: `${prefix}delete-session`,
        sessionToken: `${prefix}delete-session-token`,
        userId: activated.userId,
        expires: new Date(Date.now() + 60_000),
      },
    });
    await expect(inviteStudentAccount(admin, studentId)).rejects.toThrow("already has an account");

    await deactivateStudentAccount(admin, studentId);

    const deactivated = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { status: true, deletedAt: true },
    });
    expect(deactivated.status).toBe("DELETED");
    expect(deactivated.deletedAt).not.toBeNull();
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
    await expect(prisma.student.findUnique({ where: { id: studentId } })).resolves.not.toBeNull();
    await expect(
      prisma.studentAccount.findUnique({ where: { studentId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.account_deleted", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();

    await setStudentAccountStatus(admin, studentId, "ACTIVE");
    const reactivated = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { status: true, deletedAt: true },
    });
    expect(reactivated.status).toBe("ACTIVE");
    expect(reactivated.deletedAt).toBeNull();
    const deactivatedList = await listStudentAccounts(admin, {
      query: prefix,
      status: "DEACTIVATED",
      pageSize: 10,
    });
    expect(deactivatedList.total).toBe(0);
  });

  it("directly resets a password with reauthentication, forced change, session invalidation, and audit", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await prisma.session.create({
      data: {
        id: `${prefix}direct-session`,
        sessionToken: `${prefix}direct-session-token`,
        userId: activated.userId,
        expires: new Date(Date.now() + 60_000),
      },
    });
    await requestStudentPasswordResetLink(admin, studentId);

    await directResetStudentPassword(admin, studentId, "Student-New-Password-2026!", adminPassword);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    await expect(verify(user.passwordHash, "Student-New-Password-2026!")).resolves.toBe(true);
    await expect(verify(user.passwordHash, "Student-Password-2026!")).resolves.toBe(false);
    expect(user.mustChangePassword).toBe(true);
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
    const tokens = await prisma.studentToken.findMany({
      where: { studentId, usedAt: null },
      select: { id: true },
    });
    expect(tokens).toHaveLength(0);
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.password_reset_direct", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();

    await expect(
      directResetStudentPassword(
        admin,
        studentId,
        "Another-Student-Password-2026!",
        "wrong-current-password",
      ),
    ).rejects.toThrow("current password");
  });

  it("allows assigned Faculty and rejects unassigned Faculty and wrong class scope", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");

    await directResetStudentPassword(
      faculty,
      studentId,
      "Faculty-Reset-Password-2026!",
      facultyPassword,
      { classId: resetClassId },
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { passwordHash: true },
    });
    await expect(verify(user.passwordHash, "Faculty-Reset-Password-2026!")).resolves.toBe(true);

    await expect(
      directResetStudentPassword(
        unassignedFaculty,
        studentId,
        "Unassigned-Reset-Password-2026!",
        unassignedFacultyPassword,
        { classId: resetClassId },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      directResetStudentPassword(
        faculty,
        studentId,
        "Wrong-Class-Password-2026!",
        facultyPassword,
        { classId: "not-the-owned-class" },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("does not bypass non-activated, suspended, or deactivated account restrictions", async () => {
    await expect(
      directResetStudentPassword(admin, studentId, "Not-Activated-Password-2026!", adminPassword),
    ).rejects.toThrow("activation workflow");

    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await setStudentAccountStatus(admin, studentId, "SUSPENDED");
    await expect(
      directResetStudentPassword(admin, studentId, "Suspended-Password-2026!", adminPassword),
    ).rejects.toThrow("not active");

    await deactivateStudentAccount(admin, studentId);
    await expect(
      directResetStudentPassword(admin, studentId, "Deactivated-Password-2026!", adminPassword),
    ).rejects.toThrow("not active");
    expect(activated.userId).toBeTruthy();
  });

  it("issues a 30-minute single-use reset link and completes the reset", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await prisma.session.create({
      data: {
        id: `${prefix}email-reset-session`,
        sessionToken: `${prefix}email-reset-token`,
        userId: activated.userId,
        expires: new Date(Date.now() + 60_000),
      },
    });

    const first = await requestStudentPasswordResetLink(admin, studentId);
    const lifetime = first.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(29 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(30 * 60 * 1000 + 5_000);
    const stored = await prisma.studentToken.findFirst({
      where: { studentId, type: "RECOVERY" },
      orderBy: { createdAt: "desc" },
      select: { tokenHash: true },
    });
    expect(stored?.tokenHash).not.toBe(first.token);

    const second = await requestStudentPasswordResetLink(admin, studentId);
    await expect(resetStudentPassword(first.token, "First-Email-Password-2026!")).rejects.toThrow(
      "invalid or expired",
    );

    await resetStudentPassword(second.token, "Email-Reset-Password-2026!");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    await expect(verify(user.passwordHash, "Email-Reset-Password-2026!")).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(false);
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
    await expect(resetStudentPassword(second.token, "Reuse-Email-Password-2026!")).rejects.toThrow(
      "invalid or expired",
    );
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.password_reset_link_requested", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.password_reset", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();
  });

  it("completes a forced password change with current-password reauthentication", async () => {
    const invitation = await inviteStudentAccount(admin, studentId);
    const activated = await activateStudentAccount(invitation.token, "Student-Password-2026!");
    await directResetStudentPassword(admin, studentId, "Temporary-Password-2026!", adminPassword);
    const studentActor: Actor = {
      id: activated.userId,
      name: "Portal Student",
      email: studentEmail,
      role: "STUDENT",
      mustChangePassword: true,
    };

    await expect(
      completeRequiredPasswordChange(
        studentActor,
        "Wrong-Current-Password-2026!",
        "Final-Password-2026!",
      ),
    ).rejects.toThrow("current password");

    await completeRequiredPasswordChange(
      studentActor,
      "Temporary-Password-2026!",
      "Final-Password-2026!",
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: activated.userId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    await expect(verify(user.passwordHash, "Final-Password-2026!")).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(false);
    await expect(prisma.session.count({ where: { userId: activated.userId } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "student.password_changed", entityId: studentId },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();
  });
});
