import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";

const mocks = vi.hoisted(() => ({
  findDefinition: vi.fn(),
  findVersion: vi.fn(),
  findCourse: vi.fn(),
  findManyDefinitions: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    badgeDefinition: {
      findUniqueOrThrow: mocks.findDefinition,
      findMany: mocks.findManyDefinitions,
    },
    badgeDefinitionVersion: { findUniqueOrThrow: mocks.findVersion },
    course: { findUniqueOrThrow: mocks.findCourse },
    $transaction: vi.fn(),
  },
}));

import {
  createBadgeDefinition,
  detectDuplicateCandidates,
  reviewBadgeDefinition,
  reviseBadgeDefinition,
  rollupDefinitionStatus,
  submitBadgeDefinition,
} from "./badge-library-service";

const faculty = {
  id: "faculty-1",
  name: "Faculty One",
  email: "faculty1@example.edu",
  role: "FACULTY" as const,
};

describe("badge library lifecycle rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCourse.mockResolvedValue({ id: "course-1", status: "ACTIVE" });
  });

  it("rolls definition status up from approved versions even when a newer draft exists", () => {
    expect(
      rollupDefinitionStatus([{ status: "DRAFT" }, { status: "APPROVED" }, { status: "ARCHIVED" }]),
    ).toBe("APPROVED");
    expect(rollupDefinitionStatus([{ status: "DRAFT" }, { status: "PENDING_APPROVAL" }])).toBe(
      "PENDING_APPROVAL",
    );
    expect(rollupDefinitionStatus([{ status: "DRAFT" }])).toBe("DRAFT");
  });

  it("blocks faculty from approving or rejecting badge versions", async () => {
    await expect(reviewBadgeDefinition(faculty, "version-1", "APPROVED")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("blocks faculty from revising an approved shared definition", async () => {
    mocks.findDefinition.mockResolvedValue({
      id: "definition-1",
      courseId: "course-1",
      createdByUserId: faculty.id,
      status: "APPROVED",
      versions: [{ id: "version-1", version: 1, status: "APPROVED" }],
    });
    await expect(
      reviseBadgeDefinition(faculty, "definition-1", {
        courseId: "course-1",
        name: "Badge",
        description: "Long enough description",
        competencies: "Competency",
        assessmentCriteria: "Assessment criteria long enough",
        issuingInstitution: "HAU SOC",
      }),
    ).rejects.toThrow("Only administrators can revise");
  });

  it("blocks faculty from submitting another faculty member's proposal", async () => {
    mocks.findDefinition.mockResolvedValue({
      id: "definition-1",
      createdByUserId: "faculty-2",
      status: "DRAFT",
      versions: [{ id: "version-1", version: 1, status: "DRAFT" }],
    });
    await expect(submitBadgeDefinition(faculty, "definition-1")).rejects.toThrow(
      "only submit your own",
    );
  });

  it("refuses to create badges for archived courses", async () => {
    mocks.findCourse.mockResolvedValue({ id: "course-1", status: "ARCHIVED" });
    await expect(
      createBadgeDefinition(
        faculty,
        {
          courseId: "course-1",
          name: "Badge",
          description: "Long enough description",
          competencies: "Competency",
          assessmentCriteria: "Assessment criteria long enough",
          issuingInstitution: "HAU SOC",
        },
        new File([], "badge.png"),
      ),
    ).rejects.toThrow("active courses");
  });

  it("reports duplicate candidates without merging", async () => {
    mocks.findManyDefinitions.mockResolvedValue([
      {
        id: "definition-2",
        name: "Prelim Skills",
        course: { code: "CS101", title: "Intro" },
        versions: [{ criteria: "Build a working app", imagePath: "badges/a.png" }],
      },
    ]);
    const duplicates = await detectDuplicateCandidates(faculty, {
      courseId: "course-1",
      name: "prelim skills",
      criteria: "build a working app",
      imagePath: "badges/a.png",
    });
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.reasons).toEqual([
      "same name",
      "same assessment criteria",
      "same artwork",
    ]);
  });
});
