import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { id: "faculty-1", name: "Faculty", email: "faculty@example.test", role: "FACULTY" },
  updateName: vi.fn(),
  changePassword: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/identity/services/account-service", () => ({
  AccountPasswordError: class AccountPasswordError extends Error {},
  updateOwnDisplayName: state.updateName,
  changeOwnPassword: state.changePassword,
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { changePasswordAction, updateAccountNameAction } from "./actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updateName.mockResolvedValue({ name: "Updated" });
    state.changePassword.mockResolvedValue({ changed: true });
  });

  it("updates the display name and refreshes affected pages", async () => {
    await expect(updateAccountNameAction(form({ name: "Updated Name" }))).rejects.toThrow(
      "REDIRECT:/account?notice=name-updated",
    );

    expect(state.updateName).toHaveBeenCalledWith(state.actor, { name: "Updated Name" });
    expect(state.revalidatePath).toHaveBeenCalledWith("/account");
    expect(state.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(state.revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("rejects mismatched password confirmation before calling the service", async () => {
    await expect(
      changePasswordAction(
        form({
          currentPassword: "current-password",
          newPassword: "a-new-password-value",
          confirmPassword: "different-password",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/account?error=password-mismatch");

    expect(state.changePassword).not.toHaveBeenCalled();
  });

  it("redirects with a safe error when the current password is invalid", async () => {
    const { AccountPasswordError } = await import("@/modules/identity/services/account-service");
    state.changePassword.mockRejectedValue(new AccountPasswordError());

    await expect(
      changePasswordAction(
        form({
          currentPassword: "wrong-password",
          newPassword: "a-new-password-value",
          confirmPassword: "a-new-password-value",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/account?error=current-password");
  });

  it("redirects to login after a successful password change", async () => {
    await expect(
      changePasswordAction(
        form({
          currentPassword: "current-password",
          newPassword: "a-new-password-value",
          confirmPassword: "a-new-password-value",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login?notice=password-updated");

    expect(state.changePassword).toHaveBeenCalledWith(state.actor, {
      currentPassword: "current-password",
      newPassword: "a-new-password-value",
    });
  });
});
