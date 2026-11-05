"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import {
  createFaculty,
  deleteFaculty,
  editFaculty,
  FacultyConflictError,
  resetFacultyAccess,
  setFacultyStatus,
  type FacultyAccessStatus,
} from "@/modules/faculty/services/faculty-service";

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

const fields = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  email: String(form.get("email") ?? ""),
  employeeId: String(form.get("employeeId") ?? ""),
  departmentId: String(form.get("departmentId") ?? ""),
  title: String(form.get("title") ?? ""),
  bio: String(form.get("bio") ?? ""),
});

async function admin() {
  return requireRole(await getCurrentActor(), "ADMIN");
}

function returnPath(form: FormData, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const key of returnKeys) {
    const value = form.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/faculty?${query}` : "/faculty";
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Check the submitted values and try again.";
  }
  if (error instanceof FacultyConflictError) return error.message;
  if (error instanceof AuthorizationError) return "Administrator access required.";
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      if (target.includes("employee")) {
        return "This employee ID is already assigned to another faculty account.";
      }
      if (target.includes("email")) return "A faculty account with this email already exists.";
      return "A duplicate value already exists.";
    }
    if (error.code === "P2025") return "The faculty account could not be found.";
  }
  if (error instanceof Error && error.message === "Faculty account is unavailable for deletion") {
    return error.message;
  }
  return "The request could not be completed. Please try again.";
}

function refresh(notice: string, form: FormData, extra: Record<string, string | undefined> = {}) {
  revalidatePath("/faculty");
  revalidatePath("/dashboard");
  redirect(returnPath(form, { notice, ...extra }));
}

function fail(form: FormData, error: unknown, extra: Record<string, string | undefined> = {}) {
  redirect(returnPath(form, { error: errorMessage(error), ...extra }));
}

function parseAccessStatus(value: FormDataEntryValue | null): FacultyAccessStatus | null {
  return value === "ACTIVE" || value === "INACTIVE" || value === "SUSPENDED" ? value : null;
}

export async function createFacultyAction(form: FormData) {
  const actor = await admin();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  try {
    await createFaculty(actor, {
      ...fields(form),
      temporaryPassword: String(form.get("temporaryPassword") ?? ""),
    });
  } catch (error) {
    fail(form, error, { create: "1" });
  }
  revalidatePath("/faculty");
  revalidatePath("/dashboard");
  redirect(`/faculty?q=${encodeURIComponent(email)}&notice=created`);
}

export async function editFacultyAction(form: FormData) {
  const actor = await admin();
  const userId = String(form.get("userId") ?? "");
  try {
    await editFaculty(actor, userId, fields(form));
  } catch (error) {
    fail(form, error, { edit: userId });
  }
  refresh("updated", form);
}

export async function statusFacultyAction(form: FormData) {
  const actor = await admin();
  const status = parseAccessStatus(form.get("status"));
  if (!status) {
    fail(form, new Error("Invalid faculty status"));
    return;
  }
  try {
    await setFacultyStatus(actor, String(form.get("userId") ?? ""), status);
  } catch (error) {
    fail(form, error);
  }
  refresh(
    status === "ACTIVE" ? "activated" : status === "INACTIVE" ? "deactivated" : "suspended",
    form,
  );
}

export async function resetFacultyAction(form: FormData) {
  const actor = await admin();
  const userId = String(form.get("userId") ?? "");
  try {
    await resetFacultyAccess(actor, userId, String(form.get("temporaryPassword") ?? ""));
  } catch (error) {
    fail(form, error, { reset: userId });
  }
  refresh("access-reset", form);
}

export async function deleteFacultyAction(form: FormData) {
  const actor = await admin();
  try {
    await deleteFaculty(actor, String(form.get("userId") ?? ""));
  } catch (error) {
    fail(form, error);
  }
  refresh("deleted", form);
}
