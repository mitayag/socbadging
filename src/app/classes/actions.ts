"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClass, editClass, setClassStatus } from "@/modules/classes/services/class-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireAuthenticated } from "@/modules/identity/policies/authorization";
const fields = (form: FormData) => ({
  courseCode: String(form.get("courseCode") ?? ""),
  title: String(form.get("title") ?? ""),
  section: String(form.get("section") ?? ""),
  term: String(form.get("term") ?? ""),
  academicYear: String(form.get("academicYear") ?? ""),
  description: String(form.get("description") ?? ""),
});
async function actor() {
  return requireAuthenticated(await getCurrentActor());
}
export async function createClassAction(form: FormData) {
  await createClass(await actor(), fields(form));
  revalidatePath("/classes");
  redirect("/classes?notice=created");
}
export async function editClassAction(form: FormData) {
  await editClass(await actor(), String(form.get("classId") ?? ""), fields(form));
  revalidatePath("/classes");
  redirect("/classes?notice=updated");
}
export async function statusClassAction(form: FormData) {
  await setClassStatus(
    await actor(),
    String(form.get("classId") ?? ""),
    String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
  );
  revalidatePath("/classes");
}
