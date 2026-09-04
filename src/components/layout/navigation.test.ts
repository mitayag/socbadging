import { describe, expect, it } from "vitest";

import { getClassTabs, getNavigationItems } from "./navigation";

describe("getNavigationItems", () => {
  it("includes Administrator-only destinations for an Administrator", () => {
    expect(getNavigationItems("ADMIN").map((item) => item.label)).toEqual([
      "Dashboard",
      "Classes",
      "Issued Badges",
      "Notifications",
      "Faculty Management",
      "Audit Logs",
      "Settings",
    ]);
  });

  it("does not expose Administrator-only destinations to Faculty", () => {
    expect(getNavigationItems("FACULTY").map((item) => item.label)).toEqual([
      "Dashboard",
      "Classes",
      "Issued Badges",
      "My Profile",
    ]);
    expect(getNavigationItems("FACULTY").some((item) => item.label === "Faculty Management")).toBe(
      false,
    );
  });

  it("makes Issued Badges available to both authenticated roles", () => {
    for (const role of ["ADMIN", "FACULTY"] as const) {
      expect(getNavigationItems(role).find((item) => item.label === "Issued Badges")).toMatchObject(
        {
          href: "/issued",
          phase: "available",
        },
      );
    }
  });

  it("routes Administrator audit logs and settings to their available server-authorized pages", () => {
    const items = getNavigationItems("ADMIN");

    expect(items.find((item) => item.label === "Audit Logs")).toMatchObject({
      href: "/audit-logs",
      phase: "available",
    });
    expect(items.find((item) => item.label === "Settings")).toMatchObject({
      href: "/settings",
      phase: "available",
    });
    expect(items.find((item) => item.label === "Notifications")).toMatchObject({
      href: "/notifications",
      phase: "available",
    });
  });

  it("builds consistently ordered class tabs with the selected surface active", () => {
    const tabs = getClassTabs("class-1", "issued");

    expect(tabs.map((tab) => tab.label)).toEqual(["Students", "Badges", "Issued", "Settings"]);
    expect(tabs.find((tab) => tab.active)).toEqual({
      label: "Issued",
      href: "/classes/class-1/issued",
      active: true,
    });
  });

  it("routes the class Settings tab to its class-scoped settings surface", () => {
    expect(getClassTabs("class-1", "settings").find((tab) => tab.active)).toEqual({
      label: "Settings",
      href: "/classes/class-1/settings",
      active: true,
    });
  });
});
