import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));

import { UserMenu } from "./user-menu";

const actor = {
  id: "faculty-1",
  name: "Faculty User",
  email: "faculty@example.test",
  role: "FACULTY" as const,
};

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.pathname = "/dashboard";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  it("opens the profile menu and exposes every account option", async () => {
    const user = userEvent.setup();
    render(<UserMenu actor={actor} />);

    const trigger = screen.getByRole("button", { name: "Open user menu for Faculty User" });
    expect(trigger).toHaveTextContent("Faculty User");
    expect(trigger).toHaveTextContent("Faculty");
    await user.click(trigger);

    expect(screen.getByRole("menu", { name: "User menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "My Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("menuitem", { name: "Account Settings" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.getByRole("menuitem", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("supports keyboard navigation and Escape dismissal", async () => {
    const user = userEvent.setup();
    render(<UserMenu actor={actor} />);
    const trigger = screen.getByRole("button", { name: "Open user menu for Faculty User" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "My Profile" })).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Account Settings" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Sign Out" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "My Profile" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(<UserMenu actor={actor} />);

    await user.click(screen.getByRole("button", { name: "Open user menu for Faculty User" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("invalidates the session through the existing logout route and redirects to login", async () => {
    const user = userEvent.setup();
    render(<UserMenu actor={actor} />);

    await user.click(screen.getByRole("button", { name: "Open user menu for Faculty User" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(state.push).toHaveBeenCalledWith("/login");
    expect(state.refresh).toHaveBeenCalled();
  });
});
