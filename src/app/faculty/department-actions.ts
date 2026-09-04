"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  createDepartment,
  renameDepartment,
  setDepartmentStatus,
} from "@/modules/departments/services/department-service";

async function admin() {
  return requireRole(await getCurrentActor(), "ADMIN");
}
export async function createDepartmentAction(form: FormData) {
  await createDepartment(await admin(), String(form.get("name") ?? ""));
  revalidatePath("/faculty");
  redirect("/faculty?notice=department-created");
}
export async function renameDepartmentAction(form: FormData) {
  await renameDepartment(
    await admin(),
    String(form.get("departmentId") ?? ""),
    String(form.get("name") ?? ""),
  );
  revalidatePath("/faculty");
  redirect("/faculty?notice=department-renamed");
}
export async function statusDepartmentAction(form: FormData) {
  await setDepartmentStatus(
    await admin(),
    String(form.get("departmentId") ?? ""),
    String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
  );
  revalidatePath("/faculty");
}
