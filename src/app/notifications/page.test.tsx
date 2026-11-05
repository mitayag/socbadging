import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  list: vi.fn(),
  suppressions: vi.fn(),
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/notifications/services/notification-query-service", () => ({
  listNotifications: state.list,
  notificationPageSizes: [5, 10, 25, 50],
}));
vi.mock("@/modules/notifications/services/recipient-suppression-service", () => ({
  listActiveSuppressions: state.suppressions,
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/notifications/notification-list", () => ({
  NotificationList: () => <p>Notification List</p>,
}));
vi.mock("@/components/notifications/suppressed-recipient-list", () => ({
  SuppressedRecipientList: ({ items }: { items: unknown[] }) => (
    <p>Suppressed Recipients ({items.length})</p>
  ),
}));

import NotificationsPage from "./page";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@example.edu", role: "ADMIN" };

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = admin;
    state.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      role: "ADMIN",
    });
    state.suppressions.mockResolvedValue([]);
  });

  it("renders the Administrator delivery dashboard", async () => {
    render(await NotificationsPage({ searchParams: Promise.resolve({ status: "FAILED" }) }));
    expect(screen.getByRole("heading", { name: "Email Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Notification List")).toBeInTheDocument();
    expect(state.list).toHaveBeenCalledWith(admin, expect.objectContaining({ status: "FAILED" }));
  });

  it("renders bounded pagination links while preserving active filters", async () => {
    state.list.mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 5,
      total: 41,
      totalPages: 9,
      hasNext: true,
      hasPrevious: true,
      role: "ADMIN",
    });

    render(
      await NotificationsPage({
        searchParams: Promise.resolve({ page: "2", status: "FAILED", type: "BADGE_ISSUED" }),
      }),
    );

    expect(screen.getByRole("navigation", { name: "Notification pages" })).toHaveTextContent(
      "Previous",
    );
    expect(screen.getAllByText(/Page 2 of 9/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/notifications?status=FAILED&type=BADGE_ISSUED&page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/notifications?status=FAILED&type=BADGE_ISSUED&page=3",
    );
  });
});
