"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  completeRequiredPasswordChange,
  StudentAccountError,
} from "@/modules/student/services/student-account-service";

export async function changeRequiredPasswordAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  requireRole(actor, "STUDENT");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password !== confirmPassword) redirect("/student/change-password?error=mismatch");

  try {
    await completeRequiredPasswordChange(actor, currentPassword, password);
  } catch (error) {
    if (error instanceof ZodError) {
      redirect("/student/change-password?error=policy");
    }
    if (error instanceof StudentAccountError) {
      redirect(
        error.message.includes("current password")
          ? "/student/change-password?error=current"
          : "/student/change-password?error=invalid",
      );
    }
    throw error;
  }
  redirect("/login?notice=password-updated");
}
