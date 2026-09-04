"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import type { IssueBadgeActionState } from "@/modules/issuance/types";
import { issueBadge } from "@/modules/issuance/services/issuance-service";
import { SignedIssuanceError } from "@/modules/issuance/services/signed-issuance-service";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

const issueBadgeFormSchema = z
  .object({
    classId: identifierSchema,
    badgeTemplateId: identifierSchema,
    studentId: identifierSchema,
  })
  .strict();

const issuanceResultSchema = z
  .object({
    issuanceId: identifierSchema,
    publicId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{32}$/),
    alreadyIssued: z.boolean(),
  })
  .strict();

async function currentFaculty() {
  return requireRole(await getCurrentActor(), "FACULTY");
}

export async function issueBadgeAction(
  _previousState: IssueBadgeActionState,
  formData: FormData,
): Promise<IssueBadgeActionState> {
  const actor = await currentFaculty();
  const input = issueBadgeFormSchema.parse({
    classId: formData.get("classId"),
    badgeTemplateId: formData.get("badgeTemplateId"),
    studentId: formData.get("studentId"),
  });
  let result: z.output<typeof issuanceResultSchema>;
  try {
    result = issuanceResultSchema.parse(await issueBadge(actor, input));
  } catch (error) {
    if (error instanceof SignedIssuanceError) {
      return {
        status: error.retryable ? "retryable-error" : "error",
        message: error.message,
      };
    }
    throw error;
  }

  revalidatePath(`/classes/${input.classId}/issued`);
  revalidatePath("/issued");
  revalidatePath(`/issued/${result.issuanceId}`);
  redirect(
    `/issued/${encodeURIComponent(result.issuanceId)}?notice=${result.alreadyIssued ? "existing" : "issued"}`,
  );
}
