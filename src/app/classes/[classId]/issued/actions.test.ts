import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import {
  SIGNER_UNAVAILABLE_MESSAGE,
  SignedIssuanceError,
} from "@/modules/issuance/services/signed-issuance-service";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  issueBadge: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));

vi.mock("@/modules/issuance/services/issuance-service", () => ({
  issueBadge: state.issueBadge,
}));

vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { issueBadgeAction } from "./actions";

const faculty: Actor = {
  id: "faculty-1",
  name: "Prof. Reyes",
  email: "reyes@example.edu",
  role: "FACULTY",
};

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};
const initialState = { status: "idle" as const, message: "" };

function issueForm(overrides: Record<string, FormDataEntryValue> = {}) {
  const form = new FormData();
  form.set("classId", "class-1");
  form.set("badgeTemplateId", "badge-1");
  form.set("studentId", "student-1");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("issueBadgeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.issueBadge.mockResolvedValue({
      issuanceId: "issuance-1",
      publicId: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      alreadyIssued: false,
    });
  });

  it.each([
    ["unauthenticated", null],
    ["Administrator", administrator],
  ])("rejects a %s caller before the issuance service runs", async (_caseName, actor) => {
    state.actor = actor;

    await expect(issueBadgeAction(initialState, issueForm())).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    expect(state.issueBadge).not.toHaveBeenCalled();
  });

  it("rejects malformed FormData before the issuance service runs", async () => {
    await expect(issueBadgeAction(initialState, issueForm({ studentId: "  " }))).rejects.toThrow();

    expect(state.issueBadge).not.toHaveBeenCalled();
  });

  it("issues the validated IDs, revalidates issuance records, and safely redirects", async () => {
    await issueBadgeAction(initialState, issueForm());

    expect(state.issueBadge).toHaveBeenCalledWith(faculty, {
      classId: "class-1",
      badgeTemplateId: "badge-1",
      studentId: "student-1",
    });
    expect(state.revalidatePath).toHaveBeenCalledWith("/classes/class-1/issued");
    expect(state.revalidatePath).toHaveBeenCalledWith("/issued");
    expect(state.revalidatePath).toHaveBeenCalledWith("/issued/issuance-1");
    expect(state.redirect).toHaveBeenCalledWith("/issued/issuance-1?notice=issued");
  });

  it("uses the existing notice for an idempotent result", async () => {
    state.issueBadge.mockResolvedValueOnce({
      issuanceId: "issuance-existing",
      publicId: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      alreadyIssued: true,
    });

    await issueBadgeAction(initialState, issueForm());

    expect(state.redirect).toHaveBeenCalledWith("/issued/issuance-existing?notice=existing");
  });

  it("returns the exact retryable signing message without redirecting or exposing internal codes", async () => {
    state.issueBadge.mockRejectedValueOnce(
      new SignedIssuanceError(true, "fdb53f9c-35bd-47e5-bf0c-79569a855f6e"),
    );

    await expect(issueBadgeAction(initialState, issueForm())).resolves.toEqual({
      status: "retryable-error",
      message: SIGNER_UNAVAILABLE_MESSAGE,
    });

    expect(state.revalidatePath).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("returns a non-retryable safe correlation message", async () => {
    const failure = new SignedIssuanceError(false, "fdb53f9c-35bd-47e5-bf0c-79569a855f6e");
    state.issueBadge.mockRejectedValueOnce(failure);

    await expect(issueBadgeAction(initialState, issueForm())).resolves.toEqual({
      status: "error",
      message: failure.message,
    });
    expect(failure.message).not.toContain("INVALID_PROOF");
  });
});
