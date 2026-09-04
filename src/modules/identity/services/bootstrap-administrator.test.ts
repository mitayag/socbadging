import { describe, expect, it, vi } from "vitest";

import { bootstrapAdministrator } from "./bootstrap-administrator";

describe("bootstrapAdministrator", () => {
  it("refuses weak bootstrap credentials", async () => {
    const repository = { findByEmail: vi.fn(), createAdministrator: vi.fn() };

    await expect(
      bootstrapAdministrator(repository, {
        name: "System Administrator",
        email: "admin@hau.edu.ph",
        password: "short",
      }),
    ).rejects.toThrow("Bootstrap password must be at least 14 characters");
    expect(repository.createAdministrator).not.toHaveBeenCalled();
  });

  it("is idempotent when the Administrator already exists", async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue({ id: "existing-admin" }),
      createAdministrator: vi.fn(),
    };

    await expect(
      bootstrapAdministrator(repository, {
        name: "System Administrator",
        email: "ADMIN@HAU.EDU.PH",
        password: "A-strong-password-2026!",
      }),
    ).resolves.toEqual({ created: false, userId: "existing-admin" });
    expect(repository.createAdministrator).not.toHaveBeenCalled();
  });
});
