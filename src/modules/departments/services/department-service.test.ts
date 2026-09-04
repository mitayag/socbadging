import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { createDepartment, normalizeDepartmentName } from "./department-service";

const faculty = {
  id: "f1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY" as const,
};

describe("department service", () => {
  it("normalizes case and repeated whitespace for duplicate detection", () => {
    expect(normalizeDepartmentName("  School   of COMPUTING ")).toBe("school of computing");
  });

  it("rejects department creation by faculty before database access", async () => {
    await expect(createDepartment(faculty, "Information Technology")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});
