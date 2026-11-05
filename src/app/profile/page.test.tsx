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
vi.mock("@/platform/db/prisma", () => ({ prisma: { user: { findUniqueOrThrow: vi.fn() } } }));
vi.mock("@/modules/departments/services/department-service", () => ({
  listDepartments: vi.fn(async () => []),
}));
vi.mock("@/components/faculty/department-select", () => ({
  DepartmentSelect: () => <select aria-label="Department" />,
}));
vi.mock("./actions", () => ({ updateProfileAction: vi.fn() }));

import ProfilePage from "./page";

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor = {
      id: "admin-1",
      name: "Admin User",
      email: "admin@example.test",
      role: "ADMIN",
    };
  });

  it("renders an Administrator profile instead of redirecting to the dashboard", async () => {
    render(await ProfilePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Your Account" })).toBeInTheDocument();
    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account Settings" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.getByRole("link", { name: "Issuer Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
