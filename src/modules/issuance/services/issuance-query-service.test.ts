import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  badgeFindMany: vi.fn(),
  classFindFirst: vi.fn(),
  enrollmentFindMany: vi.fn(),
  issuanceCount: vi.fn(),
  issuanceFindFirst: vi.fn(),
  issuanceFindMany: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    badgeIssuance: {
      count: mocks.issuanceCount,
      findFirst: mocks.issuanceFindFirst,
      findMany: mocks.issuanceFindMany,
    },
    badgeTemplate: { findMany: mocks.badgeFindMany },
    class: { findFirst: mocks.classFindFirst },
    classStudent: { findMany: mocks.enrollmentFindMany },
  },
}));

import {
  IssuanceNotFoundError,
  getIssuanceDetail,
  listIssuanceExportRows,
  listIssuances,
  listIssueOptions,
} from "./issuance-query-service";

const faculty: Actor = {
  id: "faculty-1",
  name: "Prof. Reyes",
  email: "reyes@example.edu",
  role: "FACULTY",
};

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};

const recipientSnapshot = {
  studentId: "student-1",
  studentNumber: "2026-00001",
  displayName: "Juan Dela Cruz",
  firstName: "Juan",
  lastName: "Dela Cruz",
  email: "juan@example.edu",
};

const achievementSnapshot = {
  badgeTemplateId: "badge-1",
  id: "https://badges.example.edu/achievements/badge-1",
  type: ["Achievement"],
  name: "Secure Systems Foundations",
  description: "Recognizes secure systems fundamentals.",
  criteria: { narrative: "Complete the secure systems assessment." },
  imagePath: "badges/secure-systems.png",
  image: { id: "https://badges.example.edu/api/media/badges/secure-systems.png", type: "Image" },
  skills: ["Security"],
  class: {
    id: "class-1",
    courseCode: "CS 401",
    title: "Secure Systems",
    section: "A",
    term: "First Semester",
    academicYear: "2026-2027",
  },
  expiresAfterDays: null,
  templateUpdatedAt: "2026-08-10T12:00:00.000Z",
};

const issuerSnapshot = {
  name: "Holy Angel University — School of Computing",
  url: "https://badges.example.edu",
  logoUrl: "https://badges.example.edu/images/hausoclogo.png",
  issuerUserId: "faculty-1",
  issuerUserName: "Prof. Reyes",
};

const credentialSnapshot = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "https://badges.example.edu/credentials/public-1",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  name: "Secure Systems Foundations",
  issuer: {
    id: "https://badges.example.edu",
    type: ["Profile"],
    name: "Holy Angel University — School of Computing",
    image: { id: "https://badges.example.edu/images/hausoclogo.png", type: "Image" },
  },
  validFrom: "2026-08-12T08:30:15.250Z",
  credentialSubject: {
    type: ["AchievementSubject"],
    identifier: [
      { type: "IdentityObject", identityHash: "a".repeat(64), identityType: "email", hashed: true },
    ],
    achievement: {
      id: "https://badges.example.edu/achievements/badge-1",
      type: ["Achievement"],
      name: "Secure Systems Foundations",
      description: "Recognizes secure systems fundamentals.",
      criteria: { narrative: "Complete the secure systems assessment." },
      image: {
        id: "https://badges.example.edu/api/media/badges/secure-systems.png",
        type: "Image",
      },
    },
  },
};

function issuance(overrides: Record<string, unknown> = {}) {
  return {
    id: "issuance-1",
    publicId: "public-1",
    status: "ACTIVE",
    issuedAt: new Date("2026-08-12T08:30:15.250Z"),
    expiresAt: null,
    classId: "class-1",
    badgeTemplateId: "badge-1",
    studentId: "student-1",
    issuerUserId: "faculty-1",
    recipientSnapshotJson: recipientSnapshot,
    achievementSnapshotJson: achievementSnapshot,
    issuerSnapshotJson: issuerSnapshot,
    credentialJson: credentialSnapshot,
    ...overrides,
  };
}

describe("listIssuances", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.issuanceFindMany.mockResolvedValue([issuance()]);
    mocks.issuanceCount.mockResolvedValue(1);
  });

  it("limits a Faculty database query to owned classes and never returns recipient email", async () => {
    const result = await listIssuances(faculty, {});

    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { ownerUserId: "faculty-1" } },
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: 20,
      }),
    );
    expect(mocks.issuanceCount).toHaveBeenCalledWith({
      where: { class: { ownerUserId: "faculty-1" } },
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "issuance-1",
          recipientDisplayName: "Juan Dela Cruz",
          badgeName: "Secure Systems Foundations",
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
    });
    expect(result.items[0]).not.toHaveProperty("recipientEmail");
  });

  it("allows Administrator reads without a Faculty owner predicate", async () => {
    await listIssuances(administrator, {});

    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("preserves normalized filters, search predicates, and pagination", async () => {
    await listIssuances(faculty, {
      query: "Dela Cruz",
      status: "EXPIRED",
      classId: "class-1",
      badgeTemplateId: "badge-1",
      page: "3",
    });

    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          class: { ownerUserId: "faculty-1" },
          status: "EXPIRED",
          classId: "class-1",
          badgeTemplateId: "badge-1",
          OR: [
            { recipientSnapshotJson: { path: "$.displayName", string_contains: "Dela Cruz" } },
            { recipientSnapshotJson: { path: "$.studentNumber", string_contains: "Dela Cruz" } },
            { achievementSnapshotJson: { path: "$.name", string_contains: "Dela Cruz" } },
            {
              achievementSnapshotJson: { path: "$.class.courseCode", string_contains: "Dela Cruz" },
            },
            { achievementSnapshotJson: { path: "$.class.title", string_contains: "Dela Cruz" } },
          ],
        },
        skip: 40,
        take: 20,
      }),
    );
  });

  it("normalizes malformed page input to the first page", async () => {
    const result = await listIssuances(faculty, { page: "not-a-page" });

    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    expect(result.page).toBe(1);
  });

  it("rejects an unauthenticated list before querying", async () => {
    await expect(listIssuances(null, {})).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.issuanceFindMany).not.toHaveBeenCalled();
  });
});

describe("getIssuanceDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.issuanceFindFirst.mockResolvedValue(issuance());
  });

  it("uses the ownership scope in the Faculty detail database query", async () => {
    const result = await getIssuanceDetail(faculty, "issuance-1");

    expect(mocks.issuanceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "issuance-1", class: { ownerUserId: "faculty-1" } } }),
    );
    expect(result.recipient.email).toBe("juan@example.edu");
    expect(result.credential).toEqual(credentialSnapshot);
  });

  it("does not apply an ownership restriction to Administrator detail reads", async () => {
    await getIssuanceDetail(administrator, "issuance-1");

    expect(mocks.issuanceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "issuance-1" } }),
    );
  });

  it("returns the same safe not-found result for another Faculty member's issuance", async () => {
    mocks.issuanceFindFirst.mockResolvedValueOnce(null);

    await expect(getIssuanceDetail(faculty, "other-faculty-issuance")).rejects.toBeInstanceOf(
      IssuanceNotFoundError,
    );
    expect(mocks.issuanceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-faculty-issuance", class: { ownerUserId: "faculty-1" } },
      }),
    );
  });

  it("rejects malformed historical snapshots instead of leaking unvalidated JSON", async () => {
    mocks.issuanceFindFirst.mockResolvedValueOnce(
      issuance({ recipientSnapshotJson: { ...recipientSnapshot, email: 42 } }),
    );

    await expect(getIssuanceDetail(faculty, "issuance-1")).rejects.toThrow(
      "Invalid recipient snapshot",
    );
  });
});

describe("listIssueOptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.classFindFirst.mockResolvedValue({
      id: "class-1",
      ownerUserId: "faculty-1",
      status: "ACTIVE",
    });
    mocks.badgeFindMany.mockResolvedValue([
      { id: "badge-1", name: "Access Control", imagePath: "badges/access.png" },
    ]);
    mocks.enrollmentFindMany.mockResolvedValue([
      {
        student: {
          id: "student-1",
          studentNumber: "2026-00001",
          firstName: "Juan",
          lastName: "Dela Cruz",
        },
      },
    ]);
  });

  it("requires an owned active class and selects only active badges and enrollments", async () => {
    const result = await listIssueOptions(faculty, "class-1");

    expect(mocks.classFindFirst).toHaveBeenCalledWith({
      where: { id: "class-1", ownerUserId: "faculty-1", status: "ACTIVE" },
      select: { id: true },
    });
    expect(mocks.badgeFindMany).toHaveBeenCalledWith({
      where: { classId: "class-1", ownerUserId: "faculty-1", status: "ACTIVE" },
      select: { id: true, name: true, imagePath: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    expect(mocks.enrollmentFindMany).toHaveBeenCalledWith({
      where: { classId: "class-1", enrollmentStatus: "ACTIVE" },
      select: {
        student: { select: { id: true, studentNumber: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
        { studentId: "asc" },
      ],
    });
    expect(result).toEqual({
      badgeOptions: [{ id: "badge-1", name: "Access Control", imagePath: "badges/access.png" }],
      studentOptions: [
        { id: "student-1", studentNumber: "2026-00001", displayName: "Juan Dela Cruz" },
      ],
    });
  });

  it("does not allow an Administrator to get issuance options", async () => {
    await expect(listIssueOptions(administrator, "class-1")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mocks.classFindFirst).not.toHaveBeenCalled();
  });

  it("uses a safe not-found result when the class is not owned and active", async () => {
    mocks.classFindFirst.mockResolvedValueOnce(null);

    await expect(listIssueOptions(faculty, "class-2")).rejects.toBeInstanceOf(
      IssuanceNotFoundError,
    );
    expect(mocks.badgeFindMany).not.toHaveBeenCalled();
    expect(mocks.enrollmentFindMany).not.toHaveBeenCalled();
  });
});

describe("listIssuanceExportRows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.issuanceFindMany.mockResolvedValue([issuance()]);
  });

  it("keeps email in the authorized export projection only", async () => {
    const rows = await listIssuanceExportRows(faculty, { classId: "class-1" });

    expect(rows).toEqual([
      expect.objectContaining({
        recipientEmail: "juan@example.edu",
        recipientDisplayName: "Juan Dela Cruz",
      }),
    ]);
    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { ownerUserId: "faculty-1" }, classId: "class-1" },
      }),
    );
  });

  it("rejects an unauthenticated export before querying issuance records", async () => {
    await expect(listIssuanceExportRows(null, {})).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.issuanceFindMany).not.toHaveBeenCalled();
  });

  it("allows Administrator export without a Faculty owner predicate and retains authorized email", async () => {
    const rows = await listIssuanceExportRows(administrator, {});

    expect(rows).toEqual([expect.objectContaining({ recipientEmail: "juan@example.edu" })]);
    expect(mocks.issuanceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
