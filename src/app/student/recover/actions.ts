"use server";

import { redirect } from "next/navigation";

import {
  requestStudentRecovery,
  resetStudentPassword,
  StudentAccountError,
} from "@/modules/student/services/student-account-service";
import { sendStudentAccountEmail } from "@/modules/student/services/student-email-service";
import { writeStructuredLog } from "@/platform/logging/structured-log";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

export async function requestStudentRecoveryAction(formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "")
    .trim()
    .slice(0, 191);
  const rateLimit = await consumeRateLimit({
    policy: "reset",
    key: `student-recovery\u0000${identifier.toLowerCase()}`,
  });
  if (rateLimit.allowed && identifier) {
    try {
      const result = await requestStudentRecovery(identifier);
      writeStructuredLog("student.recovery_request", { found: Boolean(result) });
      if (result) {
        await sendStudentAccountEmail({
          kind: "RECOVERY",
          studentId: result.studentId,
          to: result.email,
          firstName: result.firstName,
          token: result.token,
          expiresAt: result.expiresAt,
        }).catch(() => undefined);
      }
    } catch {
      writeStructuredLog("student.recovery_request", { found: false });
    }
  }
  redirect("/student/recover?notice=sent");
}

export async function resetStudentPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const path = `/student/recover/${encodeURIComponent(token)}`;
  if (password !== confirmPassword) redirect(`${path}?error=mismatch`);
  try {
    await resetStudentPassword(token, password);
  } catch (error) {
    if (error instanceof StudentAccountError) redirect(`${path}?error=invalid`);
    throw error;
  }
  redirect("/login?notice=student-password-reset");
}
