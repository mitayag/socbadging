"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import type { IssueBadgeActionState } from "@/modules/issuance/types";
import { issueBadge } from "@/modules/issuance/services/issuance-service";
import {
  IssuanceConfigurationError,
  IssuanceValidationError,
  SignedIssuanceError,
} from "@/modules/issuance/services/signed-issuance-service";
import { writeStructuredLog } from "@/platform/logging/structured-log";

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
  let actor;
  try {
    actor = await currentFaculty();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        status: "error",
        message: "You are not authorized to issue this badge.",
      };
    }
    throw error;
  }

  let input: z.output<typeof issueBadgeFormSchema>;
  try {
    input = issueBadgeFormSchema.parse({
      classId: formData.get("classId"),
      badgeTemplateId: formData.get("badgeTemplateId"),
      studentId: formData.get("studentId"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Select a valid class, badge template, and student.",
      };
    }
    throw error;
  }

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
    if (error instanceof IssuanceConfigurationError || error instanceof IssuanceValidationError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof AuthorizationError) {
      return {
        status: "error",
        message: "You are not authorized to issue this badge.",
      };
    }
    writeStructuredLog("issuance.unexpected_error", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return {
      status: "error",
      message: "The badge could not be issued. No credential was created. Try again.",
    };
  }

  revalidatePath(`/classes/${input.classId}/issued`);
  revalidatePath("/issued");
  revalidatePath(`/issued/${result.issuanceId}`);
  redirect(
    `/issued/${encodeURIComponent(result.issuanceId)}?notice=${result.alreadyIssued ? "existing" : "issued"}`,
  );
}
