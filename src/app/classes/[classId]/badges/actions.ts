"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import {
  createBadge,
  duplicateBadge,
  editBadge,
  setBadgeStatus,
} from "@/modules/badges/services/badge-service";
const fields = (f: FormData) => ({
  name: String(f.get("name") ?? ""),
  description: String(f.get("description") ?? ""),
  criteria: String(f.get("criteria") ?? ""),
  skills: String(f.get("skills") ?? ""),
  alignmentName: String(f.get("alignmentName") ?? ""),
  alignmentUrl: String(f.get("alignmentUrl") ?? ""),
  expiresAfterDays: String(f.get("expiresAfterDays") ?? ""),
});
async function actor() {
  return requireRole(await getCurrentActor(), "FACULTY");
}
export async function createBadgeAction(f: FormData) {
  const classId = String(f.get("classId"));
  const file = f.get("image");
  await createBadge(
    await actor(),
    classId,
    fields(f),
    file instanceof File ? file : new File([], ""),
  );
  revalidatePath(`/classes/${classId}/badges`);
  redirect(`/classes/${classId}/badges?notice=created`);
}
export async function editBadgeAction(f: FormData) {
  const classId = String(f.get("classId"));
  const file = f.get("image");
  await editBadge(
    await actor(),
    String(f.get("badgeId")),
    fields(f),
    file instanceof File ? file : null,
  );
  revalidatePath(`/classes/${classId}/badges`);
}
export async function statusBadgeAction(f: FormData) {
  const classId = String(f.get("classId"));
  await setBadgeStatus(
    await actor(),
    String(f.get("badgeId")),
    String(f.get("status")) === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
  );
  revalidatePath(`/classes/${classId}/badges`);
}
export async function duplicateBadgeAction(f: FormData) {
  const classId = String(f.get("classId"));
  await duplicateBadge(await actor(), String(f.get("badgeId")));
  revalidatePath(`/classes/${classId}/badges`);
}

import {
  archiveClassBadgeAssignment,
  assignBadgeToClass,
} from "@/modules/badge-library/services/class-badge-assignment-service";
import { requireStaff } from "@/modules/identity/policies/authorization";

function actionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function assignBadgeAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const actor = requireStaff(await getCurrentActor());
  let error = "";
  try {
    await assignBadgeToClass(actor, classId, versionId);
  } catch (cause) {
    error = actionError(cause, "Unable to assign the badge to this class.");
  }
  revalidatePath(`/classes/${classId}/badges`);
  redirect(
    error
      ? `/classes/${classId}/badges?error=${encodeURIComponent(error)}`
      : `/classes/${classId}/badges?notice=assigned`,
  );
}

export async function archiveAssignmentAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const actor = requireStaff(await getCurrentActor());
  let error = "";
  try {
    await archiveClassBadgeAssignment(actor, assignmentId);
  } catch (cause) {
    error = actionError(cause, "Unable to archive the badge assignment.");
  }
  revalidatePath(`/classes/${classId}/badges`);
  redirect(
    error
      ? `/classes/${classId}/badges?error=${encodeURIComponent(error)}`
      : `/classes/${classId}/badges?notice=assignment-archived`,
  );
}
