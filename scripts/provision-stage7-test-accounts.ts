/**
 * Stage 7 Release 1C/1D — provision isolated production test accounts.
 *
 * Creates dedicated STAGE7 test identities, classes and rosters without sending email.
 * Writes a Stage H-compatible credentials file outside the repository (mode 600).
 * Refuses to run if any target identity already exists.
 *
 * Required environment:
 *   DATABASE_URL
 *   STAGE7_CREDENTIAL_FILE=/absolute/path/outside/repo/credentials.json
 *   STAGE7_PROVISION_APPROVED=YES
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const ADMIN = {
  email: "stage7.test.admin@hausoc.org",
  name: "STAGE7 Test Administrator",
};
const FACULTY_A = {
  email: "stage7.test.faculty.a@hausoc.org",
  name: "STAGE7 Test Faculty A",
  employeeId: "STAGE7-FAC-A",
};
const FACULTY_B = {
  email: "stage7.test.faculty.b@hausoc.org",
  name: "STAGE7 Test Faculty B",
  employeeId: "STAGE7-FAC-B",
};
const STUDENT_A = {
  email: "stage7.test.student.a@hausoc.org",
  firstName: "STAGE7",
  lastName: "Test Student A",
  studentNumber: "STAGE7-STU-A",
};
const STUDENT_B = {
  email: "stage7.test.student.b@hausoc.org",
  firstName: "STAGE7",
  lastName: "Test Student B",
  studentNumber: "STAGE7-STU-B",
};
const COURSE_CODE = "STAGE7-CAP-001";
const COURSE_TITLE = "STAGE7 Test Application Development";
const TERM = "STAGE7 Test";
const ACADEMIC_YEAR = "2026-2027";

type CredentialsFile = {
  baseUrl: string;
  scope: "STAGEH";
  createdAt: string;
  admin: { email: string; password: string; userId: string };
  faculty: { email: string; password: string; userId: string; employeeId: string };
  student: {
    email: string;
    password: string;
    studentId: string;
    studentNumber: string;
    userId: string;
  };
  class: { id: string; courseCode: string; title: string };
  stage7: {
    facultyA: { email: string; password: string; userId: string; employeeId: string };
    facultyB: { email: string; password: string; userId: string; employeeId: string };
    studentA: {
      email: string;
      password: string;
      studentId: string;
      studentNumber: string;
      userId: string;
    };
    studentB: {
      email: string;
      password: string;
      studentId: string;
      studentNumber: string;
      userId: string;
    };
    classA: { id: string; courseCode: string; title: string };
    classB: { id: string; courseCode: string; title: string };
    course: { code: string; title: string };
    badge: { name: string };
  };
};

function password() {
  return randomBytes(36).toString("base64url");
}

function normalized(email: string) {
  return email.trim().toLowerCase();
}

function databaseUrl() {
  let raw = "";
  try {
    raw = readFileSync("/run/secrets/database_url", "utf8").trim();
  } catch {
    // fall through to the environment
  }
  if (!raw) raw = process.env.DATABASE_URL?.trim() ?? "";
  if (!raw) throw new Error("DATABASE_URL or /run/secrets/database_url is required");
  return raw;
}

function createClient() {
  const url = new URL(databaseUrl());
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
      connectTimeout: 10_000,
    }),
  });
}

async function ensureTarget(path: string) {
  if (!path || !isAbsolute(path)) {
    throw new Error("STAGE7_CREDENTIAL_FILE must be an absolute path");
  }
  const resolved = resolve(path);
  if (resolved === resolve(process.cwd()) || resolved.startsWith(`${resolve(process.cwd())}/`)) {
    throw new Error("STAGE7_CREDENTIAL_FILE must be outside the repository");
  }
  try {
    const existing = await stat(resolved);
    if (existing.isFile()) {
      throw new Error("STAGE7_CREDENTIAL_FILE already exists; refusing to overwrite");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(resolved), { recursive: true, mode: 0o700 });
  return resolved;
}

async function writeCredentials(path: string, data: CredentialsFile) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function main() {
  if (process.env.STAGE7_PROVISION_APPROVED !== "YES") {
    throw new Error("Set STAGE7_PROVISION_APPROVED=YES only after production write approval");
  }
  const credentialsPath = await ensureTarget(process.env.STAGE7_CREDENTIAL_FILE ?? "");
  const prisma = createClient();
  try {
    const emails = [
      ADMIN.email,
      FACULTY_A.email,
      FACULTY_B.email,
      STUDENT_A.email,
      STUDENT_B.email,
    ];
    const existingUsers = await prisma.user.findMany({
      where: { normalizedEmail: { in: emails.map(normalized) } },
      select: { email: true },
    });
    const existingStudents = await prisma.student.findMany({
      where: {
        OR: [
          { studentNumber: { in: [STUDENT_A.studentNumber, STUDENT_B.studentNumber] } },
          { email: { in: [STUDENT_A.email, STUDENT_B.email] } },
        ],
      },
      select: { studentNumber: true },
    });
    const existingClasses = await prisma.class.findMany({
      where: { courseCode: COURSE_CODE },
      select: { id: true },
    });
    const existingEmployees = await prisma.facultyProfile.findMany({
      where: { employeeId: { in: [FACULTY_A.employeeId, FACULTY_B.employeeId] } },
      select: { employeeId: true },
    });
    if (
      existingUsers.length ||
      existingStudents.length ||
      existingClasses.length ||
      existingEmployees.length
    ) {
      throw new Error(
        `STAGE7 test identities already exist (users=${existingUsers.length}, students=${existingStudents.length}, classes=${existingClasses.length}, employees=${existingEmployees.length}); review and clean up before reprovisioning`,
      );
    }

    const passwords = {
      admin: password(),
      facultyA: password(),
      facultyB: password(),
      studentA: password(),
      studentB: password(),
    };
    const hashes = {
      admin: await hash(passwords.admin, { type: 2 }),
      facultyA: await hash(passwords.facultyA, { type: 2 }),
      facultyB: await hash(passwords.facultyB, { type: 2 }),
      studentA: await hash(passwords.studentA, { type: 2 }),
      studentB: await hash(passwords.studentB, { type: 2 }),
    };

    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          name: ADMIN.name,
          email: ADMIN.email,
          normalizedEmail: normalized(ADMIN.email),
          passwordHash: hashes.admin,
          role: "ADMIN",
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "ADMIN_BOOTSTRAPPED",
          entityType: "User",
          entityId: admin.id,
          contextJson: { source: "stage7-test-provisioning" },
        },
      });

      async function createFaculty(input: typeof FACULTY_A) {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            normalizedEmail: normalized(input.email),
            passwordHash: input === FACULTY_A ? hashes.facultyA : hashes.facultyB,
            role: "FACULTY",
            status: "ACTIVE",
          },
          select: { id: true },
        });
        await tx.facultyProfile.create({
          data: {
            userId: user.id,
            employeeId: input.employeeId,
            title: "STAGE7 Temporary Test Account",
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: admin.id,
            action: "faculty.created",
            entityType: "User",
            entityId: user.id,
            contextJson: { source: "stage7-test-provisioning", employeeId: input.employeeId },
          },
        });
        return user;
      }

      const facultyA = await createFaculty(FACULTY_A);
      const facultyB = await createFaculty(FACULTY_B);

      async function createClass(ownerUserId: string, section: string) {
        const item = await tx.class.create({
          data: {
            ownerUserId,
            courseCode: COURSE_CODE,
            title: COURSE_TITLE,
            section,
            term: TERM,
            academicYear: ACADEMIC_YEAR,
            description:
              "Isolated STAGE7 production acceptance test class. Do not use for real students.",
          },
          select: { id: true, title: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: ownerUserId,
            action: "class.created",
            entityType: "Class",
            entityId: item.id,
            contextJson: { source: "stage7-test-provisioning", courseCode: COURSE_CODE },
          },
        });
        return item;
      }

      const classA = await createClass(facultyA.id, "A");
      const classB = await createClass(facultyB.id, "B");

      async function createStudent(
        input: typeof STUDENT_A,
        passwordHash: string,
        classId: string,
        facultyUserId: string,
      ) {
        const student = await tx.student.create({
          data: {
            studentNumber: input.studentNumber,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: admin.id,
            action: "student.created",
            entityType: "Student",
            entityId: student.id,
            contextJson: { source: "stage7-test-provisioning" },
          },
        });
        const user = await tx.user.create({
          data: {
            name: `${input.firstName} ${input.lastName}`,
            email: input.email,
            normalizedEmail: normalized(input.email),
            passwordHash,
            role: "STUDENT",
            status: "ACTIVE",
          },
          select: { id: true },
        });
        await tx.studentAccount.create({
          data: { userId: user.id, studentId: student.id, activatedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "student.account_activated",
            entityType: "Student",
            entityId: student.id,
            contextJson: { source: "stage7-test-provisioning" },
          },
        });
        await tx.classStudent.create({
          data: { classId, studentId: student.id, enrollmentStatus: "ACTIVE" },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: facultyUserId,
            action: "roster.student_added",
            entityType: "Class",
            entityId: classId,
            contextJson: { source: "stage7-test-provisioning", studentId: student.id },
          },
        });
        return { student, user };
      }

      const studentA = await createStudent(STUDENT_A, hashes.studentA, classA.id, facultyA.id);
      const studentB = await createStudent(STUDENT_B, hashes.studentB, classB.id, facultyB.id);

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "stage7.test_accounts_provisioned",
          entityType: "User",
          entityId: admin.id,
          contextJson: {
            source: "stage7-test-provisioning",
            adminUserId: admin.id,
            facultyAUserId: facultyA.id,
            facultyBUserId: facultyB.id,
            studentAUserId: studentA.user.id,
            studentBUserId: studentB.user.id,
            classAId: classA.id,
            classBId: classB.id,
          },
        },
      });

      return {
        admin,
        facultyA,
        facultyB,
        classA,
        classB,
        studentA,
        studentB,
      };
    });

    const credentials: CredentialsFile = {
      baseUrl: process.env.STAGE7_BASE_URL ?? "https://socbadging.hausoc.org",
      scope: "STAGEH",
      createdAt: new Date().toISOString(),
      admin: { email: ADMIN.email, password: passwords.admin, userId: result.admin.id },
      faculty: {
        email: FACULTY_A.email,
        password: passwords.facultyA,
        userId: result.facultyA.id,
        employeeId: FACULTY_A.employeeId,
      },
      student: {
        email: STUDENT_A.email,
        password: passwords.studentA,
        studentId: result.studentA.student.id,
        studentNumber: STUDENT_A.studentNumber,
        userId: result.studentA.user.id,
      },
      class: { id: result.classA.id, courseCode: COURSE_CODE, title: result.classA.title },
      stage7: {
        facultyA: {
          email: FACULTY_A.email,
          password: passwords.facultyA,
          userId: result.facultyA.id,
          employeeId: FACULTY_A.employeeId,
        },
        facultyB: {
          email: FACULTY_B.email,
          password: passwords.facultyB,
          userId: result.facultyB.id,
          employeeId: FACULTY_B.employeeId,
        },
        studentA: {
          email: STUDENT_A.email,
          password: passwords.studentA,
          studentId: result.studentA.student.id,
          studentNumber: STUDENT_A.studentNumber,
          userId: result.studentA.user.id,
        },
        studentB: {
          email: STUDENT_B.email,
          password: passwords.studentB,
          studentId: result.studentB.student.id,
          studentNumber: STUDENT_B.studentNumber,
          userId: result.studentB.user.id,
        },
        classA: { id: result.classA.id, courseCode: COURSE_CODE, title: result.classA.title },
        classB: { id: result.classB.id, courseCode: COURSE_CODE, title: result.classB.title },
        course: { code: COURSE_CODE, title: COURSE_TITLE },
        badge: { name: "STAGE7 Prelim Skills" },
      },
    };
    await writeCredentials(credentialsPath, credentials);

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "PASS",
          scope: "STAGE7",
          adminUserId: result.admin.id,
          facultyAUserId: result.facultyA.id,
          facultyBUserId: result.facultyB.id,
          studentAUserId: result.studentA.user.id,
          studentBUserId: result.studentB.user.id,
          classAId: result.classA.id,
          classBId: result.classB.id,
          credentialsFile: credentialsPath,
          emailSent: false,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "STAGE7 provisioning failed"}\n`,
  );
  process.exit(1);
});
