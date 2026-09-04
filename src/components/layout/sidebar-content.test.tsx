import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/dashboard" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

import { SidebarContent } from "./sidebar-content";

describe("SidebarContent", () => {
  afterEach(cleanup);

  beforeEach(() => {
    state.pathname = "/issued/issuance-1";
  });

  it("marks the current Issued Badges route active instead of Dashboard", () => {
    render(
      <SidebarContent
        actor={{
          id: "faculty-1",
          name: "Prof. Reyes",
          email: "reyes@example.edu",
          role: "FACULTY",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Issued Badges" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("active");
  });

  it("renders safely before a pathname is available", () => {
    state.pathname = null;

    render(
      <SidebarContent
        actor={{
          id: "faculty-1",
          name: "Prof. Reyes",
          email: "reyes@example.edu",
          role: "FACULTY",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("active");
  });

  it("uses the shared two-line brand lockup", () => {
    const { container } = render(
      <SidebarContent
        actor={{
          id: "faculty-1",
          name: "Prof. Reyes",
          email: "reyes@example.edu",
          role: "FACULTY",
        }}
      />,
    );

    expect(container.querySelectorAll('[data-brand-line="institution"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-brand-line="product"]')).toHaveLength(1);
  });
});
