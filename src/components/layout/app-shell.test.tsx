import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders accessible navigation and the signed-in role", () => {
    render(
      <AppShell
        actor={{ id: "1", name: "System Administrator", email: "admin@hau.edu.ph", role: "ADMIN" }}
      >
        <h1>Dashboard</h1>
      </AppShell>,
    );

    expect(screen.getAllByRole("navigation", { name: "Primary Navigation" })).toHaveLength(2);
    const logos = screen.getAllByRole("img", { name: "HAU School of Computing logo" });
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      const brandRow = logo.closest(".brand-row");
      expect(brandRow).not.toBeNull();
      expect(brandRow).toHaveTextContent("HAU SOC");
      expect(brandRow).toHaveTextContent("Badging System");
    }
    expect(screen.getByRole("main")).toHaveTextContent("Dashboard");
    expect(screen.getAllByText("System Administrator").length).toBeGreaterThan(0);
  });
});
