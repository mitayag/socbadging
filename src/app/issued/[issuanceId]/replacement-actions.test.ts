import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  replace: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/issuance/services/replacement-service", () => ({
  createSignedReplacement: state.replace,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));

import { replaceCredentialAction } from "./replacement-actions";

const admin: Actor = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
};
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.test",
  role: "FACULTY",
};

function form(confirmed = true, originalIssuanceId = "issuance-1") {
  const value = new FormData();
  value.set("originalIssuanceId", originalIssuanceId);
  if (confirmed) value.set("confirmation", "replace");
  return value;
}

describe("replaceCredentialAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = admin;
    state.replace.mockResolvedValue({ replacementId: "replacement-1", publicId: "public-2" });
  });

  it("denies an anonymous submission before invoking the service", async () => {
    state.actor = null;

    await expect(replaceCredentialAction(form())).rejects.toBeInstanceOf(AuthorizationError);

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("denies a Faculty submission before invoking the service", async () => {
    state.actor = faculty;

    await expect(replaceCredentialAction(form())).rejects.toThrow("Administrator access required");

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("requires explicit Administrator confirmation before replacement", async () => {
    await expect(replaceCredentialAction(form(false))).rejects.toThrow(
      "Replacement confirmation is required",
    );

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("passes only validated input and the authenticated Administrator identity to the service", async () => {
    const submitted = form();
    submitted.set("privateKey", "must-not-cross-the-action-boundary");

    await replaceCredentialAction(submitted);

    expect(state.replace).toHaveBeenCalledWith({
      originalIssuanceId: "issuance-1",
      actorId: admin.id,
    });
    expect(state.revalidate.mock.calls.map(([path]) => path)).toEqual([
      "/issued/issuance-1",
      "/issued/replacement-1",
    ]);
  });

  it("uses the same safe error for malformed input and unexpected service diagnostics", async () => {
    const malformed = await replaceCredentialAction(form(true, "../../private")).catch(
      (error: unknown) => error,
    );
    expect(malformed).toMatchObject({ message: "Credential replacement is unavailable" });
    expect(state.replace).not.toHaveBeenCalled();

    state.replace.mockRejectedValueOnce(
      new Error("database at mysql://root:secret@example.test is unavailable"),
    );
    const failed = await replaceCredentialAction(form()).catch((error: unknown) => error);
    expect(failed).toMatchObject({ message: "Credential replacement is unavailable" });
    expect((failed as Error).message).not.toContain("secret");
    expect(state.revalidate).not.toHaveBeenCalled();
  });
});
