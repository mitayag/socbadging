import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createNotificationFixture,
  notificationAdmin,
  notificationFaculty,
  notificationOtherFaculty,
  removeNotificationFixture,
} from "@/test/notification-fixture";
import { getIssuanceNotificationStatus, listNotifications } from "./notification-query-service";

describe("notification queries with MariaDB", () => {
  beforeEach(async () => {
    await removeNotificationFixture();
    await createNotificationFixture();
  });
  afterEach(removeNotificationFixture);

  it("returns masked global Administrator data and owner-scoped Faculty status", async () => {
    const list = await listNotifications(notificationAdmin);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.maskedRecipientEmail).toBe("a***@example.test");
    await expect(getIssuanceNotificationStatus(notificationFaculty, "p7-issuance")).resolves.toBe(
      "FAILED",
    );
    await expect(
      getIssuanceNotificationStatus(notificationOtherFaculty, "p7-issuance"),
    ).resolves.toBeNull();
  });
});
