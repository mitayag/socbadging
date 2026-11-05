export const notificationTypes = ["BADGE_ISSUED", "BADGE_REVOKED"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const notificationDeliveryStatuses = [
  "PENDING",
  "PROCESSING",
  "RETRY_SCHEDULED",
  "SENT",
  "FAILED",
] as const;
export type NotificationDeliveryStatus = (typeof notificationDeliveryStatuses)[number];

export const notificationProviderStatuses = [
  "ACCEPTED",
  "DELIVERED",
  "DEFERRED",
  "BOUNCED",
  "BLOCKED",
  "INVALID",
  "COMPLAINT",
] as const;
export type NotificationProviderStatus = (typeof notificationProviderStatuses)[number];

export type NotificationDeliveryDto = {
  id: string;
  type: NotificationType;
  status: NotificationDeliveryStatus;
  maskedRecipientEmail: string;
  badgeName: string;
  attemptCount: number;
  safeDiagnosticCode?: string;
  createdAt: Date;
  sentAt?: Date;
};
