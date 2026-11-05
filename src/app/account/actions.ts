"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AccountPasswordError,
  changeOwnPassword,
  updateOwnDisplayName,
} from "@/modules/identity/services/account-service";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export async function updateAccountNameAction(form: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  try {
    await updateOwnDisplayName(actor, { name: String(form.get("name") ?? "") });
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/login");
    redirect("/account?error=name");
  }
  revalidatePath("/account");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  redirect("/account?notice=name-updated");
}

export async function changePasswordAction(form: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  if (newPassword !== confirmPassword) redirect("/account?error=password-mismatch");
  try {
    await changeOwnPassword(actor, { currentPassword, newPassword });
  } catch (error) {
    if (error instanceof AccountPasswordError) redirect("/account?error=current-password");
    if (error instanceof AuthorizationError) redirect("/login");
    redirect("/account?error=password");
  }
  redirect("/login?notice=password-updated");
}
