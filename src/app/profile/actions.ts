"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import { updateOwnProfile } from "@/modules/faculty/services/faculty-service";
export async function updateProfileAction(form: FormData) {
  const actor = requireRole(await getCurrentActor(), "FACULTY");
  await updateOwnProfile(actor, {
    name: String(form.get("name") ?? ""),
    employeeId: String(form.get("employeeId") ?? ""),
    departmentId: String(form.get("departmentId") ?? ""),
    title: String(form.get("title") ?? ""),
    bio: String(form.get("bio") ?? ""),
  });
  revalidatePath("/profile");
  redirect("/profile?notice=updated");
}
