import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  listAuditLogs: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/audit/services/audit-log-service", () => ({
  listAuditLogs: state.listAuditLogs,
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/audit/audit-log-list", () => ({
  AuditLogList: () => <p>Audit Log List</p>,
}));
vi.mock("next/navigation", () => ({ notFound: state.notFound, redirect: state.redirect }));

import AuditLogsPage from "./page";

const administrator: Actor = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
};

describe("AuditLogsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = administrator;
    state.listAuditLogs.mockResolvedValue([]);
  });

  it("renders the Administrator audit log surface", async () => {
    render(await AuditLogsPage());

    expect(screen.getByRole("heading", { name: "Audit Logs" })).toBeInTheDocument();
    expect(screen.getByText("Audit Log List")).toBeInTheDocument();
    expect(state.listAuditLogs).toHaveBeenCalledWith(administrator);
  });

  it("uses a uniform not-found result when a non-Administrator is denied", async () => {
    state.actor = { ...administrator, role: "FACULTY" };
    state.listAuditLogs.mockRejectedValueOnce(
      new AuthorizationError("Administrator access required"),
    );

    await expect(AuditLogsPage()).rejects.toThrow("NOT_FOUND");
  });
});
