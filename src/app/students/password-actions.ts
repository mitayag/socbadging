"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import {
  directResetStudentPassword,
  requestStudentPasswordResetLink,
  StudentAccountError,
} from "@/modules/student/services/student-account-service";
import {
  sendStudentAccountEmail,
  StudentEmailUnavailableError,
} from "@/modules/student/services/student-email-service";

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

async function resetActor() {
  return requireRole(await getCurrentActor(), ["ADMIN", "FACULTY"]);
}

function returnPath(form: FormData, extra: Record<string, string | undefined> = {}) {
  const classId = String(form.get("classId") ?? "");
  const base = classId ? `/classes/${encodeURIComponent(classId)}/students` : "/students";
  const params = new URLSearchParams();
  for (const key of returnKeys) {
    const value = form.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return "Use a new password between 14 and 200 characters.";
  }
  if (error instanceof AuthorizationError) {
    return error.message || "You are not authorized to reset this student's password.";
  }
  if (error instanceof StudentAccountError) return error.message;
  return "The password reset could not be completed. Please try again.";
}

function revalidateResetPaths(classId: string) {
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/audit-logs");
  if (classId) revalidatePath(`/classes/${classId}/students`);
}

export async function directStudentPasswordResetAction(form: FormData) {
  const actor = await resetActor();
  const studentId = String(form.get("studentId") ?? "");
  const classId = String(form.get("classId") ?? "");
  const rateLimit = await consumeRateLimit({
    policy: "reset",
    key: `student-password-reset\u0000${actor.id}\u0000${studentId}`,
  });
  if (!rateLimit.allowed) {
    redirect(returnPath(form, { notice: "rate-limited" }));
  }

  try {
    await directResetStudentPassword(
      actor,
      studentId,
      String(form.get("newPassword") ?? ""),
      String(form.get("currentPassword") ?? ""),
      { classId: classId || undefined },
    );
  } catch (error) {
    redirect(returnPath(form, { error: errorMessage(error) }));
  }
  revalidateResetPaths(classId);
  redirect(returnPath(form, { notice: "password-reset" }));
}

export async function sendStudentPasswordResetLinkAction(form: FormData) {
  const actor = await resetActor();
  const studentId = String(form.get("studentId") ?? "");
  const classId = String(form.get("classId") ?? "");
  const rateLimit = await consumeRateLimit({
    policy: "reset",
    key: `student-reset-link\u0000${actor.id}\u0000${studentId}`,
  });
  if (!rateLimit.allowed) {
    redirect(returnPath(form, { notice: "rate-limited" }));
  }

  let result: Awaited<ReturnType<typeof requestStudentPasswordResetLink>>;
  try {
    result = await requestStudentPasswordResetLink(actor, studentId, {
      classId: classId || undefined,
    });
  } catch (error) {
    redirect(returnPath(form, { error: errorMessage(error) }));
  }

  try {
    await sendStudentAccountEmail({
      kind: "RECOVERY",
      studentId: result.student.id,
      to: result.student.email,
      firstName: result.student.firstName,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof StudentEmailUnavailableError) {
      revalidateResetPaths(classId);
      redirect(returnPath(form, { notice: "reset-link-created-email-unavailable" }));
    }
    throw error;
  }

  revalidateResetPaths(classId);
  redirect(returnPath(form, { notice: "reset-link-sent" }));
}
