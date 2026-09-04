import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
const mocks = vi.hoisted(() => ({
  findClass: vi.fn().mockResolvedValue({
    ownerUserId: "faculty-1",
    owner: { name: "Owner", email: "owner@example.edu" },
  }),
}));
vi.mock("@/platform/db/prisma", () => ({
  prisma: { class: { findUniqueOrThrow: mocks.findClass } },
}));
import { getClassWorkspace } from "./roster-service";
describe("roster ownership", () => {
  it("blocks a faculty member from another class roster", async () => {
    await expect(
      getClassWorkspace(
        { id: "faculty-2", name: "Other", email: "other@example.edu", role: "FACULTY" },
        "class-1",
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("allows administrator read-only inspection", async () => {
    await expect(
      getClassWorkspace(
        { id: "admin", name: "Admin", email: "admin@example.edu", role: "ADMIN" },
        "class-1",
      ),
    ).resolves.toMatchObject({ ownerUserId: "faculty-1" });
  });
});
