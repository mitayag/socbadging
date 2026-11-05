"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  NotificationResendError,
  resendIssuedNotification,
} from "@/modules/notifications/services/notification-resend-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

export type ResendIssuanceState = { ok: boolean | null; message: string };

export async function resendIssuanceNotificationAction(
  _previousState: ResendIssuanceState,
  formData: FormData,
): Promise<ResendIssuanceState> {
  const issuanceId = String(formData.get("issuanceId") ?? "")
    .trim()
    .slice(0, 191);
  if (!issuanceId) return { ok: false, message: "Notification is unavailable." };
  const actor = await getCurrentActor();
  if (!actor) return { ok: false, message: "Notification is unavailable." };
  const rateLimit = await consumeRateLimit({
    policy: "account",
    key: `notification-resend\u0000${actor.id}\u0000${issuanceId}`,
  });
  if (!rateLimit.allowed) {
    return { ok: false, message: "Please wait before resending this notification." };
  }
  try {
    await resendIssuedNotification(actor, { issuanceId });
    revalidatePath(`/issued/${issuanceId}`);
    redirect(`/issued/${issuanceId}?notice=resent`);
  } catch (error) {
    if (error instanceof NotificationResendError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
