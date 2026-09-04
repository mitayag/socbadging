import { hash } from "argon2";
import { describe, expect, it, vi } from "vitest";

import { authenticateWithPassword } from "./authenticate";

describe("authenticateWithPassword", () => {
  it("normalizes email and returns the public actor for valid active credentials", async () => {
    const passwordHash = await hash("A-strong-password-2026!");
    const repository = {
      findByNormalizedEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "System Administrator",
        email: "admin@hau.edu.ph",
        passwordHash,
        role: "ADMIN" as const,
        status: "ACTIVE" as const,
      }),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      authenticateWithPassword(repository, "  ADMIN@HAU.EDU.PH ", "A-strong-password-2026!"),
    ).resolves.toEqual({
      id: "user-1",
      name: "System Administrator",
      email: "admin@hau.edu.ph",
      role: "ADMIN",
    });
    expect(repository.findByNormalizedEmail).toHaveBeenCalledWith("admin@hau.edu.ph");
    expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith("user-1");
  });

  it("rejects a suspended account even when the password is valid", async () => {
    const passwordHash = await hash("A-strong-password-2026!");
    const repository = {
      findByNormalizedEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Suspended Faculty",
        email: "faculty@hau.edu.ph",
        passwordHash,
        role: "FACULTY" as const,
        status: "SUSPENDED" as const,
      }),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      authenticateWithPassword(repository, "faculty@hau.edu.ph", "A-strong-password-2026!"),
    ).resolves.toBeNull();
    expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("rejects a deleted account even when the password is valid", async () => {
    const passwordHash = await hash("A-strong-password-2026!");
    const repository = {
      findByNormalizedEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Deleted Faculty",
        email: "deleted@hau.edu.ph",
        passwordHash,
        role: "FACULTY" as const,
        status: "DELETED" as const,
      }),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      authenticateWithPassword(repository, "deleted@hau.edu.ph", "A-strong-password-2026!"),
    ).resolves.toBeNull();
    expect(repository.recordLoginAttempt).toHaveBeenCalledWith("deleted@hau.edu.ph", false);
    expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password without exposing which check failed", async () => {
    const repository = {
      findByNormalizedEmail: vi.fn().mockResolvedValue(null),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      authenticateWithPassword(repository, "missing@hau.edu.ph", "wrong-password"),
    ).resolves.toBeNull();
    expect(repository.recordLoginAttempt).toHaveBeenCalledWith("missing@hau.edu.ph", false);
  });
});
