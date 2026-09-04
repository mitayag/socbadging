import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  deliveryFindMany: vi.fn(),
  deliveryFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    notificationDelivery: {
      count: mocks.count,
      findMany: mocks.deliveryFindMany,
      findFirst: mocks.deliveryFindFirst,
    },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { getIssuanceNotificationStatus, listNotifications } from "./notification-query-service";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@example.edu", role: "ADMIN" };
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY",
};

const row = {
  id: "delivery-1",
  type: "BADGE_ISSUED",
  status: "FAILED",
  recipientEmail: "student.long@example.edu",
  badgeName: "Secure Systems",
  attemptCount: 2,
  lastErrorCategory: "TRANSIENT",
  safeDiagnosticCode: "ETIMEDOUT",
  createdAt: new Date("2026-08-23T00:00:00Z"),
  sentAt: null,
  issuance: { issuerUserId: "faculty-1", class: { ownerUserId: "faculty-1" } },
};

describe("notification queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE", deletedAt: null });
    mocks.deliveryFindMany.mockResolvedValue([row]);
    mocks.count.mockResolvedValue(1);
  });

  it("returns a paginated privacy-safe Administrator projection", async () => {
    const result = await listNotifications(admin, { page: 1, status: "FAILED" });
    expect(result.items[0]).toMatchObject({
      maskedRecipientEmail: "s***@example.edu",
      canRetry: true,
    });
    expect(result.items[0]).not.toHaveProperty("recipientEmail");
    expect(mocks.deliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "FAILED" }, take: 20 }),
    );
  });

  it("scopes Faculty status to currently owned classes", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "FACULTY", status: "ACTIVE", deletedAt: null });
    mocks.deliveryFindFirst.mockResolvedValue({ status: "SENT" });
    await expect(getIssuanceNotificationStatus(faculty, "issuance-1")).resolves.toBe("SENT");
    expect(mocks.deliveryFindFirst).toHaveBeenCalledWith({
      where: { issuanceId: "issuance-1", issuance: { class: { ownerUserId: "faculty-1" } } },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });
  });

  it("rejects an actor whose persisted access is no longer active", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "ADMIN", status: "SUSPENDED", deletedAt: null });
    await expect(listNotifications(admin)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.deliveryFindMany).not.toHaveBeenCalled();
  });
});
