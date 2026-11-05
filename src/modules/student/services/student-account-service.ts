import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { hash, verify } from "argon2";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  requireRole,
  requireStudent,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const activationLifetimeMs = 24 * 60 * 60 * 1000;
const recoveryLifetimeMs = 30 * 60 * 1000;
const passwordSchema = z.string().min(14).max(200);
const identifierSchema = z.string().trim().min(1).max(191);
const tokenSchema = z.string().trim().min(20).max(200);

type StudentRecord = {
  id: string;
  studentNumber: string;
  email: string;
  firstName: string;
  lastName: string;
};

type LockedToken = {
  id: string;
  studentId: string;
  userId: string | null;
  type: "ACTIVATION" | "RECOVERY";
  expiresAt: Date;
  usedAt: Date | null;
};

export const studentAccountPageSizes = [5, 10, 25, 50] as const;
export type StudentAccountPageSize = (typeof studentAccountPageSizes)[number];
export type StudentAccountListStatus =
  "NOT_ACTIVATED" | "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type StudentAccountSort = "studentNumber" | "name" | "status";

export type StudentAccountListItem = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  accountStatus: "NOT_ACTIVATED" | "INVITED" | "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
  accountEmail: string | null;
  activatedAt: string | null;
};

export class StudentAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentAccountError";
  }
}

export class StudentConflictError extends Error {
  constructor(
    public readonly field: "studentNumber" | "email",
    message: string,
  ) {
    super(message);
    this.name = "StudentConflictError";
  }
}

const studentSchema = z.object({
  studentNumber: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(191),
  lastName: z.string().trim().min(1).max(191),
  email: z.email().transform((value) => value.trim()),
});

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashStudentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createStudentToken(): string {
  return randomBytes(32).toString("base64url");
}

function fullName(student: Pick<StudentRecord, "firstName" | "lastName">): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

async function lockStudent(tx: Prisma.TransactionClient, studentId: string) {
  const [student] = await tx.$queryRaw<StudentRecord[]>(Prisma.sql`
    SELECT id, student_number AS studentNumber, email, first_name AS firstName, last_name AS lastName
    FROM students
    WHERE id = ${studentId}
    FOR UPDATE
  `);
  return student ?? null;
}

async function lockUserByEmail(tx: Prisma.TransactionClient, normalizedEmail: string) {
  const [user] = await tx.$queryRaw<Array<{ id: string; role: string }>>(Prisma.sql`
    SELECT id, role
    FROM users
    WHERE normalized_email = ${normalizedEmail}
    FOR UPDATE
  `);
  return user ?? null;
}

type StudentListRecord = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  account: {
    userId: string;
    activatedAt: Date | null;
    user: { email: string; status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED" };
  } | null;
  tokens: Array<{ createdAt: Date; expiresAt: Date }>;
};

function activeInvitationWhere(now: Date): Prisma.StudentTokenWhereInput {
  return { type: "ACTIVATION", usedAt: null, expiresAt: { gt: now } };
}

function listStatusWhere(
  status: StudentAccountListStatus | undefined,
  now: Date,
): Prisma.StudentWhereInput {
  if (status === "NOT_ACTIVATED") {
    return { account: null, tokens: { none: activeInvitationWhere(now) } };
  }
  if (status === "INVITED") {
    return { account: null, tokens: { some: activeInvitationWhere(now) } };
  }
  if (status === "ACTIVE") {
    return { account: { user: { status: "ACTIVE" } } };
  }
  if (status === "SUSPENDED") {
    return { account: { user: { status: "SUSPENDED" } } };
  }
  if (status === "DEACTIVATED") {
    return { account: { user: { status: { in: ["INACTIVE", "DELETED"] } } } };
  }
  return {};
}

function listOrderBy(sort: StudentAccountSort): Prisma.StudentOrderByWithRelationInput[] {
  if (sort === "studentNumber") return [{ studentNumber: "asc" }, { id: "asc" }];
  if (sort === "status") {
    return [{ account: { user: { status: "asc" } } }, { studentNumber: "asc" }, { id: "asc" }];
  }
  return [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
}

function searchWhere(query: string): Prisma.StudentWhereInput {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return {};
  const fields = (term: string): Prisma.StudentWhereInput["OR"] => [
    { studentNumber: { contains: term } },
    { firstName: { contains: term } },
    { lastName: { contains: term } },
    { email: { contains: term } },
  ];
  return { AND: terms.map((term) => ({ OR: fields(term) })) };
}

function accountStatusOf(student: StudentListRecord): StudentAccountListItem["accountStatus"] {
  if (student.account?.user) return student.account.user.status;
  return student.tokens.length ? "INVITED" : "NOT_ACTIVATED";
}

export async function listStudentAccounts(
  actor: Actor | null | undefined,
  filters: {
    query?: string;
    status?: StudentAccountListStatus;
    sort?: StudentAccountSort;
    page?: number;
    pageSize?: StudentAccountPageSize;
  } = {},
): Promise<{
  items: StudentAccountListItem[];
  page: number;
  pageSize: StudentAccountPageSize;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}> {
  requireRole(actor, "ADMIN");
  const now = new Date();
  const pageSize = studentAccountPageSizes.includes(filters.pageSize ?? 5)
    ? (filters.pageSize ?? 5)
    : 5;
  const where: Prisma.StudentWhereInput = {
    ...searchWhere(filters.query ?? ""),
    ...listStatusWhere(filters.status, now),
  };
  const total = await prisma.student.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const rows = await prisma.student.findMany({
    where,
    select: {
      id: true,
      studentNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      account: {
        select: {
          userId: true,
          activatedAt: true,
          user: { select: { email: true, status: true } },
        },
      },
      tokens: {
        where: activeInvitationWhere(now),
        select: { createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: listOrderBy(filters.sort ?? "name"),
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: (rows as StudentListRecord[]).map((student) => ({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      accountStatus: accountStatusOf(student),
      accountEmail: student.account?.user.email ?? null,
      activatedAt: student.account?.activatedAt?.toISOString() ?? null,
    })),
    page: currentPage,
    pageSize,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
  };
}

export async function inviteStudentAccount(actor: Actor | null | undefined, studentId: string) {
  const administrator = requireRole(actor, "ADMIN");
  const id = identifierSchema.parse(studentId);
  return prisma.$transaction(async (tx) => {
    const student = await lockStudent(tx, id);
    if (!student) throw new StudentAccountError("Student record is unavailable");
    const existing = await tx.studentAccount.findUnique({
      where: { studentId: student.id },
      select: { id: true },
    });
    if (existing) throw new StudentAccountError("This student already has an account");
    const normalizedEmail = student.email.trim().toLowerCase();
    const existingUser = await lockUserByEmail(tx, normalizedEmail);
    if (existingUser) {
      throw new StudentAccountError(
        "A user with this email already exists. Administrator review is required.",
      );
    }
    await tx.studentToken.updateMany({
      where: { studentId: student.id, type: "ACTIVATION", usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = createStudentToken();
    const expiresAt = new Date(Date.now() + activationLifetimeMs);
    await tx.studentToken.create({
      data: {
        studentId: student.id,
        type: "ACTIVATION",
        tokenHash: hashStudentToken(token),
        expiresAt,
        createdByUserId: administrator.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "student.invitation_created",
        entityType: "Student",
        entityId: student.id,
        contextJson: { studentId: student.id },
      },
    });
    return {
      token,
      expiresAt,
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
      },
    };
  });
}

export async function createStudent(actor: Actor | null | undefined, raw: unknown) {
  const administrator = requireRole(actor, "ADMIN");
  const input = studentSchema.parse(raw);
  const existingNumber = await prisma.student.findUnique({
    where: { studentNumber: input.studentNumber },
    select: { id: true },
  });
  if (existingNumber) {
    throw new StudentConflictError(
      "studentNumber",
      "A student with this student number already exists.",
    );
  }
  const existingEmail = await prisma.student.findFirst({
    where: { email: input.email },
    select: { id: true },
  });
  if (existingEmail) {
    throw new StudentConflictError("email", "A student with this email already exists.");
  }
  const existingUser = await prisma.user.findUnique({
    where: { normalizedEmail: normalizedEmail(input.email) },
    select: { id: true },
  });
  if (existingUser) {
    throw new StudentConflictError(
      "email",
      "A user with this email already exists. Administrator review is required.",
    );
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        studentNumber: input.studentNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      },
      select: { id: true, studentNumber: true, firstName: true, lastName: true, email: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "student.created",
        entityType: "Student",
        entityId: student.id,
        contextJson: { studentId: student.id },
      },
    });
    return student;
  });
}

export async function editStudent(
  actor: Actor | null | undefined,
  studentId: string,
  raw: unknown,
) {
  const administrator = requireRole(actor, "ADMIN");
  const id = identifierSchema.parse(studentId);
  const input = studentSchema.parse(raw);
  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, account: { select: { userId: true } } },
  });
  if (!student) throw new StudentAccountError("Student record is unavailable");
  const existingNumber = await prisma.student.findFirst({
    where: { studentNumber: input.studentNumber, id: { not: id } },
    select: { id: true },
  });
  if (existingNumber) {
    throw new StudentConflictError(
      "studentNumber",
      "A student with this student number already exists.",
    );
  }
  const existingEmail = await prisma.student.findFirst({
    where: { email: input.email, id: { not: id } },
    select: { id: true },
  });
  if (existingEmail) {
    throw new StudentConflictError("email", "A student with this email already exists.");
  }
  const normalEmail = normalizedEmail(input.email);
  const conflictingUser = student.account
    ? await prisma.user.findFirst({
        where: { normalizedEmail: normalEmail, id: { not: student.account.userId } },
        select: { id: true },
      })
    : await prisma.user.findUnique({
        where: { normalizedEmail: normalEmail },
        select: { id: true },
      });
  if (conflictingUser) {
    throw new StudentConflictError(
      "email",
      "A user with this email already exists. Administrator review is required.",
    );
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id },
      data: {
        studentNumber: input.studentNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      },
      select: { id: true, studentNumber: true, firstName: true, lastName: true, email: true },
    });
    if (student.account) {
      await tx.user.update({
        where: { id: student.account.userId },
        data: {
          name: `${input.firstName} ${input.lastName}`.trim(),
          email: input.email,
          normalizedEmail: normalEmail,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.session.deleteMany({ where: { userId: student.account.userId } });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "student.updated",
        entityType: "Student",
        entityId: id,
        contextJson: { studentId: id },
      },
    });
    return updated;
  });
}

export async function deactivateStudentAccount(actor: Actor | null | undefined, studentId: string) {
  const administrator = requireRole(actor, "ADMIN");
  const id = identifierSchema.parse(studentId);
  return prisma.$transaction(async (tx) => {
    const account = await tx.studentAccount.findUnique({
      where: { studentId: id },
      select: { userId: true, user: { select: { role: true, status: true } } },
    });
    if (!account || account.user.role !== "STUDENT") {
      throw new StudentAccountError("Student portal account is unavailable");
    }
    if (account.user.status === "DELETED") {
      return { userId: account.userId, status: "DELETED" as const };
    }
    await tx.user.update({
      where: { id: account.userId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: account.userId } });
    await tx.studentToken.updateMany({
      where: { studentId: id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: "student.account_deleted",
        entityType: "Student",
        entityId: id,
        contextJson: { studentId: id },
      },
    });
    return { userId: account.userId, status: "DELETED" as const };
  });
}

export async function activateStudentAccount(rawToken: string, rawPassword: string) {
  const token = tokenSchema.parse(rawToken);
  const password = passwordSchema.parse(rawPassword);
  const tokenHash = hashStudentToken(token);
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<(LockedToken & StudentRecord)[]>(Prisma.sql`
      SELECT st.id, st.student_id AS studentId, st.user_id AS userId, st.type,
        st.expires_at AS expiresAt, st.used_at AS usedAt,
        s.student_number AS studentNumber, s.first_name AS firstName,
        s.last_name AS lastName, s.email
      FROM student_tokens st
      INNER JOIN students s ON s.id = st.student_id
      WHERE st.token_hash = ${tokenHash}
      FOR UPDATE
    `);
    if (!row || row.type !== "ACTIVATION" || row.usedAt !== null || row.expiresAt <= new Date()) {
      throw new StudentAccountError("Activation link is invalid or expired");
    }
    const existing = await tx.studentAccount.findUnique({
      where: { studentId: row.studentId },
      select: { id: true },
    });
    if (existing) throw new StudentAccountError("This student account is already active");
    const normalizedEmail = row.email.trim().toLowerCase();
    const existingUser = await lockUserByEmail(tx, normalizedEmail);
    if (existingUser) {
      throw new StudentAccountError(
        "A user with this email already exists. Administrator review is required.",
      );
    }
    const passwordHash = await hash(password, { type: 2 });
    const user = await tx.user.create({
      data: {
        name: fullName(row),
        email: row.email,
        normalizedEmail,
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    await tx.studentAccount.create({
      data: { userId: user.id, studentId: row.studentId, activatedAt: new Date() },
    });
    await tx.studentToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "student.account_activated",
        entityType: "Student",
        entityId: row.studentId,
        contextJson: { studentId: row.studentId },
      },
    });
    return { userId: user.id, studentId: row.studentId };
  });
}

export async function requestStudentRecovery(rawIdentifier: string) {
  const identifier = identifierSchema.parse(rawIdentifier);
  const normalized = identifier.toLowerCase();
  const student = await prisma.student.findFirst({
    where: {
      OR: [{ studentNumber: identifier }, { email: normalized }],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      account: { select: { userId: true } },
    },
  });
  if (!student?.account) return null;
  const accountUserId = student.account.userId;
  return prisma.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<Array<{ id: string; role: string; status: string }>>(
      Prisma.sql`
        SELECT id, role, status FROM users WHERE id = ${accountUserId} FOR UPDATE
      `,
    );
    if (!user || user.role !== "STUDENT" || user.status !== "ACTIVE") return null;
    await tx.studentToken.updateMany({
      where: { studentId: student.id, type: "RECOVERY", usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = createStudentToken();
    const expiresAt = new Date(Date.now() + recoveryLifetimeMs);
    await tx.studentToken.create({
      data: {
        studentId: student.id,
        userId: user.id,
        type: "RECOVERY",
        tokenHash: hashStudentToken(token),
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "student.recovery_requested",
        entityType: "Student",
        entityId: student.id,
        contextJson: { studentId: student.id },
      },
    });
    return {
      token,
      expiresAt,
      studentId: student.id,
      email: student.email,
      firstName: student.firstName,
    };
  });
}

export async function resetStudentPassword(rawToken: string, rawPassword: string) {
  const token = tokenSchema.parse(rawToken);
  const password = passwordSchema.parse(rawPassword);
  const tokenHash = hashStudentToken(token);
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      Array<LockedToken & { role: string; status: string }>
    >(Prisma.sql`
      SELECT st.id, st.student_id AS studentId, st.user_id AS userId, st.type,
        st.expires_at AS expiresAt, st.used_at AS usedAt, u.role, u.status
      FROM student_tokens st
      INNER JOIN users u ON u.id = st.user_id
      WHERE st.token_hash = ${tokenHash}
      FOR UPDATE
    `);
    if (
      !row ||
      row.type !== "RECOVERY" ||
      row.usedAt !== null ||
      row.expiresAt <= new Date() ||
      row.role !== "STUDENT" ||
      row.status !== "ACTIVE" ||
      !row.userId
    ) {
      throw new StudentAccountError("Recovery link is invalid or expired");
    }
    const passwordHash = await hash(password, { type: 2 });
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.studentToken.updateMany({
      where: { studentId: row.studentId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: row.userId,
        action: "student.password_reset",
        entityType: "Student",
        entityId: row.studentId,
        contextJson: { studentId: row.studentId },
      },
    });
    return { userId: row.userId, studentId: row.studentId };
  });
}

type ResetEligibleStudent = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  account: {
    userId: string;
    user: {
      id: string;
      role: "ADMIN" | "FACULTY" | "STUDENT";
      status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
      deletedAt: Date | null;
    };
  };
};

async function loadEligibleStudentForReset(
  actor: Actor | null | undefined,
  studentId: string,
  classId?: string,
) {
  const authenticated = requireRole(actor, ["ADMIN", "FACULTY"]);
  const id = identifierSchema.parse(studentId);
  const actorRecord = await prisma.user.findUnique({
    where: { id: authenticated.id },
    select: {
      id: true,
      role: true,
      status: true,
      deletedAt: true,
      passwordHash: true,
    },
  });
  if (!actorRecord || actorRecord.status !== "ACTIVE" || actorRecord.deletedAt !== null) {
    throw new AuthorizationError("Active account required");
  }

  const student = (await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      studentNumber: true,
      account: {
        select: {
          userId: true,
          user: { select: { id: true, role: true, status: true, deletedAt: true } },
        },
      },
    },
  })) as ResetEligibleStudent | null;

  if (!student) throw new StudentAccountError("Student record is unavailable");
  if (!student.account || student.account.user.role !== "STUDENT") {
    throw new StudentAccountError(
      "Student portal account is unavailable. Use the activation workflow.",
    );
  }
  if (student.account.user.status !== "ACTIVE" || student.account.user.deletedAt !== null) {
    throw new StudentAccountError(
      "Student portal account is not active. Reactivate it before resetting the password.",
    );
  }

  if (authenticated.role === "FACULTY") {
    const enrollment = await prisma.classStudent.findFirst({
      where: {
        studentId: id,
        enrollmentStatus: "ACTIVE",
        class: {
          ownerUserId: authenticated.id,
          ...(classId ? { id: classId } : {}),
        },
      },
      select: { classId: true },
    });
    if (!enrollment) {
      throw new AuthorizationError("Student is not enrolled in your class");
    }
  }

  return { authenticated, actorRecord, student };
}

export async function directResetStudentPassword(
  actor: Actor | null | undefined,
  studentId: string,
  rawPassword: string,
  actorPassword: string,
  options: { classId?: string } = {},
) {
  const { authenticated, actorRecord, student } = await loadEligibleStudentForReset(
    actor,
    studentId,
    options.classId,
  );
  const password = passwordSchema.parse(rawPassword);
  const actorPasswordMatches = await verify(
    actorRecord.passwordHash,
    String(actorPassword ?? ""),
  ).catch(() => false);
  if (!actorPasswordMatches) {
    throw new StudentAccountError("Your current password is incorrect.");
  }

  const passwordHash = await hash(password, { type: 2 });
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: student.account.user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: student.account.user.id } });
    await tx.studentToken.updateMany({
      where: { studentId: student.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: authenticated.id,
        action: "student.password_reset_direct",
        entityType: "Student",
        entityId: student.id,
        contextJson: {
          studentId: student.id,
          scope: authenticated.role === "FACULTY" ? "faculty" : "admin",
          ...(options.classId ? { classId: options.classId } : {}),
        },
      },
    });
    return { userId: student.account.user.id, studentId: student.id };
  });
}

export async function requestStudentPasswordResetLink(
  actor: Actor | null | undefined,
  studentId: string,
  options: { classId?: string } = {},
) {
  const { authenticated, student } = await loadEligibleStudentForReset(
    actor,
    studentId,
    options.classId,
  );
  const token = createStudentToken();
  const expiresAt = new Date(Date.now() + recoveryLifetimeMs);

  return prisma.$transaction(async (tx) => {
    await tx.studentToken.updateMany({
      where: { studentId: student.id, type: "RECOVERY", usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.studentToken.create({
      data: {
        studentId: student.id,
        userId: student.account.user.id,
        type: "RECOVERY",
        tokenHash: hashStudentToken(token),
        expiresAt,
        createdByUserId: authenticated.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: authenticated.id,
        action: "student.password_reset_link_requested",
        entityType: "Student",
        entityId: student.id,
        contextJson: {
          studentId: student.id,
          scope: authenticated.role === "FACULTY" ? "faculty" : "admin",
          ...(options.classId ? { classId: options.classId } : {}),
        },
      },
    });
    return {
      token,
      expiresAt,
      student: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        studentNumber: student.studentNumber,
      },
    };
  });
}

export async function completeRequiredPasswordChange(
  actor: Actor | null | undefined,
  currentPassword: string,
  rawPassword: string,
) {
  const studentActor = requireStudent(actor);
  const password = passwordSchema.parse(rawPassword);
  const user = await prisma.user.findUnique({
    where: { id: studentActor.id },
    select: {
      id: true,
      role: true,
      status: true,
      deletedAt: true,
      passwordHash: true,
      mustChangePassword: true,
      studentAccount: { select: { studentId: true } },
    },
  });
  if (
    !user ||
    user.role !== "STUDENT" ||
    user.status !== "ACTIVE" ||
    user.deletedAt !== null ||
    !user.studentAccount
  ) {
    throw new AuthorizationError("Active student account required");
  }
  if (!user.mustChangePassword) {
    throw new StudentAccountError("A password change is not required for this account");
  }
  const currentPasswordMatches = await verify(
    user.passwordHash,
    String(currentPassword ?? ""),
  ).catch(() => false);
  if (!currentPasswordMatches) {
    throw new StudentAccountError("Your current password is incorrect.");
  }
  const passwordHash = await hash(password, { type: 2 });
  const studentId = user.studentAccount.studentId;
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.studentToken.updateMany({
      where: { studentId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "student.password_changed",
        entityType: "Student",
        entityId: studentId,
        contextJson: { studentId },
      },
    });
    return { userId: user.id, studentId };
  });
}

export async function setStudentAccountStatus(
  actor: Actor | null | undefined,
  studentId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const administrator = requireRole(actor, "ADMIN");
  const id = identifierSchema.parse(studentId);
  return prisma.$transaction(async (tx) => {
    const account = await tx.studentAccount.findUnique({
      where: { studentId: id },
      select: { userId: true },
    });
    if (!account) throw new StudentAccountError("Student account is unavailable");
    const [user] = await tx.$queryRaw<Array<{ id: string; role: string }>>(Prisma.sql`
      SELECT id, role FROM users WHERE id = ${account.userId} FOR UPDATE
    `);
    if (!user || user.role !== "STUDENT") {
      throw new StudentAccountError("Student account is unavailable");
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        status,
        ...(status === "ACTIVE" ? { deletedAt: null } : {}),
        sessionVersion: { increment: 1 },
      },
    });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: administrator.id,
        action: status === "ACTIVE" ? "student.account_reactivated" : "student.account_suspended",
        entityType: "Student",
        entityId: id,
        contextJson: { studentId: id },
      },
    });
    return { userId: user.id, status };
  });
}

export async function getStudentAccountForActor(actor: Actor | null | undefined) {
  const studentActor = requireStudent(actor);
  const account = await prisma.studentAccount.findUnique({
    where: { userId: studentActor.id },
    include: {
      student: true,
      user: { select: { id: true, name: true, email: true, status: true } },
    },
  });
  if (!account) throw new AuthorizationError("Student account is unavailable");
  return account;
}

export async function getStudentActivationInfo(rawToken: string) {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  const token = await prisma.studentToken.findUnique({
    where: { tokenHash: hashStudentToken(parsed.data) },
    include: { student: { include: { account: { select: { id: true } } } } },
  });
  if (
    !token ||
    token.type !== "ACTIVATION" ||
    token.usedAt !== null ||
    token.expiresAt <= new Date() ||
    token.student.account
  ) {
    return null;
  }
  return {
    firstName: token.student.firstName,
    lastName: token.student.lastName,
    email: token.student.email,
    expiresAt: token.expiresAt,
  };
}

export async function getStudentRecoveryInfo(rawToken: string) {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  const token = await prisma.studentToken.findUnique({
    where: { tokenHash: hashStudentToken(parsed.data) },
    include: { student: true, user: { select: { status: true, role: true } } },
  });
  if (
    !token ||
    token.type !== "RECOVERY" ||
    token.usedAt !== null ||
    token.expiresAt <= new Date() ||
    !token.user ||
    token.user.role !== "STUDENT" ||
    token.user.status !== "ACTIVE"
  ) {
    return null;
  }
  return { firstName: token.student.firstName, expiresAt: token.expiresAt };
}
