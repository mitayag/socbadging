"use server";

import { redirect } from "next/navigation";

import {
  activateStudentAccount,
  StudentAccountError,
} from "@/modules/student/services/student-account-service";

export async function activateStudentAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const path = `/student/activate/${encodeURIComponent(token)}`;
  if (password !== confirmPassword) redirect(`${path}?error=mismatch`);
  try {
    await activateStudentAccount(token, password);
  } catch (error) {
    if (error instanceof StudentAccountError) redirect(`${path}?error=invalid`);
    throw error;
  }
  redirect("/login?notice=student-activated");
}
