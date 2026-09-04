import { z } from "zod";

import { notificationDeliveryStatuses, notificationTypes } from "./types";

export const notificationTypeSchema = z.enum(notificationTypes);
export const notificationDeliveryStatusSchema = z.enum(notificationDeliveryStatuses);

export const notificationDeliverySchema = z.object({
  id: z.string().min(1).max(191),
  type: notificationTypeSchema,
  status: notificationDeliveryStatusSchema,
  maskedRecipientEmail: z.string().min(3).max(191),
  badgeName: z.string().min(1).max(191),
  attemptCount: z.number().int().min(0),
  safeDiagnosticCode: z.string().max(100).optional(),
  createdAt: z.date(),
  sentAt: z.date().optional(),
});
