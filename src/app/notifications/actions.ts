"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { retryNotification } from "@/modules/notifications/services/notification-retry-service";

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
  const result = await retryNotification(await getCurrentActor(), id.data);
  revalidatePath("/notifications");
  return {
    ok: true,
    message: result.alreadyQueued
      ? "Notification is already queued."
      : "Notification queued for retry.",
  };
}

export async function retryNotificationFormAction(
  _previousState: RetryNotificationState,
  formData: FormData,
): Promise<RetryNotificationState> {
  return retryNotificationAction(formData);
}
