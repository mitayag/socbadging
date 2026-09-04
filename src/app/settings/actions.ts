"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { updateSystemSettings } from "@/modules/settings/services/system-settings-service";
import {
  activateSigningKey,
  markSigningKeyCompromised,
  registerPublicSigningKey,
  retireSigningKey,
} from "@/modules/signing/key-service";
import { SystemSettingsInputSchema } from "@/modules/settings/types";

const formInputSchema = z
  .object({
    issuerName: z.string(),
    issuerUrl: z.string(),
    issuerLogoPath: z.string(),
    supportContact: z.string(),
    sharingEnabled: z.boolean(),
  })
  .strict();

export type SettingsActionState = { ok: true } | { ok: false; message: string };
export type SettingsFormState = SettingsActionState | { ok: null };

const keyActionSchema = z
  .object({
    intent: z.enum(["register", "activate", "retire", "compromise"]),
    confirmation: z.literal("confirm"),
    keyId: z.string().trim().min(1).max(191).optional(),
    verificationMethodUrl: z.string().optional(),
    controllerUrl: z.string().optional(),
    algorithm: z.string().optional(),
    cryptosuite: z.string().optional(),
    publicMultikey: z.string().optional(),
    fingerprint: z.string().optional(),
  })
  .strict();

export async function signingKeyAction(formData: FormData): Promise<SettingsActionState> {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const actor = requireRole(await getCurrentActor(), "ADMIN");
  const allowed = new Set([
    "intent",
    "confirmation",
    "keyId",
    "verificationMethodUrl",
    "controllerUrl",
    "algorithm",
    "cryptosuite",
    "publicMultikey",
    "fingerprint",
  ]);
  if (Array.from(formData.keys()).some((key) => !allowed.has(key)))
    return { ok: false, message: "Review the public key metadata." };
  const parsed = keyActionSchema.safeParse({
    intent: formData.get("intent"),
    confirmation: formData.get("confirmation"),
    keyId: formData.get("keyId") || undefined,
    verificationMethodUrl: formData.get("verificationMethodUrl") || undefined,
    controllerUrl: formData.get("controllerUrl") || undefined,
    algorithm: formData.get("algorithm") || undefined,
    cryptosuite: formData.get("cryptosuite") || undefined,
    publicMultikey: formData.get("publicMultikey") || undefined,
    fingerprint: formData.get("fingerprint") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Confirm the requested key lifecycle action." };
  const value = parsed.data;
  if (value.intent === "register") {
    if (
      !value.verificationMethodUrl ||
      !value.controllerUrl ||
      !value.algorithm ||
      !value.cryptosuite ||
      !value.publicMultikey ||
      !value.fingerprint
    )
      return { ok: false, message: "Review the public key metadata." };
    await registerPublicSigningKey(
      {
        verificationMethodUrl: value.verificationMethodUrl,
        controllerUrl: value.controllerUrl,
        algorithm: "Ed25519",
        cryptosuite: "eddsa-rdfc-2022",
        publicMultikey: value.publicMultikey,
        fingerprint: value.fingerprint,
      },
      actor,
    );
  } else if (value.intent === "activate") {
    if (!value.keyId) return { ok: false, message: "Select a signing key." };
    await activateSigningKey(value.keyId, actor);
  } else if (value.intent === "retire") {
    if (!value.keyId) return { ok: false, message: "Select a signing key." };
    await retireSigningKey(value.keyId, actor);
  } else {
    if (!value.keyId) return { ok: false, message: "Select a signing key." };
    await markSigningKeyCompromised(value.keyId, actor);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateSystemSettingsAction(formData: FormData): Promise<SettingsActionState> {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const actor = requireRole(await getCurrentActor(), "ADMIN");
  const raw = formInputSchema.safeParse({
    issuerName: formData.get("issuerName"),
    issuerUrl: formData.get("issuerUrl"),
    issuerLogoPath: formData.get("issuerLogoPath"),
    supportContact: formData.get("supportContact"),
    sharingEnabled: formData.get("sharingEnabled") === "on",
  });
  if (!raw.success || !SystemSettingsInputSchema.safeParse(raw.data).success) {
    return { ok: false, message: "Review the highlighted settings fields." };
  }

  await updateSystemSettings(actor, raw.data);
  revalidatePath("/settings");
  revalidatePath("/credentials/[publicId]", "page");
  return { ok: true };
}

export async function submitSystemSettingsAction(formData: FormData): Promise<void> {
  await updateSystemSettingsAction(formData);
}

export async function updateSystemSettingsFormAction(
  _previousState: SettingsFormState,
  formData: FormData,
): Promise<SettingsActionState> {
  return updateSystemSettingsAction(formData);
}
