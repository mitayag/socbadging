"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  RecipientSuppressedError,
  RecipientSuppressionError,
  unsuppressRecipient,
} from "@/modules/notifications/services/recipient-suppression-service";
import { retryNotification } from "@/modules/notifications/services/notification-retry-service";
import {
  NotificationResendError,
  resendIssuedNotification,
} from "@/modules/notifications/services/notification-resend-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
export type RetryNotificationState = { ok: boolean | null; message: string };

export async function retryNotificationAction(formData: FormData): Promise<RetryNotificationState> {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const id = idSchema.safeParse(formData.get("deliveryId"));
  if (!id.success) return { ok: false, message: "Notification is unavailable." };
  try {
    const result = await retryNotification(await getCurrentActor(), id.data);
    revalidatePath("/notifications");
    return {
      ok: true,
      message: result.alreadyQueued
        ? "Notification is already queued."
        : "Notification queued for retry.",
    };
  } catch (error) {
    if (error instanceof RecipientSuppressedError || error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function unsuppressRecipientAction(
  _previousState: RetryNotificationState,
  formData: FormData,
): Promise<RetryNotificationState> {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const email = z.email().safeParse(formData.get("normalizedEmail"));
  const reason = z.string().trim().min(5).max(1000).safeParse(formData.get("reason"));
  if (!email.success || !reason.success) {
    return { ok: false, message: "A valid recipient and clearance reason are required." };
  }
  try {
    await unsuppressRecipient(await getCurrentActor(), {
      normalizedEmail: email.data,
      reason: reason.data,
      acknowledgeComplaint: formData.get("acknowledgeComplaint") === "on",
    });
    revalidatePath("/notifications");
    return { ok: true, message: "Recipient suppression cleared and audited." };
  } catch (error) {
    if (error instanceof RecipientSuppressionError || error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function resendNotificationAction(
  formData: FormData,
): Promise<RetryNotificationState> {
  if (!(formData instanceof FormData)) throw new TypeError("FormData is required");
  const id = idSchema.safeParse(formData.get("deliveryId"));
  if (!id.success) return { ok: false, message: "Notification is unavailable." };
  const actor = await getCurrentActor();
  if (!actor) return { ok: false, message: "Notification is unavailable." };
  const rateLimit = await consumeRateLimit({
    policy: "account",
    key: `notification-resend\u0000${actor.id}\u0000${id.data}`,
  });
  if (!rateLimit.allowed) {
    return { ok: false, message: "Please wait before resending this notification." };
  }
  try {
    await resendIssuedNotification(actor, { deliveryId: id.data });
    revalidatePath("/notifications");
    redirect("/notifications?notice=resent");
  } catch (error) {
    if (error instanceof NotificationResendError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function resendNotificationFormAction(
  _previousState: RetryNotificationState,
  formData: FormData,
): Promise<RetryNotificationState> {
  return resendNotificationAction(formData);
}

export async function retryNotificationFormAction(
  _previousState: RetryNotificationState,
  formData: FormData,
): Promise<RetryNotificationState> {
  return retryNotificationAction(formData);
}
