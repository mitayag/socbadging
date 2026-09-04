import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/platform/db/prisma", () => ({
  prisma: { session: { findUnique: mocks.findUnique } },
}));

import { getCurrentActor } from "./current-actor";

describe("getCurrentActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "raw-session-token" }) });
  });

  it("rejects an existing session when its user has been deleted", async () => {
    mocks.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        id: "faculty-1",
        name: "Deleted Faculty",
        email: "deleted@hau.edu.ph",
        role: "FACULTY",
        status: "DELETED",
      },
    });

    await expect(getCurrentActor()).resolves.toBeNull();
  });

  it("returns the public actor for an active unexpired session", async () => {
    mocks.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        id: "faculty-1",
        name: "Active Faculty",
        email: "active@hau.edu.ph",
        role: "FACULTY",
        status: "ACTIVE",
      },
    });

    await expect(getCurrentActor()).resolves.toEqual({
      id: "faculty-1",
      name: "Active Faculty",
      email: "active@hau.edu.ph",
      role: "FACULTY",
    });
  });
});
