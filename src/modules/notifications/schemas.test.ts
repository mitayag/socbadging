import { describe, expect, it } from "vitest";

import { notificationDeliverySchema, notificationTypeSchema } from "./schemas";

describe("notification schemas", () => {
  it("accepts only supported notification types", () => {
    expect(notificationTypeSchema.parse("BADGE_ISSUED")).toBe("BADGE_ISSUED");
    expect(notificationTypeSchema.parse("BADGE_REVOKED")).toBe("BADGE_REVOKED");
    expect(() => notificationTypeSchema.parse("WELCOME")).toThrow();
  });

  it("enforces bounded privacy-safe delivery fields", () => {
    const delivery = notificationDeliverySchema.parse({
      id: "delivery-1",
      type: "BADGE_ISSUED",
      status: "PENDING",
      maskedRecipientEmail: "m***@example.edu",
      badgeName: "Dean's List",
      attemptCount: 0,
      createdAt: new Date("2026-08-23T00:00:00Z"),
    });
    expect(delivery.maskedRecipientEmail).not.toContain("marlon");
    expect(() =>
      notificationDeliverySchema.parse({ ...delivery, safeDiagnosticCode: "x".repeat(101) }),
    ).toThrow();
  });
});
