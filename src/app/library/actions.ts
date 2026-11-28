"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveBadgeDefinition,
  createBadgeDefinition,
  reviewBadgeDefinition,
  reviseBadgeDefinition,
  submitBadgeDefinition,
} from "@/modules/badge-library/services/badge-library-service";
import { assignBadgeToClass } from "@/modules/badge-library/services/class-badge-assignment-service";
import { requireStaff } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

function versionFields(formData: FormData) {
  return {
    courseId: String(formData.get("courseId") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    competencies: String(formData.get("competencies") ?? ""),
    assessmentCriteria: String(formData.get("assessmentCriteria") ?? ""),
    gradingPeriod: String(formData.get("gradingPeriod") ?? ""),
    issuingInstitution: String(formData.get("issuingInstitution") ?? ""),
    validityDays: String(formData.get("validityDays") ?? ""),
    skills: String(formData.get("skills") ?? ""),
  };
}

function imageFile(formData: FormData) {
  const file = formData.get("image");
  return file instanceof File ? file : undefined;
}

async function staff() {
  return requireStaff(await getCurrentActor());
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function createBadgeDefinitionAction(formData: FormData) {
  const actor = await staff();
  let error = "";
  let definitionId = "";
  try {
    const result = await createBadgeDefinition(actor, versionFields(formData), imageFile(formData));
    definitionId = result.definition.id;
  } catch (cause) {
    error = message(cause, "Unable to create the badge definition.");
  }
  revalidatePath("/library");
  if (error) redirect(`/library?error=${encodeURIComponent(error)}`);
  redirect(`/library/${definitionId}?notice=created`);
}

export async function reviseBadgeDefinitionAction(formData: FormData) {
  const actor = await staff();
  const definitionId = String(formData.get("definitionId") ?? "");
  let error = "";
  try {
    await reviseBadgeDefinition(actor, definitionId, versionFields(formData), imageFile(formData));
  } catch (cause) {
    error = message(cause, "Unable to create a new badge version.");
  }
  revalidatePath(`/library/${definitionId}`);
  revalidatePath("/library");
  redirect(
    error
      ? `/library/${definitionId}?error=${encodeURIComponent(error)}`
      : `/library/${definitionId}?notice=version-created`,
  );
}

export async function submitBadgeDefinitionAction(formData: FormData) {
  const actor = await staff();
  const definitionId = String(formData.get("definitionId") ?? "");
  let error = "";
  try {
    await submitBadgeDefinition(actor, definitionId, String(formData.get("note") ?? ""));
  } catch (cause) {
    error = message(cause, "Unable to submit the badge proposal.");
  }
  revalidatePath(`/library/${definitionId}`);
  revalidatePath("/library");
  redirect(
    error
      ? `/library/${definitionId}?error=${encodeURIComponent(error)}`
      : `/library/${definitionId}?notice=submitted`,
  );
}

export async function reviewBadgeDefinitionAction(formData: FormData) {
  const actor = await staff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  let error = "";
  try {
    await reviewBadgeDefinition(actor, versionId, decision, String(formData.get("note") ?? ""));
  } catch (cause) {
    error = message(cause, "Unable to record the approval decision.");
  }
  revalidatePath(`/library/${definitionId}`);
  revalidatePath("/library");
  redirect(
    error
      ? `/library/${definitionId}?error=${encodeURIComponent(error)}`
      : `/library/${definitionId}?notice=reviewed`,
  );
}

export async function archiveBadgeDefinitionAction(formData: FormData) {
  const actor = await staff();
  const definitionId = String(formData.get("definitionId") ?? "");
  let error = "";
  try {
    await archiveBadgeDefinition(actor, definitionId, String(formData.get("reason") ?? ""));
  } catch (cause) {
    error = message(cause, "Unable to archive the badge definition.");
  }
  revalidatePath(`/library/${definitionId}`);
  revalidatePath("/library");
  redirect(
    error
      ? `/library/${definitionId}?error=${encodeURIComponent(error)}`
      : `/library/${definitionId}?notice=archived`,
  );
}

export async function assignBadgeAction(formData: FormData) {
  const actor = await staff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  let error = "";
  try {
    await assignBadgeToClass(actor, classId, versionId);
  } catch (cause) {
    error = message(cause, "Unable to assign the badge to the class.");
  }
  revalidatePath(`/library/${definitionId}`);
  revalidatePath(`/classes/${classId}/badges`);
  redirect(
    error
      ? `/library/${definitionId}?error=${encodeURIComponent(error)}`
      : `/library/${definitionId}?notice=assigned`,
  );
}
