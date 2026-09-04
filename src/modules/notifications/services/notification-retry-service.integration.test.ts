import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";
import {
  createNotificationFixture,
  notificationAdmin,
  removeNotificationFixture,
} from "@/test/notification-fixture";
import { retryNotification } from "./notification-retry-service";

describe("notification retry with MariaDB", () => {
  beforeEach(async () => {
    await removeNotificationFixture();
    await createNotificationFixture();
  });
  afterEach(removeNotificationFixture);

  it("preserves message snapshots and atomically writes one retry audit", async () => {
    const before = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: "p7-delivery" },
    });
    const results = await Promise.all([
      retryNotification(notificationAdmin, "p7-delivery"),
      retryNotification(notificationAdmin, "p7-delivery"),
    ]);
    expect(results.filter((item) => !item.alreadyQueued)).toHaveLength(1);
    const after = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: "p7-delivery" },
    });
    expect(after).toMatchObject({
      status: "PENDING",
      recipientEmail: before.recipientEmail,
      badgeName: before.badgeName,
      verificationUrl: before.verificationUrl,
    });
    expect(
      await prisma.auditLog.count({
        where: { action: "notification.retry_requested", entityId: "p7-delivery" },
      }),
    ).toBe(1);
  });
});
