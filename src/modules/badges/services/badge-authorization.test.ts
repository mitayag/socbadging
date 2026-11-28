import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
const mocks = vi.hoisted(() => ({ findClass: vi.fn(), findTemplate: vi.fn() }));
vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    class: { findUniqueOrThrow: mocks.findClass },
    badgeTemplate: { findUniqueOrThrow: mocks.findTemplate },
  },
}));
import { createBadge, editBadge, listBadges } from "./badge-service";
const other = {
  id: "faculty-2",
  name: "Other",
  email: "other@example.edu",
  role: "FACULTY" as const,
};
describe("badge ownership", () => {
  beforeEach(() => mocks.findClass.mockResolvedValue({ ownerUserId: "faculty-1" }));
  it("blocks another faculty member from reading templates", async () => {
    await expect(listBadges(other, "class-1")).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("blocks another faculty member before artwork processing", async () => {
    await expect(
      createBadge(other, "class-1", {}, new File([], "badge.png")),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("blocks faculty from editing a materialized shared badge template", async () => {
    mocks.findTemplate.mockResolvedValue({
      id: "badge-1",
      classId: "class-1",
      ownerUserId: "faculty-1",
      sharedDefinitionVersionId: "version-1",
    });
    await expect(
      editBadge(
        { id: "faculty-1", name: "Owner", email: "owner@example.edu", role: "FACULTY" },
        "badge-1",
        {},
      ),
    ).rejects.toThrow("managed from the badge library");
  });
});
