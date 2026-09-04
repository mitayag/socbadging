"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAuthenticated } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { revokeCredentialForAction } from "@/modules/issuance/services/revocation-service";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const reasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
const actionInputSchema = z.object({ issuanceId: identifierSchema, reason: reasonSchema }).strict();

export async function revokeCredentialAction(formData: FormData) {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const actor = requireAuthenticated(await getCurrentActor());
  const input = actionInputSchema.parse({
    issuanceId: formData.get("issuanceId"),
    reason: formData.get("reason"),
  });
  const result = await revokeCredentialForAction(actor, input);

  revalidatePath("/issued");
  revalidatePath(`/issued/${result.issuanceId}`);
  revalidatePath(`/credentials/${result.publicId}`);
  revalidatePath(`/classes/${result.classId}/issued`);
  redirect(
    `/issued/${encodeURIComponent(result.issuanceId)}?notice=${result.alreadyRevoked ? "existing" : "revoked"}`,
  );
}
