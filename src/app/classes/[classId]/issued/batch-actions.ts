"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import type { BatchCommitActionState } from "@/modules/issuance/batch-types";
import {
  BATCH_SIGNING_UNAVAILABLE_MESSAGE,
  BatchSigningError,
  commitBatchPreview,
} from "@/modules/issuance/services/batch-commit-service";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const resultSchema = z.object({
  id: identifier,
  classId: identifier,
  alreadyCommitted: z.boolean(),
});

export async function commitBatchIssuanceAction(
  _previousState: BatchCommitActionState,
  formData: FormData,
): Promise<BatchCommitActionState> {
  const actor = requireRole(await getCurrentActor(), "FACULTY");
  const batchId = identifier.parse(formData.get("batchId"));
  let result: z.output<typeof resultSchema>;
  try {
    result = resultSchema.parse(await commitBatchPreview(actor, batchId));
  } catch (error) {
    if (error instanceof BatchSigningError) {
      return { status: "signing-error", message: BATCH_SIGNING_UNAVAILABLE_MESSAGE };
    }
    throw error;
  }
  revalidatePath(`/classes/${result.classId}/issued`);
  revalidatePath("/issued");
  revalidatePath(`/issuance-batches/${result.id}`);
  revalidatePath("/issuance-batches");
  redirect(
    `/issuance-batches/${encodeURIComponent(result.id)}?notice=${result.alreadyCommitted ? "existing" : "committed"}`,
  );
}
