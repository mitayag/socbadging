"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import {
  createFaculty,
  deleteFaculty,
  editFaculty,
  resetFacultyAccess,
  setFacultyStatus,
} from "@/modules/faculty/services/faculty-service";

const fields = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  employeeId: String(form.get("employeeId") ?? ""),
  departmentId: String(form.get("departmentId") ?? ""),
  title: String(form.get("title") ?? ""),
  bio: String(form.get("bio") ?? ""),
});
async function admin() {
  return requireRole(await getCurrentActor(), "ADMIN");
}

export async function createFacultyAction(form: FormData) {
  const actor = await admin();
  await createFaculty(actor, {
    ...fields(form),
    email: String(form.get("email") ?? ""),
    temporaryPassword: String(form.get("temporaryPassword") ?? ""),
  });
  revalidatePath("/faculty");
  redirect("/faculty?notice=created");
}
export async function editFacultyAction(form: FormData) {
  const actor = await admin();
  const userId = String(form.get("userId") ?? "");
  await editFaculty(actor, userId, fields(form));
  revalidatePath("/faculty");
  redirect("/faculty?notice=updated");
}
export async function statusFacultyAction(form: FormData) {
  const actor = await admin();
  await setFacultyStatus(
    actor,
    String(form.get("userId") ?? ""),
    String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
  );
  revalidatePath("/faculty");
}
export async function resetFacultyAction(form: FormData) {
  const actor = await admin();
  await resetFacultyAccess(
    actor,
    String(form.get("userId") ?? ""),
    String(form.get("temporaryPassword") ?? ""),
  );
  revalidatePath("/faculty");
  redirect("/faculty?notice=reset");
}
export async function deleteFacultyAction(form: FormData) {
  const actor = await admin();
  await deleteFaculty(actor, String(form.get("userId") ?? ""));
  revalidatePath("/faculty");
  redirect("/faculty?notice=deleted");
}
