"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ImportCommitState } from "@/components/rosters/import-types";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
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
  redirect(`/classes/${classId}/students?notice=updated`);
}
export async function enrollmentAction(form: FormData) {
  const classId = String(form.get("classId"));
  const status = String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "REMOVED";
  await setEnrollmentStatus(await actor(), classId, String(form.get("studentId")), status);
  revalidatePath(`/classes/${classId}/students`);
  redirect(`/classes/${classId}/students?notice=${status === "ACTIVE" ? "restored" : "removed"}`);
}
const safeImportErrors = new Set([
  "Import preview is no longer available",
  "Resolve all validation errors before commit",
  "Import preview belongs to another user",
]);
export async function commitImportAction(
  _previousState: ImportCommitState,
  form: FormData,
): Promise<ImportCommitState> {
  const previewId = String(form.get("previewId") ?? "").trim();
  if (!previewId || previewId.length > 191) {
    return {
      status: "error",
      message: "Import preview is missing or expired. Review the file again before importing.",
      importedCount: 0,
    };
  }
  try {
    const result = await commitImportPreview(await actor(), previewId);
    revalidatePath(`/classes/${result.classId}/students`);
    return {
      status: "success",
      message: `Imported ${result.importedCount} ${
        result.importedCount === 1 ? "student" : "students"
      } into the class roster.`,
      importedCount: result.importedCount,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        status: "error",
        message: "You do not have permission to import this roster.",
        importedCount: 0,
      };
    }
    if (error instanceof Error && safeImportErrors.has(error.message)) {
      return { status: "error", message: error.message, importedCount: 0 };
    }
    return {
      status: "error",
      message: "The roster could not be imported. Review the file and try again.",
      importedCount: 0,
    };
  }
}
