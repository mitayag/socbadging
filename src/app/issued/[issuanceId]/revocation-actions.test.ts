import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  revokeCredential: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/issuance/services/revocation-service", () => ({
  revokeCredentialForAction: state.revokeCredential,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { revokeCredentialAction } from "./revocation-actions";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY",
};
const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};

function revocationForm(overrides: Record<string, FormDataEntryValue> = {}) {
  const form = new FormData();
  form.set("issuanceId", "issuance-1");
  form.set("reason", "Academic review");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("revokeCredentialAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.revokeCredential.mockResolvedValue({
      issuanceId: "issuance-1",
      publicId: "abcdefghijklmnopqrstuvwxyzABCDEF",
      classId: "class-1",
      alreadyRevoked: false,
    });
  });

  it("accepts only FormData and validates only the issuance ID and reason before delegation", async () => {
    await expect(revokeCredentialAction({} as FormData)).rejects.toThrow();
    await expect(revokeCredentialAction(revocationForm({ reason: "\n" }))).rejects.toThrow();
    await expect(
      revokeCredentialAction(revocationForm({ issuanceId: "../../secret" })),
    ).rejects.toThrow();
    expect(state.revokeCredential).not.toHaveBeenCalled();
  });

  it("independently rejects an unauthenticated caller without invoking the service", async () => {
    state.actor = null;
    await expect(revokeCredentialAction(revocationForm())).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(state.revokeCredential).not.toHaveBeenCalled();
  });

  it("allows either authenticated role to delegate authorization to the service", async () => {
    state.actor = administrator;
    await revokeCredentialAction(revocationForm());
    expect(state.revokeCredential).toHaveBeenCalledWith(administrator, {
      issuanceId: "issuance-1",
      reason: "Academic review",
    });
  });

  it("delegates validated input, revalidates authenticated/public paths, and redirects after a revocation", async () => {
    await revokeCredentialAction(revocationForm());
    expect(state.revokeCredential).toHaveBeenCalledWith(faculty, {
      issuanceId: "issuance-1",
      reason: "Academic review",
    });
    expect(state.revalidatePath.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "/issued",
        "/issued/issuance-1",
        "/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
        "/classes/class-1/issued",
      ]),
    );
    expect(state.redirect).toHaveBeenCalledWith("/issued/issuance-1?notice=revoked");
  });

  it("redirects an idempotent submission with the existing notice", async () => {
    state.revokeCredential.mockResolvedValueOnce({
      issuanceId: "issuance-1",
      publicId: "abcdefghijklmnopqrstuvwxyzABCDEF",
      classId: "class-1",
      alreadyRevoked: true,
    });
    await revokeCredentialAction(revocationForm());
    expect(state.redirect).toHaveBeenCalledWith("/issued/issuance-1?notice=existing");
  });

  it("does not turn a service authorization failure into an existence-disclosing redirect", async () => {
    state.revokeCredential.mockRejectedValueOnce(
      new AuthorizationError("Credential is unavailable"),
    );
    await expect(revokeCredentialAction(revocationForm())).rejects.toThrow(
      "Credential is unavailable",
    );
    expect(state.revalidatePath).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
