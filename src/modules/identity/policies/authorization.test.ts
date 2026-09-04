import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  requireAuthenticated,
  requireClassOwner,
  requireRole,
} from "./authorization";
import type { Actor } from "../types";

const admin: Actor = { id: "admin-1", name: "Admin", email: "admin@hau.edu.ph", role: "ADMIN" };
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@hau.edu.ph",
  role: "FACULTY",
};

describe("identity authorization policies", () => {
  it("rejects anonymous access to protected services", () => {
    expect(() => requireAuthenticated(null)).toThrowError(AuthorizationError);
  });

  it("allows an Administrator through an Administrator-only boundary", () => {
    expect(requireRole(admin, "ADMIN")).toEqual(admin);
  });

  it("rejects Faculty from an Administrator-only boundary", () => {
    expect(() => requireRole(faculty, "ADMIN")).toThrowError("Administrator access required");
  });

  it("allows both supported roles through a shared authenticated boundary", () => {
    expect(requireRole(faculty, ["ADMIN", "FACULTY"])).toEqual(faculty);
  });
});

describe("requireClassOwner", () => {
  it("allows the owning faculty member", () => {
    expect(
      requireClassOwner(
        { id: "faculty-1", name: "Faculty", email: "f@example.edu", role: "FACULTY" },
        "faculty-1",
      ).id,
    ).toBe("faculty-1");
  });

  it("rejects another faculty member and administrators", () => {
    expect(() =>
      requireClassOwner(
        { id: "faculty-2", name: "Other", email: "o@example.edu", role: "FACULTY" },
        "faculty-1",
      ),
    ).toThrow(AuthorizationError);
    expect(() =>
      requireClassOwner(
        { id: "admin", name: "Admin", email: "a@example.edu", role: "ADMIN" },
        "faculty-1",
      ),
    ).toThrow(AuthorizationError);
  });
});
