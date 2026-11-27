import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  commit: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/rosters/services/roster-service", () => ({
  addStudent: vi.fn(),
  editStudent: vi.fn(),
  setEnrollmentStatus: vi.fn(),
}));
vi.mock("@/modules/rosters/services/import-service", () => ({
  commitImportPreview: state.commit,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { commitImportAction } from "./actions";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "f@example.edu",
  role: "FACULTY",
};
const admin: Actor = { id: "admin-1", name: "Admin", email: "a@example.edu", role: "ADMIN" };
const initialState = { status: "idle" as const, message: "", importedCount: 0 };

function form(previewId: string) {
  const data = new FormData();
  data.set("previewId", previewId);
  return data;
}

describe("commitImportAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.commit.mockResolvedValue({ classId: "class-1", importedCount: 2 });
  });

  it.each([
    ["unauthenticated", null],
    ["Administrator", admin],
  ])("denies %s before delegation", async (_name, actor) => {
    state.actor = actor;
    await expect(commitImportAction(initialState, form("preview-1"))).resolves.toEqual({
      status: "error",
      message: "You do not have permission to import this roster.",
      importedCount: 0,
    });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("rejects a missing or oversized preview ID before delegation", async () => {
    await expect(commitImportAction(initialState, form(""))).resolves.toMatchObject({
      status: "error",
      importedCount: 0,
    });
    await expect(commitImportAction(initialState, form("x".repeat(192)))).resolves.toMatchObject({
      status: "error",
      importedCount: 0,
    });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("delegates the validated preview ID, revalidates the preview class, and returns the count", async () => {
    await expect(commitImportAction(initialState, form(" preview-1 "))).resolves.toEqual({
      status: "success",
      message: "Imported 2 students into the class roster.",
      importedCount: 2,
    });
    expect(state.commit).toHaveBeenCalledWith(faculty, "preview-1");
    expect(state.revalidatePath).toHaveBeenCalledWith("/classes/class-1/students");
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it.each([
    "Import preview is no longer available",
    "Resolve all validation errors before commit",
    "Import preview belongs to another user",
  ])("returns the safe service error %s", async (message) => {
    state.commit.mockRejectedValueOnce(new Error(message));
    await expect(commitImportAction(initialState, form("preview-1"))).resolves.toEqual({
      status: "error",
      message,
      importedCount: 0,
    });
    expect(state.revalidatePath).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic message for unexpected failures without leaking details", async () => {
    state.commit.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:3306"));
    await expect(commitImportAction(initialState, form("preview-1"))).resolves.toEqual({
      status: "error",
      message: "The roster could not be imported. Review the file and try again.",
      importedCount: 0,
    });
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });
});
