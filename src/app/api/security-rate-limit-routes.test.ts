import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  consumeRateLimit: vi.fn(),
  getClassWorkspace: vi.fn(),
  parseRosterFile: vi.fn(),
  createImportPreview: vi.fn(),
  findClassStudents: vi.fn(),
  readStoredFile: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/platform/security/shared-rate-limit", () => ({
  consumeRateLimit: state.consumeRateLimit,
}));
vi.mock("@/modules/rosters/services/roster-service", () => ({
  getClassWorkspace: state.getClassWorkspace,
}));
vi.mock("@/modules/rosters/services/import-parser", () => ({
  parseRosterFile: state.parseRosterFile,
}));
vi.mock("@/modules/rosters/services/import-service", () => ({
  createImportPreview: state.createImportPreview,
}));
vi.mock("@/platform/db/prisma", () => ({
  prisma: { classStudent: { findMany: state.findClassStudents } },
}));
vi.mock("@/platform/storage/local-storage", () => ({
  readStoredFile: state.readStoredFile,
}));
vi.mock("@/config/env", () => ({
  getServerEnv: () => ({ APP_URL: "http://localhost:3000", TRUST_PROXY: false }),
}));

import { POST as inspectRoster } from "./classes/[classId]/roster/import/inspect/route";
import { POST as previewRoster } from "./classes/[classId]/roster/import/preview/route";
import { GET as exportRoster } from "./classes/[classId]/roster/export/route";
import { GET as getMedia } from "./media/[...key]/route";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY",
};
const classContext = { params: Promise.resolve({ classId: "class-1" }) };

describe("heavy route shared rate limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.getClassWorkspace.mockResolvedValue({ id: "class-1" });
    state.consumeRateLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 13,
    });
  });

  it.each([
    [
      "roster inspection",
      () =>
        inspectRoster(
          new Request("http://localhost:3000/inspect", {
            method: "POST",
            body: "must-not-be-read",
          }),
          classContext,
        ),
    ],
    [
      "roster preview",
      () =>
        previewRoster(
          new Request("http://localhost:3000/preview", {
            method: "POST",
            body: "must-not-be-read",
          }),
          classContext,
        ),
    ],
  ])("limits %s before parsing request content", async (_name, invoke) => {
    const response = await invoke();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    expect(await response.json()).toEqual({ error: "Too many requests" });
    expect(state.parseRosterFile).not.toHaveBeenCalled();
    expect(state.createImportPreview).not.toHaveBeenCalled();
  });

  it.each([
    ["roster inspection", inspectRoster],
    ["roster preview", previewRoster],
  ])("rejects cross-origin %s before authorization or parsing", async (_name, route) => {
    const response = await route(
      new Request("http://localhost:3000/roster", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: "must-not-be-read",
      }),
      classContext,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid origin" });
    expect(state.getClassWorkspace).not.toHaveBeenCalled();
    expect(state.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("limits roster export before querying private student rows", async () => {
    const response = await exportRoster(new Request("http://localhost:3000/export"), classContext);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(state.findClassStudents).not.toHaveBeenCalled();
  });

  it("limits media before local file I/O without echoing the storage key", async () => {
    state.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      retryAfterSeconds: 5,
    });
    const response = await getMedia(
      new Request("http://localhost:3000/api/media/badges/private.png"),
      {
        params: Promise.resolve({ key: ["badges", "private.png"] }),
      },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.text()).not.toContain("badges/private.png");
    expect(state.readStoredFile).not.toHaveBeenCalled();
  });
});
