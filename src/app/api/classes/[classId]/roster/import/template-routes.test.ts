import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => {
  const value = {
    actor: null as Actor | null,
    workspaceFailure: null as Error | null,
    getClassWorkspace: vi.fn(async () => {
      if (value.workspaceFailure) throw value.workspaceFailure;
      return { id: "class-1" };
    }),
  };
  return value;
});

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));

vi.mock("@/modules/rosters/services/roster-service", () => ({
  getClassWorkspace: state.getClassWorkspace,
}));

import { GET as getCsvTemplate } from "./template.csv/route";
import { GET as getXlsxTemplate } from "./template.xlsx/route";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty Member",
  email: "faculty@example.edu",
  role: "FACULTY",
};

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};

const routeContext = { params: Promise.resolve({ classId: "class-1" }) };

function assertForbidden(response: Response) {
  expect(response.status).toBe(403);
  expect(response.headers.get("content-disposition")).toBeNull();
  return expect(response.json()).resolves.toEqual({ error: "Forbidden" });
}

describe("roster import template download routes", () => {
  beforeEach(() => {
    state.actor = null;
    state.workspaceFailure = null;
    state.getClassWorkspace.mockClear();
  });

  it("downloads the real CSV roster template for an owning Faculty", async () => {
    state.actor = faculty;

    const response = await getCsvTemplate(new Request("http://localhost"), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="roster-import-template.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.getClassWorkspace).toHaveBeenCalledWith(faculty, "class-1");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toContain("Student Number");
  });

  it("downloads the real XLSX roster template for an owning Faculty", async () => {
    state.actor = faculty;

    const response = await getXlsxTemplate(new Request("http://localhost"), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="roster-import-template.xlsx"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.getClassWorkspace).toHaveBeenCalledWith(faculty, "class-1");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it.each([
    ["CSV", getCsvTemplate],
    ["XLSX", getXlsxTemplate],
  ])("rejects unauthenticated %s template downloads", async (_format, handler) => {
    const response = await handler(new Request("http://localhost"), routeContext);

    await assertForbidden(response);
    expect(state.getClassWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ["CSV", getCsvTemplate],
    ["XLSX", getXlsxTemplate],
  ])(
    "rejects Administrator %s template downloads before class lookup",
    async (_format, handler) => {
      state.actor = administrator;

      const response = await handler(new Request("http://localhost"), routeContext);

      await assertForbidden(response);
      expect(state.getClassWorkspace).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["CSV", getCsvTemplate],
    ["XLSX", getXlsxTemplate],
  ])("rejects non-owning Faculty %s template downloads", async (_format, handler) => {
    state.actor = faculty;
    state.workspaceFailure = new Error("Class owner access required");

    const response = await handler(new Request("http://localhost"), routeContext);

    await assertForbidden(response);
    expect(state.getClassWorkspace).toHaveBeenCalledWith(faculty, "class-1");
  });
});
