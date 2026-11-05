"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import {
  createStudent,
  deactivateStudentAccount,
  editStudent,
  inviteStudentAccount,
  setStudentAccountStatus,
  StudentAccountError,
  StudentConflictError,
} from "@/modules/student/services/student-account-service";
import {
  sendStudentAccountEmail,
  StudentEmailUnavailableError,
} from "@/modules/student/services/student-email-service";

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

const studentFields = (form: FormData) => ({
  studentNumber: String(form.get("studentNumber") ?? ""),
  firstName: String(form.get("firstName") ?? ""),
  lastName: String(form.get("lastName") ?? ""),
  email: String(form.get("email") ?? ""),
});

async function administrator() {
  return requireRole(await getCurrentActor(), "ADMIN");
}

function returnPath(form: FormData, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const key of returnKeys) {
    const value = form.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/students?${query}` : "/students";
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Check the submitted values and try again.";
  }
  if (error instanceof StudentConflictError || error instanceof StudentAccountError) {
    return error.message;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      if (target.includes("student_number") || target.includes("studentNumber")) {
        return "A student with this student number already exists.";
      }
      if (target.includes("email")) return "A student or user with this email already exists.";
      return "A duplicate value already exists.";
    }
    if (error.code === "P2025") return "The student record could not be found.";
  }
  return "The request could not be completed. Please try again.";
}

function refresh(notice: string, form: FormData, extra: Record<string, string | undefined> = {}) {
  revalidatePath("/students");
  revalidatePath("/dashboard");
  redirect(returnPath(form, { notice, ...extra }));
}

function fail(form: FormData, error: unknown, extra: Record<string, string | undefined> = {}) {
  redirect(returnPath(form, { error: errorMessage(error), ...extra }));
}

async function sendInvitation(
  actor: Awaited<ReturnType<typeof administrator>>,
  studentId: string,
  form: FormData,
  notice: "invited" | "resent",
) {
  const rateLimit = await consumeRateLimit({
    policy: "account",
    key: `student-invite\u0000${actor.id}\u0000${studentId}`,
  });
  if (!rateLimit.allowed) redirect(returnPath(form, { notice: "rate-limited" }));
  try {
    const result = await inviteStudentAccount(actor, studentId);
    await sendStudentAccountEmail({
      kind: "ACTIVATION",
      studentId: result.student.id,
      to: result.student.email,
      firstName: result.student.firstName,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof StudentEmailUnavailableError) {
      redirect(returnPath(form, { notice: "email-unavailable" }));
    }
    if (error instanceof StudentAccountError) {
      redirect(returnPath(form, { notice: "account-error" }));
    }
    throw error;
  }
  refresh(notice, form);
}

export async function createStudentAction(form: FormData) {
  const actor = await administrator();
  const sendInvite = form.get("sendInvitation") === "on";
  let student: Awaited<ReturnType<typeof createStudent>>;
  try {
    student = await createStudent(actor, studentFields(form));
  } catch (error) {
    fail(form, error, { create: "1" });
    return;
  }
  if (sendInvite) {
    try {
      const result = await inviteStudentAccount(actor, student.id);
      await sendStudentAccountEmail({
        kind: "ACTIVATION",
        studentId: result.student.id,
        to: result.student.email,
        firstName: result.student.firstName,
        token: result.token,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (error instanceof StudentEmailUnavailableError) {
        redirect(
          returnPath(form, {
            q: student.studentNumber,
            notice: "created-invite-pending",
          }),
        );
      }
      if (error instanceof StudentAccountError) {
        redirect(returnPath(form, { q: student.studentNumber, notice: "created" }));
      }
      throw error;
    }
  }
  revalidatePath("/students");
  revalidatePath("/dashboard");
  redirect(
    returnPath(form, {
      q: student.studentNumber,
      notice: sendInvite ? "created-invited" : "created",
    }),
  );
}

export async function editStudentAction(form: FormData) {
  const actor = await administrator();
  const studentId = String(form.get("studentId") ?? "");
  try {
    await editStudent(actor, studentId, studentFields(form));
  } catch (error) {
    fail(form, error, { edit: studentId });
  }
  refresh("updated", form);
}

export async function deleteStudentAction(form: FormData) {
  const actor = await administrator();
  try {
    await deactivateStudentAccount(actor, String(form.get("studentId") ?? ""));
  } catch (error) {
    fail(form, error);
  }
  refresh("deleted", form);
}

export async function inviteStudentAction(form: FormData) {
  const actor = await administrator();
  await sendInvitation(actor, String(form.get("studentId") ?? ""), form, "invited");
}

export async function resendStudentInvitationAction(form: FormData) {
  const actor = await administrator();
  await sendInvitation(actor, String(form.get("studentId") ?? ""), form, "resent");
}

export async function setStudentStatusAction(form: FormData) {
  const actor = await administrator();
  const status = form.get("status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
  try {
    await setStudentAccountStatus(actor, String(form.get("studentId") ?? ""), status);
  } catch (error) {
    fail(form, error);
  }
  refresh(status === "ACTIVE" ? "reactivated" : "suspended", form);
}
