import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("./actions", () => ({
  updateAccountNameAction: vi.fn(),
  changePasswordAction: vi.fn(),
}));

import AccountPage from "./page";

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor = {
      id: "admin-1",
      name: "Admin User",
      email: "admin@example.test",
      role: "ADMIN",
    };
  });

  it("shows account identity and security controls for an Administrator", async () => {
    render(await AccountPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(screen.getByText("System Administrator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Display Name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage issuer settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("renders safe error and success messages from query parameters", async () => {
    render(
      await AccountPage({
        searchParams: Promise.resolve({ error: "current-password", notice: "name-updated" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Your display name was updated.");
    expect(screen.getByRole("alert")).toHaveTextContent("Your current password is incorrect.");
  });
});
