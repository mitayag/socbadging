"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createCourse,
  mapClassToCourse,
  setCourseStatus,
  updateCourse,
} from "@/modules/catalog/services/course-service";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

function fields(formData: FormData) {
  return {
    code: String(formData.get("code") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    programs: String(formData.get("programs") ?? ""),
  };
}

async function admin() {
  return requireRole(await getCurrentActor(), "ADMIN");
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function createCourseAction(formData: FormData) {
  const actor = await admin();
  let error = "";
  try {
    await createCourse(actor, fields(formData));
  } catch (cause) {
    error = message(cause, "Unable to create the course.");
  }
  revalidatePath("/catalog");
  redirect(error ? `/catalog?error=${encodeURIComponent(error)}` : "/catalog?notice=created");
}

export async function updateCourseAction(formData: FormData) {
  const actor = await admin();
  let error = "";
  try {
    await updateCourse(actor, String(formData.get("courseId") ?? ""), fields(formData));
  } catch (cause) {
    error = message(cause, "Unable to update the course.");
  }
  revalidatePath("/catalog");
  redirect(error ? `/catalog?error=${encodeURIComponent(error)}` : "/catalog?notice=updated");
}

export async function statusCourseAction(formData: FormData) {
  const actor = await admin();
  const courseId = String(formData.get("courseId") ?? "");
  const status = String(formData.get("status") ?? "") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  let error = "";
  try {
    await setCourseStatus(actor, courseId, status);
  } catch (cause) {
    error = message(cause, "Unable to change the course status.");
  }
  revalidatePath("/catalog");
  redirect(
    error
      ? `/catalog?error=${encodeURIComponent(error)}`
      : `/catalog?notice=${status === "ACTIVE" ? "reopened" : "archived"}`,
  );
}

export async function mapClassAction(formData: FormData) {
  const actor = await admin();
  const classId = String(formData.get("classId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  let error = "";
  try {
    await mapClassToCourse(actor, classId, courseId || null);
  } catch (cause) {
    error = message(cause, "Unable to map the class to the course.");
  }
  revalidatePath("/catalog");
  revalidatePath(`/classes/${classId}/settings`);
  redirect(error ? `/catalog?error=${encodeURIComponent(error)}` : "/catalog?notice=mapped");
}
