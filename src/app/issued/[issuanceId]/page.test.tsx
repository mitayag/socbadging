import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  detail: { status: "ACTIVE" } as { status: "ACTIVE" | "REVOKED" },
  canRevoke: null as boolean | null,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/issuance/credential-detail", () => ({
  CredentialDetail: ({ canRevoke }: { canRevoke: boolean }) => {
    state.canRevoke = canRevoke;
    return null;
  },
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/issuance/services/issuance-query-service", () => ({
  IssuanceNotFoundError: class IssuanceNotFoundError extends Error {},
  getIssuanceDetail: vi.fn(async () => state.detail),
}));
vi.mock("@/modules/notifications/services/notification-query-service", () => ({
  getIssuanceNotificationStatus: vi.fn(async () => "SENT"),
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import IssuanceDetailPage from "./page";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@hau.edu.ph", role: "ADMIN" };
const invocation = {
  params: Promise.resolve({ issuanceId: "issuance-1" }),
  searchParams: Promise.resolve({}),
};

describe("IssuanceDetailPage revocation visibility", () => {
  beforeEach(() => {
    state.actor = admin;
    state.detail = { status: "ACTIVE" };
    state.canRevoke = null;
  });

  it("shows revocation only for an authorized actor viewing an active credential", async () => {
    render(await IssuanceDetailPage(invocation));

    expect(state.canRevoke).toBe(true);
  });

  it("hides revocation for a revoked credential", async () => {
    state.detail = { status: "REVOKED" };
    render(await IssuanceDetailPage(invocation));

    expect(state.canRevoke).toBe(false);
  });
});
