"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import {
  addStudent,
  editStudent,
  setEnrollmentStatus,
} from "@/modules/rosters/services/roster-service";
import { commitImportPreview } from "@/modules/rosters/services/import-service";
const fields = (f: FormData) => ({
  studentNumber: String(f.get("studentNumber") ?? ""),
  firstName: String(f.get("firstName") ?? ""),
  lastName: String(f.get("lastName") ?? ""),
  email: String(f.get("email") ?? ""),
});
async function actor() {
  return requireRole(await getCurrentActor(), "FACULTY");
}
export async function addStudentAction(form: FormData) {
  const classId = String(form.get("classId"));
  await addStudent(await actor(), classId, fields(form));
  revalidatePath(`/classes/${classId}/students`);
  redirect(`/classes/${classId}/students?notice=added`);
}
export async function editStudentAction(form: FormData) {
  const classId = String(form.get("classId"));
  await editStudent(await actor(), classId, String(form.get("studentId")), fields(form));
  revalidatePath(`/classes/${classId}/students`);
}
export async function enrollmentAction(form: FormData) {
  const classId = String(form.get("classId"));
  await setEnrollmentStatus(
    await actor(),
    classId,
    String(form.get("studentId")),
    String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "REMOVED",
  );
  revalidatePath(`/classes/${classId}/students`);
}
export async function commitImportAction(form: FormData) {
  const classId = String(form.get("classId"));
  await commitImportPreview(await actor(), String(form.get("previewId")));
  revalidatePath(`/classes/${classId}/students`);
  redirect(`/classes/${classId}/students?notice=imported`);
}
