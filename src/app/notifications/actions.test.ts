import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  retry: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/notifications/services/notification-retry-service", () => ({
  retryNotification: state.retry,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));

import { retryNotificationAction } from "./actions";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@example.edu", role: "ADMIN" };

describe("retryNotificationAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = admin;
    state.retry.mockResolvedValue({ alreadyQueued: false });
  });

  it("reauthenticates, validates, retries, and revalidates", async () => {
    const form = new FormData();
    form.set("deliveryId", "delivery-1");
    await expect(retryNotificationAction(form)).resolves.toEqual({
      ok: true,
      message: "Notification queued for retry.",
    });
    expect(state.retry).toHaveBeenCalledWith(admin, "delivery-1");
    expect(state.revalidate).toHaveBeenCalledWith("/notifications");
  });

  it("returns safe validation feedback without mutation", async () => {
    const form = new FormData();
    form.set("deliveryId", "../../secret");
    await expect(retryNotificationAction(form)).resolves.toEqual({
      ok: false,
      message: "Notification is unavailable.",
    });
    expect(state.retry).not.toHaveBeenCalled();
  });
});
