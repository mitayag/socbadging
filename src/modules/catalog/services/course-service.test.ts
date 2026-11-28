import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";

const mocks = vi.hoisted(() => ({
  findClass: vi.fn(),
  findCourse: vi.fn(),
  updateClass: vi.fn(),
  auditCreate: vi.fn(),
}));

const tx = {
  class: { update: mocks.updateClass },
  auditLog: { create: mocks.auditCreate },
};

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    class: { findUniqueOrThrow: mocks.findClass },
    course: { findUniqueOrThrow: mocks.findCourse },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { createCourse, mapClassToCourse, setCourseStatus, updateCourse } from "./course-service";

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

describe("course catalog authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findClass.mockResolvedValue({ id: "class-1", ownerUserId: "faculty-1" });
    mocks.findCourse.mockResolvedValue({
      id: "course-1",
      status: "ACTIVE",
      code: "CS101",
      title: "Intro",
    });
    mocks.updateClass.mockResolvedValue({ id: "class-1" });
  });

  it("blocks faculty from creating courses", async () => {
    await expect(
      createCourse(faculty, { code: "CS101", title: "Intro", programs: "" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("blocks faculty from updating or archiving courses", async () => {
    await expect(
      updateCourse(faculty, "course-1", { code: "CS101", title: "Intro", programs: "" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setCourseStatus(faculty, "course-1", "ARCHIVED")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("blocks faculty from mapping a class they do not own", async () => {
    mocks.findClass.mockResolvedValue({ id: "class-1", ownerUserId: "faculty-1" });
    await expect(mapClassToCourse(otherFaculty, "class-1", "course-1")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("maps an owned class to an active course", async () => {
    await mapClassToCourse(faculty, "class-1", "course-1");
    expect(mocks.updateClass).toHaveBeenCalledWith({
      where: { id: "class-1" },
      data: { courseId: "course-1", courseCode: "CS101", title: "Intro" },
    });
  });
});
