import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";
import type { DashboardData } from "@/modules/dashboard/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  dashboard: null as DashboardData | null,
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/dashboard/services/dashboard-service", () => ({
  getDashboardData: vi.fn(async () => state.dashboard),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import DashboardPage from "./page";

const admin: Actor = {
  id: "admin-1",
  name: "Admin User",
  email: "admin@example.test",
  role: "ADMIN",
};
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty User",
  email: "faculty@example.test",
  role: "FACULTY",
};

function trendPoints(count = 0) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 19 + index));
    return { date: date.toISOString().slice(0, 10), count: index === 13 ? count : 0 };
  });
}

function pagination(total = 1, page = 1) {
  const totalPages = Math.max(1, Math.ceil(total / 5));
  return {
    page,
    pageSize: 5,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

function dashboard(
  role: "ADMIN" | "FACULTY",
  overrides: Partial<DashboardData> = {},
): DashboardData {
  return {
    role,
    stats: {
      facultyAccounts: role === "ADMIN" ? 4 : null,
      classes: role === "ADMIN" ? 6 : 2,
      students: role === "ADMIN" ? 20 : 8,
      badgeTemplates: role === "ADMIN" ? 8 : 3,
      issuedBadges: role === "ADMIN" ? 12 : 5,
      activeCredentials: 7,
      revokedCredentials: 3,
      expiredCredentials: 2,
    },
    issuancePagination: pagination(),
    recentIssuances: [
      {
        id: "issuance-1",
        publicId: "public-1",
        badgeName: "Issue Sample",
        classLabel: "CS101 · Introduction",
        recipientDisplayName: "Maria S.",
        issuedAt: "2026-11-01T08:00:00.000Z",
        status: "ACTIVE",
      },
    ],
    activityPagination: pagination(),
    recentActivities: [
      {
        id: "activity-1",
        action: "badge.issued",
        label: "Badge issued",
        entityType: "BadgeIssuance",
        entityId: "issuance-1",
        actorName: "Faculty User",
        createdAt: "2026-11-01T08:00:00.000Z",
      },
    ],
    trend: trendPoints(3),
    trendDays: 14,
    quickActions:
      role === "ADMIN"
        ? [
            {
              label: "Create Faculty",
              href: "/faculty",
              description: "Add an authorized faculty account.",
              icon: "users",
            },
          ]
        : [
            {
              label: "Create Class",
              href: "/classes",
              description: "Start a new class workspace.",
              icon: "plus",
            },
          ],
    ...overrides,
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor = admin;
    state.dashboard = dashboard("ADMIN");
  });

  it("renders Administrator metrics, recent issuance activity, trends, and quick actions", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Welcome back, Admin" })).toBeInTheDocument();
    expect(screen.getByText("Faculty Accounts")).toBeInTheDocument();
    expect(screen.getByText("Recent Badge Issuances")).toBeInTheDocument();
    expect(screen.getByText("Issue Sample")).toBeInTheDocument();
    expect(screen.getByText("Maria S.")).toBeInTheDocument();
    expect(screen.getByText("Badge issued")).toBeInTheDocument();
    expect(screen.getByText("Create Faculty")).toBeInTheDocument();
    expect(screen.getAllByText(/Page 1 of 1/)).toHaveLength(2);
    expect(screen.getAllByText(/1 record/)).toHaveLength(2);
    expect(screen.getByLabelText(/Badge issuance trend for the last 14 days/)).toBeInTheDocument();
  });

  it("renders only Faculty-scoped metrics and actions", async () => {
    state.actor = faculty;
    state.dashboard = dashboard("FACULTY");

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Welcome back, Faculty" })).toBeInTheDocument();
    expect(screen.getByText("My Classes")).toBeInTheDocument();
    expect(screen.queryByText("Faculty Accounts")).not.toBeInTheDocument();
    expect(screen.getByText("Create Class")).toBeInTheDocument();
    expect(screen.queryByText("Create Faculty")).not.toBeInTheDocument();
  });

  it("renders empty states when no operational data exists", async () => {
    state.dashboard = dashboard("ADMIN", {
      recentIssuances: [],
      recentActivities: [],
      trend: trendPoints(),
    });

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/No credentials have been issued yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent activity yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No badge issuance activity in the last 14 days/i)).toBeInTheDocument();
  });
});
