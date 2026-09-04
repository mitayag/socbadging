import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  update: vi.fn(),
  revalidatePath: vi.fn(),
  activate: vi.fn(),
  retire: vi.fn(),
  compromise: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/settings/services/system-settings-service", () => ({
  updateSystemSettings: state.update,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("@/modules/signing/key-service", () => ({
  activateSigningKey: state.activate,
  retireSigningKey: state.retire,
  markSigningKeyCompromised: state.compromise,
  registerPublicSigningKey: state.register,
}));

import { signingKeyAction, updateSystemSettingsAction } from "./actions";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@hau.edu.ph", role: "ADMIN" };
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@hau.edu.ph",
  role: "FACULTY",
};
function form(overrides: Record<string, string> = {}) {
  const value = new FormData();
  for (const [key, item] of Object.entries({
    issuerName: "HAU School of Computing",
    issuerUrl: "https://hau.edu.ph",
    issuerLogoPath: "/images/logo.png",
    supportContact: "support@hau.edu.ph",
    sharingEnabled: "on",
    ...overrides,
  }))
    value.set(key, item);
  return value;
}

describe("updateSystemSettingsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = admin;
    state.update.mockResolvedValue({
      issuerName: "HAU School of Computing",
      issuerUrl: "https://hau.edu.ph",
      issuerLogoPath: "/images/logo.png",
      supportContact: "support@hau.edu.ph",
      sharingEnabled: true,
    });
  });

  it("reauthenticates and sends only strict approved settings fields to the service", async () => {
    const result = await updateSystemSettingsAction(form({ ignored: "secret" }));
    expect(state.update).toHaveBeenCalledWith(admin, {
      issuerName: "HAU School of Computing",
      issuerUrl: "https://hau.edu.ph",
      issuerLogoPath: "/images/logo.png",
      supportContact: "support@hau.edu.ph",
      sharingEnabled: true,
    });
    expect(result).toEqual({ ok: true });
    expect(state.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(state.revalidatePath).toHaveBeenCalledWith("/credentials/[publicId]", "page");
  });

  it("denies unauthenticated and Faculty submissions before mutation", async () => {
    state.actor = null;
    await expect(updateSystemSettingsAction(form())).rejects.toBeInstanceOf(AuthorizationError);
    state.actor = faculty;
    await expect(updateSystemSettingsAction(form())).rejects.toThrow(
      "Administrator access required",
    );
    expect(state.update).not.toHaveBeenCalled();
  });

  it("returns field-safe validation state without mutation", async () => {
    const result = await updateSystemSettingsAction(form({ issuerUrl: "javascript:alert(1)" }));
    expect(result).toEqual({ ok: false, message: "Review the highlighted settings fields." });
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("signingKeyAction", () => {
  it("denies anonymous and Faculty lifecycle requests server-side", async () => {
    const request = new FormData();
    request.set("intent", "activate");
    request.set("confirmation", "confirm");
    request.set("keyId", "key-1");
    state.actor = null;
    await expect(signingKeyAction(request)).rejects.toBeInstanceOf(AuthorizationError);
    state.actor = faculty;
    await expect(signingKeyAction(request)).rejects.toThrow("Administrator access required");
    expect(state.activate).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before an Administrator lifecycle change", async () => {
    const request = new FormData();
    request.set("intent", "activate");
    request.set("keyId", "key-1");
    state.actor = admin;
    await expect(signingKeyAction(request)).resolves.toEqual({
      ok: false,
      message: "Confirm the requested key lifecycle action.",
    });
    expect(state.activate).not.toHaveBeenCalled();
  });

  it("rejects private or extra key form fields without calling lifecycle services", async () => {
    const request = new FormData();
    request.set("intent", "activate");
    request.set("confirmation", "confirm");
    request.set("keyId", "key-1");
    request.set("privateKey", "never-accepted");
    state.actor = admin;
    await expect(signingKeyAction(request)).resolves.toEqual({
      ok: false,
      message: "Review the public key metadata.",
    });
    expect(state.activate).not.toHaveBeenCalled();
  });
});
