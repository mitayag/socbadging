"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { createSignedReplacement } from "@/modules/issuance/services/replacement-service";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

function replacementUnavailable(): Error {
  return new Error("Credential replacement is unavailable");
}

export async function replaceCredentialAction(formData: FormData) {
  const actor = requireRole(await getCurrentActor(), "ADMIN");
  if (!(formData instanceof FormData)) throw replacementUnavailable();
  if (formData.get("confirmation") !== "replace") {
    throw new Error("Replacement confirmation is required");
  }
  const originalIssuanceId = identifierSchema.safeParse(formData.get("originalIssuanceId"));
  if (!originalIssuanceId.success) throw replacementUnavailable();

  let result: Awaited<ReturnType<typeof createSignedReplacement>>;
  try {
    result = await createSignedReplacement({
      originalIssuanceId: originalIssuanceId.data,
      actorId: actor.id,
    });
  } catch {
    throw replacementUnavailable();
  }
  revalidatePath(`/issued/${originalIssuanceId.data}`);
  revalidatePath(`/issued/${result.replacementId}`);
}
