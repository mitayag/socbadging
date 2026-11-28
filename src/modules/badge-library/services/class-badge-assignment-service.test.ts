import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";

const mocks = vi.hoisted(() => ({
  findClass: vi.fn(),
  findVersion: vi.fn(),
  findAssignment: vi.fn(),
  createTemplate: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  auditCreate: vi.fn(),
}));

const tx = {
  badgeTemplate: { create: mocks.createTemplate },
  classBadgeAssignment: {
    create: mocks.createAssignment,
    update: mocks.updateAssignment,
  },
  auditLog: { create: mocks.auditCreate },
};

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    class: { findUniqueOrThrow: mocks.findClass },
    badgeDefinitionVersion: { findUniqueOrThrow: mocks.findVersion },
    classBadgeAssignment: { findUnique: mocks.findAssignment },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { assignBadgeToClass } from "./class-badge-assignment-service";

const faculty = {
  id: "faculty-1",
  name: "Faculty One",
  email: "faculty1@example.edu",
  role: "FACULTY" as const,
};
const otherFaculty = {
  id: "faculty-2",
  name: "Faculty Two",
  email: "faculty2@example.edu",
  role: "FACULTY" as const,
};

const approvedVersion = {
  id: "version-1",
  version: 2,
  name: "Prelim Skills",
  description: "Description",
  criteria: "Criteria",
  assessmentCriteria: "Criteria",
  imagePath: "badges/a.png",
  validityDays: 365,
  metadataJson: { skills: ["debugging"] },
  status: "APPROVED",
  badgeDefinitionId: "definition-1",
  badgeDefinition: { id: "definition-1", status: "APPROVED", courseId: "course-1" },
};

describe("shared class badge assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findClass.mockResolvedValue({
      id: "class-1",
      ownerUserId: "faculty-1",
      courseId: "course-1",
      status: "ACTIVE",
    });
    mocks.findVersion.mockResolvedValue(approvedVersion);
    mocks.findAssignment.mockResolvedValue(null);
    mocks.createTemplate.mockResolvedValue({ id: "template-1" });
    mocks.createAssignment.mockResolvedValue({ id: "assignment-1" });
  });

  it("blocks a faculty member from assigning to another faculty member's class", async () => {
    await expect(assignBadgeToClass(otherFaculty, "class-1", "version-1")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mocks.createTemplate).not.toHaveBeenCalled();
  });

  it("rejects unapproved badge versions", async () => {
    mocks.findVersion.mockResolvedValue({
      ...approvedVersion,
      status: "PENDING_APPROVAL",
      badgeDefinition: { ...approvedVersion.badgeDefinition, status: "PENDING_APPROVAL" },
    });
    await expect(assignBadgeToClass(faculty, "class-1", "version-1")).rejects.toThrow(
      "Only approved badge versions",
    );
  });

  it("prevents duplicate active assignments", async () => {
    mocks.findAssignment.mockResolvedValue({ id: "assignment-1", status: "ACTIVE" });
    await expect(assignBadgeToClass(faculty, "class-1", "version-1")).rejects.toThrow(
      "already assigned",
    );
  });

  it("materializes a class template from the approved version", async () => {
    await assignBadgeToClass(faculty, "class-1", "version-1");
    expect(mocks.createTemplate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: "class-1",
        ownerUserId: "faculty-1",
        name: "Prelim Skills",
        imagePath: "badges/a.png",
        sharedDefinitionVersionId: "version-1",
        expiresAfterDays: 365,
      }),
    });
    expect(mocks.createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: "class-1",
        badgeDefinitionId: "definition-1",
        badgeDefinitionVersionId: "version-1",
        badgeTemplateId: "template-1",
        assignedByUserId: "faculty-1",
        status: "ACTIVE",
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("rejects assigning a badge from a different course", async () => {
    mocks.findClass.mockResolvedValue({
      id: "class-1",
      ownerUserId: "faculty-1",
      courseId: "course-2",
      status: "ACTIVE",
    });
    await expect(assignBadgeToClass(faculty, "class-1", "version-1")).rejects.toThrow(
      "different course",
    );
  });
});
