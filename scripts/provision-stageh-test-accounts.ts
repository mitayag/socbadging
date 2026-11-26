import { randomBytes } from "node:crypto";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { bootstrapAdministrator } from "../src/modules/identity/services/bootstrap-administrator";
import type { Actor, Role } from "../src/modules/identity/types";
import { createClass } from "../src/modules/classes/services/class-service";
import { createFaculty } from "../src/modules/faculty/services/faculty-service";
import { addStudent } from "../src/modules/rosters/services/roster-service";
import { prisma } from "../src/platform/db/prisma";
import {
  activateStudentAccount,
  createStudent,
  inviteStudentAccount,
} from "../src/modules/student/services/student-account-service";

const ADMIN_EMAIL = "test.admin@hausoc.org";
const FACULTY_EMAIL = "test.faculty@hausoc.org";
const STUDENT_EMAIL = "authorized-test-recipient@example.org";
const STUDENT_NUMBER = "STAGEH-STU-001";
const EMPLOYEE_ID = "STAGEH-FAC-001";
const CLASS_CODE = "STAGEH-ISO-001";

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
};

function password(): string {
  return randomBytes(36).toString("base64url");
}

function actorFor(user: { id: string; name: string; email: string; role: Role }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role } satisfies Actor;
}

async function ensureCredentialsTarget(path: string): Promise<void> {
  if (!path || !isAbsolute(path)) {
    throw new Error("STAGEH_CREDENTIAL_FILE must be an absolute path outside the repository");
  }
  const resolved = resolve(path);
  if (resolved === resolve(process.cwd()) || resolved.startsWith(`${resolve(process.cwd())}/`)) {
    throw new Error("STAGEH_CREDENTIAL_FILE must not be inside the project working tree");
  }
  try {
    const existing = await stat(resolved);
    if (existing.isFile() && process.env.STAGEH_REPLACE_CREDENTIALS !== "YES") {
      throw new Error(
        "STAGEH_CREDENTIAL_FILE already exists; set STAGEH_REPLACE_CREDENTIALS=YES to replace",
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(resolved), { recursive: true, mode: 0o700 });
}

async function writeCredentials(path: string, data: CredentialsFile): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function main() {
  if (process.env.STAGEH_PROVISION_APPROVED !== "YES") {
    throw new Error("Set STAGEH_PROVISION_APPROVED=YES only after production write approval");
  }
  const credentialsPath = process.env.STAGEH_CREDENTIAL_FILE;
  if (!credentialsPath) throw new Error("STAGEH_CREDENTIAL_FILE is required");
  await ensureCredentialsTarget(credentialsPath);

  const existingAdmin = await prisma.user.findUnique({ where: { normalizedEmail: ADMIN_EMAIL } });
  const existingFaculty = await prisma.user.findUnique({
    where: { normalizedEmail: FACULTY_EMAIL },
  });
  const existingStudentUser = await prisma.user.findUnique({
    where: { normalizedEmail: STUDENT_EMAIL },
  });
  const existingStudent = await prisma.student.findFirst({
    where: { OR: [{ studentNumber: STUDENT_NUMBER }, { email: STUDENT_EMAIL }] },
  });
  const existingClass = await prisma.class.findFirst({ where: { courseCode: CLASS_CODE } });
  if (existingAdmin || existingFaculty || existingStudentUser || existingStudent || existingClass) {
    throw new Error(
      "STAGEH test identity/class already exists; stop and review cleanup before reprovisioning",
    );
  }

  const adminPassword = password();
  const facultyPassword = password();
  const studentPassword = password();

  const bootstrap = await bootstrapAdministrator(
    {
      findByEmail: (email) =>
        prisma.user.findUnique({ where: { normalizedEmail: email }, select: { id: true } }),
      createAdministrator: (input) =>
        prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              ...input,
              normalizedEmail: input.email,
              role: "ADMIN",
              status: "ACTIVE",
            },
            select: { id: true, name: true, email: true, role: true },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "ADMIN_BOOTSTRAPPED",
              entityType: "User",
              entityId: user.id,
              contextJson: { source: "stageh-provisioning" },
            },
          });
          return user;
        }),
    },
    { name: "STAGEH Test Administrator", email: ADMIN_EMAIL, password: adminPassword },
  );
  if (!bootstrap.created) throw new Error("Test Administrator was not created");
  const adminRow = await prisma.user.findUniqueOrThrow({
    where: { id: bootstrap.userId },
    select: { id: true, name: true, email: true, role: true },
  });
  const adminActor = actorFor(adminRow);

  const facultyRow = await createFaculty(adminActor, {
    name: "STAGEH Test Faculty",
    email: FACULTY_EMAIL,
    temporaryPassword: facultyPassword,
    employeeId: EMPLOYEE_ID,
    title: "STAGEH Temporary Test Account",
  });
  const facultyActor = actorFor({ ...facultyRow, role: "FACULTY" });

  const classRow = await createClass(facultyActor, {
    courseCode: CLASS_CODE,
    title: "STAGEH Automated Testing — Isolated",
    section: "STAGEH",
    term: "STAGEH",
    academicYear: "2026-2027",
    description: "Isolated STAGEH production acceptance test class. Do not use for real students.",
  });

  const studentRow = await createStudent(adminActor, {
    studentNumber: STUDENT_NUMBER,
    firstName: "STAGEH",
    lastName: "Test Student",
    email: STUDENT_EMAIL,
  });
  const invitation = await inviteStudentAccount(adminActor, studentRow.id);
  const studentAccount = await activateStudentAccount(invitation.token, studentPassword);
  await addStudent(facultyActor, classRow.id, {
    studentNumber: STUDENT_NUMBER,
    firstName: "STAGEH",
    lastName: "Test Student",
    email: STUDENT_EMAIL,
  });

  await writeCredentials(credentialsPath, {
    baseUrl: process.env.STAGEH_BASE_URL ?? "https://socbadging.hausoc.org",
    scope: "STAGEH",
    createdAt: new Date().toISOString(),
    admin: { email: ADMIN_EMAIL, password: adminPassword, userId: adminActor.id },
    faculty: {
      email: FACULTY_EMAIL,
      password: facultyPassword,
      userId: facultyActor.id,
      employeeId: EMPLOYEE_ID,
    },
    student: {
      email: STUDENT_EMAIL,
      password: studentPassword,
      studentId: studentRow.id,
      studentNumber: STUDENT_NUMBER,
      userId: studentAccount.userId,
    },
    class: { id: classRow.id, courseCode: CLASS_CODE, title: classRow.title },
  });

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        scope: "STAGEH",
        adminEmail: ADMIN_EMAIL,
        facultyEmail: FACULTY_EMAIL,
        studentEmail: STUDENT_EMAIL,
        classId: classRow.id,
        studentId: studentRow.id,
        credentialsFile: credentialsPath,
        emailSent: false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGEH provisioning failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
