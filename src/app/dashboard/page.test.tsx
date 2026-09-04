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
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button>Sign Out</button>,
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.test",
      role: "ADMIN",
    };
  });

  it("describes the currently available credential, verification, and audit capabilities", async () => {
    render(await DashboardPage());

    expect(
      screen.getByText(/Create and manage classes, rosters, badges, and issued credentials/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Public verification, sharing, revocation, and audit records are available/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/arrive in later phases/i)).not.toBeInTheDocument();
  });
});
