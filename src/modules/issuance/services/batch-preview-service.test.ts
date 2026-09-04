import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  batchCreate: vi.fn(),
  batchFindFirst: vi.fn(),
  batchFindMany: vi.fn(),
  badgeFindFirst: vi.fn(),
  classFindFirst: vi.fn(),
  enrollmentFindMany: vi.fn(),
  issuanceFindMany: vi.fn(),
  prepareSignedIssuance: vi.fn(),
  studentFindMany: vi.fn(),
  transaction: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    issuanceBatch: { findFirst: mocks.batchFindFirst, findMany: mocks.batchFindMany },
    badgeTemplate: { findFirst: mocks.badgeFindFirst },
    class: { findFirst: mocks.classFindFirst },
  },
}));
vi.mock("./signed-issuance-service", () => ({
  prepareSignedIssuance: mocks.prepareSignedIssuance,
}));

import {
  BatchNotFoundError,
  BatchUnavailableError,
  authorizeBatchSelection,
  authorizeBatchClass,
  createBatchPreview,
  getBatchDetail,
  listClassBatches,
} from "./batch-preview-service";

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

describe("authorizeBatchSelection", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["unauthenticated", null],
    ["Administrator", administrator],
  ])("denies an %s caller before database access", async (_name, actor) => {
    await expect(authorizeBatchSelection(actor, "class-1", "badge-1")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mocks.badgeFindFirst).not.toHaveBeenCalled();
  });

  it("authorizes only an active owned class, badge, and Faculty database account", async () => {
    mocks.badgeFindFirst.mockResolvedValueOnce({ id: "badge-1" });
    await expect(authorizeBatchSelection(faculty, "class-1", "badge-1")).resolves.toBeUndefined();
    expect(mocks.badgeFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "badge-1",
        classId: "class-1",
        ownerUserId: "faculty-1",
        status: "ACTIVE",
      }),
      select: { id: true },
    });
  });

  it("returns the same safe not-found error for an inaccessible selection", async () => {
    mocks.badgeFindFirst.mockResolvedValueOnce(null);
    await expect(authorizeBatchSelection(faculty, "class-1", "badge-1")).rejects.toBeInstanceOf(
      BatchNotFoundError,
    );
  });
});

describe("authorizeBatchClass", () => {
  beforeEach(() => vi.resetAllMocks());

  it("denies an inactive or inaccessible Faculty/class combination safely", async () => {
    mocks.classFindFirst.mockResolvedValueOnce(null);
    await expect(authorizeBatchClass(faculty, "class-1")).rejects.toBeInstanceOf(
      BatchNotFoundError,
    );
    expect(mocks.classFindFirst).toHaveBeenCalledWith({
      where: {
        id: "class-1",
        ownerUserId: "faculty-1",
        status: "ACTIVE",
        owner: { id: "faculty-1", role: "FACULTY", status: "ACTIVE" },
      },
      select: { id: true },
    });
  });
});
const input = {
  classId: "class-1",
  badgeTemplateId: "badge-1",
  sourceFilename: "august-issuance.csv",
  mapping: { studentNumber: 0, email: 1 },
  rows: [
    ["2026-00001", "juan@example.edu"],
    ["2026-00002", "maria@example.edu"],
    ["2026-40404", "missing@example.edu"],
  ],
};

const expectedClassifiedRows = [
  {
    rowNumber: 2,
    studentNumber: "2026-00001",
    emailSupplied: "juan@example.edu",
    disposition: "READY",
    message: "Ready to issue.",
    studentId: "student-1",
    issuanceId: null,
    publicId: null,
  },
  {
    rowNumber: 3,
    studentNumber: "2026-00002",
    emailSupplied: "maria@example.edu",
    disposition: "ALREADY_ISSUED",
    message: "Badge already issued.",
    studentId: "student-2",
    issuanceId: "issuance-2",
    publicId: "public-2",
  },
  {
    rowNumber: 4,
    studentNumber: "2026-40404",
    emailSupplied: "missing@example.edu",
    disposition: "STUDENT_NOT_FOUND",
    message: "Student number was not found.",
    studentId: null,
    issuanceId: null,
    publicId: null,
  },
];

const expectedMappedRows = [
  {
    rowNumber: 2,
    studentNumber: "2026-00001",
    studentNumberKey: "2026-00001",
    emailSupplied: "juan@example.edu",
    invalidReason: null,
  },
  {
    rowNumber: 3,
    studentNumber: "2026-00002",
    studentNumberKey: "2026-00002",
    emailSupplied: "maria@example.edu",
    invalidReason: null,
  },
  {
    rowNumber: 4,
    studentNumber: "2026-40404",
    studentNumberKey: "2026-40404",
    emailSupplied: "missing@example.edu",
    invalidReason: null,
  },
];

const expectedStoredMapping = {
  version: "batch-preview-v2",
  mapping: { studentNumber: 0, email: 1 },
  mappedRows: expectedMappedRows,
  reviewedRows: expectedClassifiedRows,
};

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    classId: "class-1",
    badgeTemplateId: "badge-1",
    facultyUserId: "faculty-1",
    sourceFilename: "august-issuance.csv",
    mappingJson: expectedStoredMapping,
    rowsJson: expectedClassifiedRows,
    previewFingerprint: "fc5473315283ca89228aacd5526f1a60c7ae3fd448f574da4b7aa9ed23bb2ba9",
    totalRows: 3,
    readyCount: 1,
    alreadyIssuedCount: 1,
    invalidCount: 1,
    issuedCount: 0,
    status: "READY",
    expiresAt: new Date("2026-08-12T09:00:00.000Z"),
    committedAt: null,
    createdAt: new Date("2026-08-12T08:30:00.000Z"),
    updatedAt: new Date("2026-08-12T08:30:00.000Z"),
    ...overrides,
  };
}

function createTransactionFixture() {
  const tx = {
    auditLog: { create: mocks.auditCreate },
    badgeIssuance: { findMany: mocks.issuanceFindMany },
    badgeTemplate: { findFirst: mocks.badgeFindFirst },
    class: { findFirst: mocks.classFindFirst },
    classStudent: { findMany: mocks.enrollmentFindMany },
    issuanceBatch: { create: mocks.batchCreate },
    student: { findMany: mocks.studentFindMany },
    user: { findFirst: mocks.userFindFirst },
  };
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
}

function arrangePreview() {
  mocks.userFindFirst.mockResolvedValue({ id: "faculty-1", role: "FACULTY", status: "ACTIVE" });
  mocks.classFindFirst.mockResolvedValue({ id: "class-1" });
  mocks.badgeFindFirst.mockResolvedValue({ id: "badge-1" });
  mocks.studentFindMany.mockResolvedValue([
    { id: "student-1", studentNumber: "2026-00001", email: "juan@example.edu" },
    { id: "student-2", studentNumber: "2026-00002", email: "maria@example.edu" },
  ]);
  mocks.enrollmentFindMany.mockResolvedValue([
    { studentId: "student-1" },
    { studentId: "student-2" },
  ]);
  mocks.issuanceFindMany.mockResolvedValue([
    {
      id: "issuance-2",
      publicId: "public-2",
      studentId: "student-2",
      status: "ACTIVE",
      supersedesId: null,
      supersededById: null,
    },
  ]);
  mocks.batchCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(batch({ ...data, committedAt: null, updatedAt: data.createdAt })),
  );
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
}

const originalStudentTwoIssuance = {
  id: "issuance-original",
  publicId: "public-original",
  studentId: "student-2",
  status: "ACTIVE",
  supersedesId: null,
  supersededById: "issuance-replacement",
};

const replacementStudentTwoIssuance = {
  id: "issuance-replacement",
  publicId: "public-replacement",
  studentId: "student-2",
  status: "ACTIVE",
  supersedesId: "issuance-original",
  supersededById: null,
};

describe("createBatchPreview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T08:30:00.000Z"));
    createTransactionFixture();
    arrangePreview();
  });

  it("persists a classified immutable preview and identifier-only audit in one transaction", async () => {
    const result = await createBatchPreview(faculty, input);

    expect(result).toEqual({
      id: "batch-1",
      classId: "class-1",
      badgeTemplateId: "badge-1",
      facultyUserId: "faculty-1",
      sourceFilename: "august-issuance.csv",
      mapping: { studentNumber: 0, email: 1 },
      previewFingerprint: "fc5473315283ca89228aacd5526f1a60c7ae3fd448f574da4b7aa9ed23bb2ba9",
      totalRows: 3,
      status: "READY",
      readyCount: 1,
      alreadyIssuedCount: 1,
      invalidCount: 1,
      issuedCount: 0,
      expiresAt: "2026-08-12T09:00:00.000Z",
      committedAt: null,
      createdAt: "2026-08-12T08:30:00.000Z",
      updatedAt: "2026-08-12T08:30:00.000Z",
      rows: expectedClassifiedRows,
    });
    expect(mocks.studentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.enrollmentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.issuanceFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.batchCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: "class-1",
        badgeTemplateId: "badge-1",
        facultyUserId: "faculty-1",
        sourceFilename: "august-issuance.csv",
        mappingJson: expectedStoredMapping,
        rowsJson: expectedClassifiedRows,
        previewFingerprint: "fc5473315283ca89228aacd5526f1a60c7ae3fd448f574da4b7aa9ed23bb2ba9",
        totalRows: 3,
        readyCount: 1,
        alreadyIssuedCount: 1,
        invalidCount: 1,
        issuedCount: 0,
        status: "READY",
        createdAt: new Date("2026-08-12T08:30:00.000Z"),
        expiresAt: new Date("2026-08-12T09:00:00.000Z"),
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "faculty-1",
        action: "badge.batch_previewed",
        entityType: "IssuanceBatch",
        entityId: "batch-1",
        contextJson: {
          classId: "class-1",
          badgeTemplateId: "badge-1",
          batchId: "batch-1",
          totalRows: 3,
          readyCount: 1,
          alreadyIssuedCount: 1,
          invalidCount: 1,
        },
      },
    });
    expect(mocks.prepareSignedIssuance).not.toHaveBeenCalled();
  });

  it.each([
    ["original-first", [originalStudentTwoIssuance, replacementStudentTwoIssuance]],
    ["replacement-first", [replacementStudentTwoIssuance, originalStudentTwoIssuance]],
  ])(
    "uses the terminal replacement in an already-issued preview for %s database row order",
    async (_label, issuances) => {
      mocks.issuanceFindMany.mockResolvedValueOnce(issuances);

      const result = await createBatchPreview(faculty, input);

      expect(result.rows[1]).toMatchObject({
        disposition: "ALREADY_ISSUED",
        issuanceId: "issuance-replacement",
        publicId: "public-replacement",
      });
    },
  );

  it.each([
    [
      "cyclic replacement links",
      [
        {
          id: "issuance-cycle-a",
          publicId: "public-cycle-a",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: "issuance-cycle-b",
          supersededById: "issuance-cycle-b",
        },
        {
          id: "issuance-cycle-b",
          publicId: "public-cycle-b",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: "issuance-cycle-a",
          supersededById: "issuance-cycle-a",
        },
      ],
      "issuance-cycle-a",
      "public-cycle-a",
    ],
    [
      "malformed dangling links",
      [
        {
          id: "issuance-active",
          publicId: "public-active",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: "missing-successor",
        },
        {
          id: "issuance-revoked",
          publicId: "public-revoked",
          studentId: "student-2",
          status: "REVOKED",
          supersedesId: "missing-predecessor",
          supersededById: null,
        },
      ],
      "issuance-revoked",
      "public-revoked",
    ],
  ])(
    "uses a safe deterministic fallback for %s",
    async (_label, records, expectedIssuanceId, expectedPublicId) => {
      for (const issuances of [records, [...records].reverse()]) {
        mocks.issuanceFindMany.mockResolvedValueOnce(issuances);

        const result = await createBatchPreview(faculty, input);

        expect(result.rows[1]).toMatchObject({
          disposition: "ALREADY_ISSUED",
          issuanceId: expectedIssuanceId,
          publicId: expectedPublicId,
        });
      }
    },
  );

  it("uses bounded set queries with canonical student-number keys and never reads per row", async () => {
    mocks.studentFindMany.mockResolvedValueOnce([
      { id: "student-1", studentNumber: "2026-00001", email: "juan@example.edu" },
    ]);
    mocks.enrollmentFindMany.mockResolvedValueOnce([{ studentId: "student-1" }]);
    mocks.issuanceFindMany.mockResolvedValueOnce([]);
    await createBatchPreview(faculty, {
      ...input,
      rows: [
        ["2026-00001", "juan@example.edu"],
        ["2026-00001", "x@example.edu"],
      ],
    });

    expect(mocks.studentFindMany).toHaveBeenCalledWith({
      where: { studentNumber: { in: ["2026-00001"] } },
      select: { id: true, studentNumber: true, email: true },
    });
    expect(mocks.studentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.enrollmentFindMany).toHaveBeenCalledWith({
      where: {
        classId: "class-1",
        enrollmentStatus: "ACTIVE",
        studentId: { in: ["student-1"] },
      },
      select: { studentId: true },
    });
    expect(mocks.enrollmentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.issuanceFindMany).toHaveBeenCalledWith({
      where: {
        classId: "class-1",
        badgeTemplateId: "badge-1",
        studentId: { in: ["student-1"] },
      },
      select: {
        id: true,
        publicId: true,
        studentId: true,
        status: true,
        supersedesId: true,
        supersededById: true,
      },
    });
    expect(mocks.issuanceFindMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no actor", null],
    ["an Administrator", administrator],
  ])("rejects %s before opening a preview transaction", async (_name, actor) => {
    await expect(createBatchPreview(actor, input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended database Faculty", { id: "faculty-1", role: "FACULTY", status: "SUSPENDED" }],
    ["role-changed database Faculty", { id: "faculty-1", role: "ADMIN", status: "ACTIVE" }],
  ])("rejects a stale %s before class, badge, or write work", async (_name, user) => {
    mocks.userFindFirst.mockResolvedValueOnce(user);

    await expect(createBatchPreview(faculty, input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.classFindFirst).not.toHaveBeenCalled();
    expect(mocks.batchCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-owned or inactive class", "class"],
    ["an archived, cross-class, or cross-owner badge", "badge"],
  ])("denies %s without preview or audit writes", async (_name, missing) => {
    if (missing === "class") mocks.classFindFirst.mockResolvedValueOnce(null);
    else mocks.badgeFindFirst.mockResolvedValueOnce(null);

    await expect(createBatchPreview(faculty, input)).rejects.toBeInstanceOf(BatchNotFoundError);
    expect(mocks.batchCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("revalidates malformed filename, mapping, and raw rows before persistence", async () => {
    await expect(
      createBatchPreview(faculty, { ...input, sourceFilename: "\u0000unsafe.csv" }),
    ).rejects.toBeInstanceOf(BatchUnavailableError);
    await expect(
      createBatchPreview(faculty, { ...input, mapping: { studentNumber: 9 } }),
    ).rejects.toBeInstanceOf(BatchUnavailableError);
    await expect(createBatchPreview(faculty, { ...input, rows: [] })).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects sparse, overwide, and aggregate-oversized raw row payloads before a transaction", async () => {
    await expect(
      createBatchPreview(faculty, { ...input, rows: [Array<string>(2)] }),
    ).rejects.toBeInstanceOf(BatchUnavailableError);
    await expect(
      createBatchPreview(faculty, {
        ...input,
        rows: [Array.from({ length: 101 }, () => "cell")],
      }),
    ).rejects.toBeInstanceOf(BatchUnavailableError);
    await expect(
      createBatchPreview(faculty, {
        ...input,
        rows: Array.from({ length: 55 }, () => Array.from({ length: 100 }, () => "a".repeat(191))),
      }),
    ).rejects.toBeInstanceOf(BatchUnavailableError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates audit failure so the preview transaction rolls back", async () => {
    mocks.auditCreate.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(createBatchPreview(faculty, input)).rejects.toThrow("audit unavailable");
  });
});

describe("getBatchDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.batchFindFirst.mockResolvedValue(batch());
  });

  it("scopes Faculty detail reads by class owner and converts dates", async () => {
    const result = await getBatchDetail(faculty, "batch-1");
    expect(mocks.batchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "batch-1", class: { ownerUserId: "faculty-1" } } }),
    );
    expect(result.createdAt).toBe("2026-08-12T08:30:00.000Z");
    expect(result.rows[0]?.emailSupplied).toBe("juan@example.edu");
  });

  it("projects an expired ready detail as expired without rewriting history", async () => {
    mocks.batchFindFirst.mockResolvedValueOnce(
      batch({ status: "READY", expiresAt: new Date("2026-08-01T09:00:00.000Z") }),
    );
    await expect(getBatchDetail(faculty, "batch-1")).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });

  it("allows Administrator detail reads without a Faculty restriction", async () => {
    await getBatchDetail(administrator, "batch-1");
    expect(mocks.batchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "batch-1" } }),
    );
  });

  it("uses the same safe not-found error for a missing and inaccessible batch", async () => {
    mocks.batchFindFirst.mockResolvedValueOnce(null);
    await expect(getBatchDetail(faculty, "other-batch")).rejects.toBeInstanceOf(BatchNotFoundError);
    expect(mocks.batchFindFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed stored snapshots and reconciled counts safely", async () => {
    mocks.batchFindFirst.mockResolvedValueOnce(batch({ mappingJson: { studentNumber: -1 } }));
    await expect(getBatchDetail(faculty, "batch-1")).rejects.toBeInstanceOf(BatchUnavailableError);
    mocks.batchFindFirst.mockResolvedValueOnce(batch({ readyCount: 2 }));
    await expect(getBatchDetail(faculty, "batch-1")).rejects.toBeInstanceOf(BatchUnavailableError);
  });
});

describe("listClassBatches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.batchFindMany.mockResolvedValue([batch()]);
  });

  it("returns a bounded, deterministic, private-free Faculty history projection", async () => {
    const result = await listClassBatches(faculty, "class-1");
    expect(mocks.batchFindMany).toHaveBeenCalledWith({
      where: { classId: "class-1", class: { ownerUserId: "faculty-1" } },
      select: expect.not.objectContaining({ rowsJson: true, mappingJson: true }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    expect(result[0]).toMatchObject({ id: "batch-1", readyCount: 1 });
    expect(result[0]).not.toHaveProperty("rows");
    expect(result[0]).not.toHaveProperty("mapping");
    expect(JSON.stringify(result[0])).not.toContain("juan@example.edu");
  });

  it("projects expired ready previews as expired in history", async () => {
    mocks.batchFindMany.mockResolvedValueOnce([
      batch({ status: "READY", expiresAt: new Date("2026-08-01T09:00:00.000Z") }),
    ]);
    await expect(listClassBatches(faculty, "class-1")).resolves.toEqual([
      expect.objectContaining({ status: "EXPIRED" }),
    ]);
  });

  it("gives Administrators a class-scoped read-only global history query", async () => {
    await listClassBatches(administrator, "class-1");
    expect(mocks.batchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: "class-1" } }),
    );
  });

  it("requires authentication before history reads", async () => {
    await expect(listClassBatches(null, "class-1")).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.batchFindMany).not.toHaveBeenCalled();
  });
});
