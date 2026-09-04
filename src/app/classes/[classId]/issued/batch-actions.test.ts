import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/types";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import {
  BATCH_SIGNING_UNAVAILABLE_MESSAGE,
  BatchSigningError,
} from "@/modules/issuance/services/batch-commit-service";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  commit: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/issuance/services/batch-commit-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/issuance/services/batch-commit-service")>()),
  commitBatchPreview: state.commit,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { commitBatchIssuanceAction } from "./batch-actions";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "f@example.edu",
  role: "FACULTY",
};
const admin: Actor = { id: "admin-1", name: "Admin", email: "a@example.edu", role: "ADMIN" };
function form(batchId: string) {
  const data = new FormData();
  data.set("batchId", batchId);
  return data;
}
const initialState = { status: "idle" as const, message: "" };

describe("commitBatchIssuanceAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.commit.mockResolvedValue({ id: "batch-1", classId: "class-1", alreadyCommitted: false });
  });
  it.each([
    ["unauthenticated", null],
    ["Administrator", admin],
  ])("denies %s before delegation", async (_name, actor) => {
    state.actor = actor;
    await expect(commitBatchIssuanceAction(initialState, form("batch-1"))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(state.commit).not.toHaveBeenCalled();
  });
  it("rejects an invalid batch ID before delegation", async () => {
    await expect(commitBatchIssuanceAction(initialState, form("../../secret"))).rejects.toThrow();
    expect(state.commit).not.toHaveBeenCalled();
  });
  it("delegates only the validated ID, revalidates relevant paths, and redirects", async () => {
    await commitBatchIssuanceAction(initialState, form("batch-1"));
    expect(state.commit).toHaveBeenCalledWith(faculty, "batch-1");
    expect(state.revalidatePath.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(["/classes/class-1/issued", "/issued", "/issuance-batches/batch-1"]),
    );
    expect(state.redirect).toHaveBeenCalledWith("/issuance-batches/batch-1?notice=committed");
  });
  it("redirects a repeated commit with the existing notice", async () => {
    state.commit.mockResolvedValueOnce({
      id: "batch-1",
      classId: "class-1",
      alreadyCommitted: true,
    });
    await commitBatchIssuanceAction(initialState, form("batch-1"));
    expect(state.redirect).toHaveBeenCalledWith("/issuance-batches/batch-1?notice=existing");
  });

  it("returns only the exact safe signing message without revalidation or redirect", async () => {
    state.commit.mockRejectedValueOnce(new BatchSigningError());

    await expect(commitBatchIssuanceAction(initialState, form("batch-1"))).resolves.toEqual({
      status: "signing-error",
      message: BATCH_SIGNING_UNAVAILABLE_MESSAGE,
    });

    expect(state.revalidatePath).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
