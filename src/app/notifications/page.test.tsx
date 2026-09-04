import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({ actor: null as Actor | null, list: vi.fn() }));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/notifications/services/notification-query-service", () => ({
  listNotifications: state.list,
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/notifications/notification-list", () => ({
  NotificationList: () => <p>Notification List</p>,
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
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
    });
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
      pageSize: 20,
      total: 41,
      totalPages: 3,
      hasNext: true,
    });

    render(
      await NotificationsPage({
        searchParams: Promise.resolve({ page: "2", status: "FAILED", type: "BADGE_ISSUED" }),
      }),
    );

    expect(screen.getByRole("navigation", { name: "Notification Pagination" })).toHaveTextContent(
      "Page 2 of 3",
    );
    expect(screen.getByRole("link", { name: "Previous Page" })).toHaveAttribute(
      "href",
      "/notifications?status=FAILED&type=BADGE_ISSUED&page=1",
    );
    expect(screen.getByRole("link", { name: "Next Page" })).toHaveAttribute(
      "href",
      "/notifications?status=FAILED&type=BADGE_ISSUED&page=3",
    );
  });
});
