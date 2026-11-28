"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mapClassToCourse } from "@/modules/catalog/services/course-service";
import { requireStaff } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export async function mapCourseAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const actor = requireStaff(await getCurrentActor());
  let error = "";
  try {
    await mapClassToCourse(actor, classId, courseId || null);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unable to map the class to the course.";
  }
  revalidatePath(`/classes/${classId}/settings`);
  revalidatePath("/catalog");
  redirect(
    error
      ? `/classes/${classId}/settings?error=${encodeURIComponent(error)}`
      : `/classes/${classId}/settings?notice=mapped`,
  );
}
