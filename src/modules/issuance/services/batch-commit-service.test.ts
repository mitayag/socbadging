import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type { BatchPreviewRow } from "@/modules/issuance/batch-types";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  batchFindFirst: vi.fn(),
  batchUpdate: vi.fn(),
  batchUpdateMany: vi.fn(),
  issuanceFindMany: vi.fn(),
  lockingQuery: vi.fn(),
  tupleReservationCreateMany: vi.fn(),
  tupleReservationDeleteMany: vi.fn(),
  tupleReservationUpdateMany: vi.fn(),
  createIssuance: vi.fn(),
  commitPreparedSet: vi.fn(),
  getIssuerPresentation: vi.fn(),
  prepareSignedIssuance: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./issuance-service", () => ({
  createBadgeIssuanceInTransaction: mocks.createIssuance,
  getIssuerPresentationForTransaction: mocks.getIssuerPresentation,
}));
vi.mock("./signed-issuance-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./signed-issuance-service")>()),
  commitPreparedSignedIssuanceSetInTransaction: mocks.commitPreparedSet,
  prepareSignedIssuance: mocks.prepareSignedIssuance,
  prepareSignedIssuanceForTest: mocks.prepareSignedIssuance,
}));

import { BatchNotFoundError, BatchUnavailableError } from "./batch-preview-service";
import { createStoredBatchFingerprint } from "./batch-validation";
import { BatchSigningError, commitBatchPreview } from "./batch-commit-service";
import { SignedIssuanceError } from "./signed-issuance-service";

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
const commitTime = new Date("2026-08-14T08:45:00.000Z");

const previewRows = [
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
    emailSupplied: null,
    disposition: "ALREADY_ISSUED",
    message: "Badge already issued.",
    studentId: "student-2",
    issuanceId: "stale-issuance",
    publicId: "stale-public",
  },
  {
    rowNumber: 4,
    studentNumber: "",
    emailSupplied: null,
    disposition: "INVALID",
    message: "Student number is required.",
    studentId: null,
    issuanceId: null,
    publicId: null,
  },
] as const;

const mappedPreviewRows = [
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
    emailSupplied: null,
    invalidReason: null,
  },
  {
    rowNumber: 4,
    studentNumber: "",
    studentNumberKey: "",
    emailSupplied: null,
    invalidReason: "Student number is required.",
  },
] as const;

function storedMapping(
  mappedRows: readonly Record<string, unknown>[] = mappedPreviewRows,
  reviewedRows: readonly Record<string, unknown>[] = previewRows,
) {
  return {
    version: "batch-preview-v2",
    mapping: { studentNumber: 0, email: 1 },
    mappedRows: mappedRows.map((row) => ({ ...row })),
    reviewedRows: reviewedRows.map((row) => ({ ...row })),
  };
}

function storedSnapshot(rows: readonly BatchPreviewRow[]) {
  const reviewedRows = rows.map((row) => ({ ...row }));
  const mappedRows = reviewedRows.map((row) => ({
    rowNumber: row.rowNumber,
    studentNumber: row.studentNumber,
    studentNumberKey: String(row.studentNumber).toLowerCase(),
    emailSupplied: row.emailSupplied,
    invalidReason: row.disposition === "INVALID" ? row.message : null,
  }));
  return createStoredBatchFingerprint({
    classId: "class-1",
    badgeTemplateId: "badge-1",
    sourceFilename: "august-issuance.csv",
    mapping: { studentNumber: 0, email: 1 },
    mappedRows,
    reviewedRows,
  });
}

const classRecord = {
  id: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE",
  courseCode: "CS 401",
  title: "Secure Systems",
  section: "A",
  term: "First Semester",
  academicYear: "2026-2027",
};
const badgeRecord = {
  id: "badge-1",
  classId: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE",
  name: "Secure Systems Foundations",
  description: "Recognizes secure systems fundamentals.",
  criteria: "Complete the secure systems assessment.",
  imagePath: "badges/secure-systems.png",
  metadataJson: { skills: ["Security"] },
  expiresAfterDays: 30,
  updatedAt: new Date("2026-08-10T12:00:00.000Z"),
};
const issuer = {
  id: "faculty-1",
  name: "Professor Database",
  role: "FACULTY",
  status: "ACTIVE",
};
const students = [
  {
    id: "student-1",
    studentNumber: "2026-00001",
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.edu",
  },
  {
    id: "student-2",
    studentNumber: "2026-00002",
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@example.edu",
  },
];
const changedReadyRecipients: Array<[string, Array<(typeof students)[number]>]> = [
  ["student removed", []],
  ["student number changed", [{ ...students[0]!, studentNumber: "changed" }]],
  ["supplied email no longer matches", [{ ...students[0]!, email: "changed@example.edu" }]],
];

let authoritative: {
  issuer: (typeof issuer)[];
  classRecord: (typeof classRecord)[];
  badgeTemplate: (typeof badgeRecord)[];
  students: (typeof students)[number][];
  enrollments: Array<{
    classId: string;
    studentId: string;
    enrollmentStatus: "ACTIVE" | "REMOVED";
  }>;
};
let currentBatch: ReturnType<typeof batch>;

function authoritativeLockingRead(query: { strings?: readonly string[] }) {
  const sql = query.strings?.join(" ") ?? "";
  if (sql.includes("FROM users")) return Promise.resolve(authoritative.issuer);
  if (sql.includes("FROM classes")) return Promise.resolve(authoritative.classRecord);
  if (sql.includes("FROM badge_templates")) return Promise.resolve(authoritative.badgeTemplate);
  if (sql.includes("FROM students")) return Promise.resolve(authoritative.students);
  if (sql.includes("FROM class_students")) return Promise.resolve(authoritative.enrollments);
  return Promise.reject(new Error(`Unexpected locking query: ${sql}`));
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    classId: "class-1",
    badgeTemplateId: "badge-1",
    facultyUserId: "faculty-1",
    sourceFilename: "august-issuance.csv",
    mappingJson: storedMapping(),
    rowsJson: previewRows.map((row) => ({ ...row })),
    previewFingerprint: "7bd64b1ce63195ce217dcd9692346e1d146d29eefdacab9b7daa5f6c4f99f223",
    totalRows: 3,
    readyCount: 1,
    alreadyIssuedCount: 1,
    invalidCount: 1,
    issuedCount: 0,
    status: "READY",
    signingClaimToken: null,
    signingClaimVersion: 0,
    signingClaimExpiresAt: null,
    expiresAt: new Date("2026-08-14T09:00:00.000Z"),
    committedAt: null,
    createdAt: new Date("2026-08-14T08:30:00.000Z"),
    updatedAt: new Date("2026-08-14T08:30:00.000Z"),
    ...overrides,
  };
}

function finalizedRows() {
  return [
    {
      ...previewRows[0],
      issuanceId: "issuance-created",
      publicId: "public-created",
    },
    {
      ...previewRows[1],
      issuanceId: "issuance-existing",
      publicId: "public-existing",
    },
    { ...previewRows[2] },
  ];
}

const originalExistingIssuance = {
  id: "issuance-original",
  publicId: "public-original",
  studentId: "student-2",
  status: "ACTIVE",
  supersedesId: null,
  supersededById: "issuance-replacement",
};

const replacementExistingIssuance = {
  id: "issuance-replacement",
  publicId: "public-replacement",
  studentId: "student-2",
  status: "ACTIVE",
  supersedesId: "issuance-original",
  supersededById: null,
};

function transactionClient() {
  return {
    $queryRaw: mocks.lockingQuery,
    auditLog: { create: mocks.auditCreate },
    badgeIssuance: { findMany: mocks.issuanceFindMany },
    issuanceBatch: {
      findFirst: mocks.batchFindFirst,
      update: mocks.batchUpdate,
      updateMany: mocks.batchUpdateMany,
    },
    issuanceTupleReservation: {
      createMany: mocks.tupleReservationCreateMany,
      deleteMany: mocks.tupleReservationDeleteMany,
      updateMany: mocks.tupleReservationUpdateMany,
    },
  };
}

function arrangeSuccessfulCommit() {
  const tx = transactionClient();
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  currentBatch = batch();
  mocks.batchUpdateMany.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    const versionUpdate = data.signingClaimVersion as { increment?: number } | number | undefined;
    currentBatch = batch({
      ...currentBatch,
      ...data,
      signingClaimVersion:
        typeof versionUpdate === "object"
          ? currentBatch.signingClaimVersion + (versionUpdate.increment ?? 0)
          : (versionUpdate ?? currentBatch.signingClaimVersion),
    });
    return Promise.resolve({ count: 1 });
  });
  mocks.tupleReservationCreateMany.mockResolvedValue({ count: 1 });
  mocks.tupleReservationDeleteMany.mockResolvedValue({ count: 1 });
  mocks.tupleReservationUpdateMany.mockResolvedValue({ count: 1 });
  mocks.getIssuerPresentation.mockResolvedValue({
    issuerName: "Database-configured HAU",
    issuerUrl: "https://issuer.example.test",
    issuerLogoPath: "/images/database-issuer.png",
  });
  mocks.batchFindFirst.mockImplementation(() => Promise.resolve(currentBatch));
  authoritative = {
    issuer: [issuer],
    classRecord: [classRecord],
    badgeTemplate: [badgeRecord],
    students: [students[0]!],
    enrollments: [{ classId: "class-1", studentId: "student-1", enrollmentStatus: "ACTIVE" }],
  };
  mocks.lockingQuery.mockImplementation(authoritativeLockingRead);
  mocks.issuanceFindMany.mockResolvedValue([
    {
      id: "issuance-existing",
      publicId: "public-existing",
      studentId: "student-2",
      status: "ACTIVE",
      supersedesId: null,
      supersededById: null,
    },
  ]);
  mocks.createIssuance.mockResolvedValue({
    issuanceId: "issuance-created",
    publicId: "public-created",
  });
  mocks.prepareSignedIssuance.mockImplementation(
    async ({
      studentId,
      batchClaim,
    }: {
      studentId: string;
      batchClaim: {
        batchId: string;
        previewFingerprint: string;
        claimVersion: number;
        claimToken: string;
      };
    }) => ({
      classId: "class-1",
      badgeTemplateId: "badge-1",
      studentId,
      tupleClaim: {
        batchId: batchClaim.batchId,
        batchPreviewFingerprint: batchClaim.previewFingerprint,
        batchClaimVersion: batchClaim.claimVersion,
        claimToken: batchClaim.claimToken,
      },
      sealed: true,
    }),
  );
  mocks.commitPreparedSet.mockImplementation(
    async (_tx: unknown, _actor: Actor, prepared: Array<{ studentId: string }>) =>
      prepared.map((item) => ({
        issuanceId:
          item.studentId === "student-1" ? "issuance-created" : `issuance-${item.studentId}`,
        publicId: item.studentId === "student-1" ? "public-created" : `public-${item.studentId}`,
        alreadyIssued: false,
      })),
  );
  mocks.batchUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    currentBatch = batch({
      ...currentBatch,
      ...data,
      status: "COMMITTED",
      committedAt: commitTime,
      updatedAt: commitTime,
    });
    return Promise.resolve(currentBatch);
  });
  mocks.auditCreate.mockResolvedValue({ id: "audit-batch" });
  return tx;
}

function tupleConflict() {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: {
          constraint: {
            index: "badge_issuances_class_id_badge_template_id_student_id_key",
          },
        },
      },
    },
  });
}

function recordChangedSinceRead() {
  return Object.assign(new Error("Record has changed since last read"), {
    code: "P2010",
    meta: {
      driverAdapterError: {
        cause: { originalCode: "1020" },
      },
    },
  });
}

describe("commitBatchPreview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(commitTime);
    arrangeSuccessfulCommit();
  });

  it("atomically finalizes a mixed batch with authoritative identifiers and a private-free audit", async () => {
    const result = await commitBatchPreview(faculty, "batch-1");

    expect(result).toMatchObject({
      id: "batch-1",
      status: "COMMITTED",
      readyCount: 1,
      issuedCount: 1,
      alreadyIssuedCount: 1,
      invalidCount: 1,
      alreadyCommitted: false,
      rows: finalizedRows(),
    });
    expect(mocks.prepareSignedIssuance).toHaveBeenCalledOnce();
    expect(mocks.commitPreparedSet).toHaveBeenCalledOnce();
    expect(mocks.createIssuance).not.toHaveBeenCalled();
    expect(mocks.getIssuerPresentation).not.toHaveBeenCalled();
    expect(mocks.issuanceFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.issuanceFindMany).toHaveBeenCalledWith({
      where: {
        classId: "class-1",
        badgeTemplateId: "badge-1",
        studentId: { in: ["student-1", "student-2"] },
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
    expect(mocks.lockingQuery).toHaveBeenCalledTimes(10);
    expect(mocks.batchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: {
        rowsJson: finalizedRows(),
        readyCount: 1,
        alreadyIssuedCount: 1,
        invalidCount: 1,
        issuedCount: 1,
        status: "COMMITTED",
        committedAt: commitTime,
        signingClaimToken: null,
        signingClaimExpiresAt: null,
      },
      select: expect.any(Object),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "faculty-1",
        action: "badge.batch_committed",
        entityType: "IssuanceBatch",
        entityId: "batch-1",
        contextJson: {
          batchId: "batch-1",
          classId: "class-1",
          badgeTemplateId: "badge-1",
          issuedCount: 1,
          alreadyIssuedCount: 1,
          invalidCount: 1,
          totalRows: 3,
        },
      },
    });
  });

  it.each([
    ["original-first", [originalExistingIssuance, replacementExistingIssuance]],
    ["replacement-first", [replacementExistingIssuance, originalExistingIssuance]],
  ])(
    "finalizes an already-issued row with the terminal replacement for %s database row order",
    async (_label, duplicateRows) => {
      mocks.issuanceFindMany.mockResolvedValue(duplicateRows);

      const result = await commitBatchPreview(faculty, "batch-1");

      expect(result.rows[1]).toMatchObject({
        disposition: "ALREADY_ISSUED",
        issuanceId: "issuance-replacement",
        publicId: "public-replacement",
      });
    },
  );

  it("prepares only reviewed new rows outside transactions and commits their sealed artifacts atomically", async () => {
    let transactionDepth = 0;
    const tx = transactionClient();
    mocks.transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        transactionDepth += 1;
        try {
          return await callback(tx);
        } finally {
          transactionDepth -= 1;
        }
      },
    );
    let prepared: Record<string, unknown>;
    mocks.prepareSignedIssuance.mockImplementationOnce(
      async ({ batchClaim }: { batchClaim: Record<string, string | number> }) => {
        expect(transactionDepth).toBe(0);
        prepared = {
          classId: "class-1",
          badgeTemplateId: "badge-1",
          studentId: "student-1",
          tupleClaim: {
            batchId: batchClaim.batchId,
            batchPreviewFingerprint: batchClaim.previewFingerprint,
            batchClaimVersion: batchClaim.claimVersion,
            claimToken: batchClaim.claimToken,
          },
          sealed: true,
        };
        return prepared;
      },
    );
    mocks.commitPreparedSet.mockResolvedValueOnce([
      {
        issuanceId: "issuance-created",
        publicId: "public-created",
        alreadyIssued: false,
      },
    ]);

    await commitBatchPreview(faculty, "batch-1");

    expect(mocks.prepareSignedIssuance).toHaveBeenCalledOnce();
    expect(mocks.prepareSignedIssuance).toHaveBeenCalledWith({
      actor: faculty,
      classId: "class-1",
      badgeTemplateId: "badge-1",
      studentId: "student-1",
      batchClaim: {
        batchId: "batch-1",
        previewFingerprint: batch().previewFingerprint,
        claimVersion: 1,
        claimToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(mocks.commitPreparedSet).toHaveBeenCalledWith(tx, faculty, [prepared!]);
    expect(mocks.createIssuance).not.toHaveBeenCalled();
  });

  it("bounds signing concurrency and preserves reviewed row order despite out-of-order completion", async () => {
    const previousConcurrency = process.env.SIGNER_BATCH_CONCURRENCY;
    process.env.SIGNER_BATCH_CONCURRENCY = "2";
    const manyStudents = Array.from({ length: 6 }, (_, index) => ({
      id: `student-${index + 1}`,
      studentNumber: `2026-${String(index + 1).padStart(5, "0")}`,
      firstName: `Student${index + 1}`,
      lastName: "Batch",
      email: `student-${index + 1}@example.edu`,
    }));
    const rows = manyStudents.map((student, index) => ({
      rowNumber: index + 2,
      studentNumber: student.studentNumber,
      emailSupplied: student.email,
      disposition: "READY" as const,
      message: "Ready to issue.",
      studentId: student.id,
      issuanceId: null,
      publicId: null,
    }));
    const stored = storedSnapshot(rows);
    currentBatch = batch({
      mappingJson: stored.mappingJson,
      rowsJson: rows,
      previewFingerprint: stored.previewFingerprint,
      totalRows: rows.length,
      readyCount: rows.length,
      alreadyIssuedCount: 0,
      invalidCount: 0,
    });
    mocks.batchFindFirst.mockImplementation(() => Promise.resolve(currentBatch));
    authoritative.students = manyStudents;
    authoritative.enrollments = manyStudents.map((student) => ({
      classId: "class-1",
      studentId: student.id,
      enrollmentStatus: "ACTIVE",
    }));
    mocks.issuanceFindMany.mockResolvedValue([]);
    mocks.batchUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(
        batch({
          mappingJson: stored.mappingJson,
          previewFingerprint: stored.previewFingerprint,
          totalRows: rows.length,
          ...data,
          status: "COMMITTED",
          committedAt: commitTime,
          updatedAt: commitTime,
        }),
      ),
    );
    let active = 0;
    let maximumActive = 0;
    mocks.prepareSignedIssuance.mockImplementation(
      ({
        studentId,
        batchClaim,
      }: {
        studentId: string;
        batchClaim: {
          batchId: string;
          previewFingerprint: string;
          claimVersion: number;
          claimToken: string;
        };
      }) =>
        new Promise((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          const index = manyStudents.findIndex((student) => student.id === studentId);
          setTimeout(
            () => {
              active -= 1;
              resolve({
                classId: "class-1",
                badgeTemplateId: "badge-1",
                studentId,
                tupleClaim: {
                  batchId: batchClaim.batchId,
                  batchPreviewFingerprint: batchClaim.previewFingerprint,
                  batchClaimVersion: batchClaim.claimVersion,
                  claimToken: batchClaim.claimToken,
                },
                sealed: true,
              });
            },
            (manyStudents.length - index) * 5,
          );
        }),
    );
    mocks.commitPreparedSet.mockImplementation(
      async (_tx: unknown, _actor: Actor, prepared: Array<{ studentId: string }>) =>
        prepared.map((item) => ({
          issuanceId: `issuance-${item.studentId}`,
          publicId: `public-${item.studentId}`,
          alreadyIssued: false,
        })),
    );

    try {
      const resultPromise = commitBatchPreview(faculty, "batch-1");
      await vi.runAllTimersAsync();
      await resultPromise;
    } finally {
      if (previousConcurrency === undefined) delete process.env.SIGNER_BATCH_CONCURRENCY;
      else process.env.SIGNER_BATCH_CONCURRENCY = previousConcurrency;
    }

    expect(maximumActive).toBe(2);
    expect(
      (mocks.commitPreparedSet.mock.calls[0]?.[2] as Array<{ studentId: string }>).map(
        (item) => item.studentId,
      ),
    ).toEqual(manyStudents.map((student) => student.id));
  });

  it("renews the durable batch claim while a slow signer is still running", async () => {
    let releaseSigner!: (value: unknown) => void;
    let capturedClaim!: {
      batchId: string;
      previewFingerprint: string;
      claimVersion: number;
      claimToken: string;
    };
    mocks.prepareSignedIssuance.mockImplementation(
      ({ batchClaim }: { batchClaim: typeof capturedClaim }) => {
        capturedClaim = batchClaim;
        return new Promise((resolve) => {
          releaseSigner = resolve;
        });
      },
    );

    const resultPromise = commitBatchPreview(faculty, "batch-1");
    await vi.waitFor(() => expect(mocks.prepareSignedIssuance).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.tupleReservationUpdateMany).toHaveBeenCalledWith({
      where: { batchId: "batch-1", claimToken: capturedClaim.claimToken },
      data: { expiresAt: expect.any(Date) },
    });

    releaseSigner({
      classId: "class-1",
      badgeTemplateId: "badge-1",
      studentId: "student-1",
      tupleClaim: {
        batchId: capturedClaim.batchId,
        batchPreviewFingerprint: capturedClaim.previewFingerprint,
        batchClaimVersion: capturedClaim.claimVersion,
        claimToken: capturedClaim.claimToken,
      },
      sealed: true,
    });
    await resultPromise;
  });

  it("maps one preparation failure to the exact safe batch message before any commit transaction", async () => {
    const rows = [
      { ...previewRows[0] },
      {
        ...previewRows[0],
        rowNumber: 3,
        studentNumber: "2026-00003",
        emailSupplied: "third@example.edu",
        studentId: "student-3",
      },
    ];
    const stored = storedSnapshot(rows);
    mocks.batchFindFirst.mockResolvedValue(
      batch({
        mappingJson: stored.mappingJson,
        rowsJson: rows,
        previewFingerprint: stored.previewFingerprint,
        totalRows: 2,
        readyCount: 2,
        alreadyIssuedCount: 0,
        invalidCount: 0,
      }),
    );
    authoritative.students = [
      students[0]!,
      {
        id: "student-3",
        studentNumber: "2026-00003",
        firstName: "Third",
        lastName: "Student",
        email: "third@example.edu",
      },
    ];
    authoritative.enrollments = authoritative.students.map((student) => ({
      classId: "class-1",
      studentId: student.id,
      enrollmentStatus: "ACTIVE",
    }));
    mocks.issuanceFindMany.mockResolvedValue([]);
    mocks.prepareSignedIssuance
      .mockResolvedValueOnce({
        classId: "class-1",
        badgeTemplateId: "badge-1",
        studentId: "student-1",
        sealed: true,
      })
      .mockRejectedValueOnce(new SignedIssuanceError(true, "cc083a80-cf59-4db0-bb78-d16670bfb587"));

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toMatchObject({
      message: "Signing unavailable; no credentials were issued.",
    });

    expect(mocks.commitPreparedSet).not.toHaveBeenCalled();
    expect(mocks.batchUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("classifies invalid signer concurrency configuration as unavailable state, not signer I/O", async () => {
    const previousConcurrency = process.env.SIGNER_BATCH_CONCURRENCY;
    process.env.SIGNER_BATCH_CONCURRENCY = "unbounded";

    try {
      await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
        BatchUnavailableError,
      );
    } finally {
      if (previousConcurrency === undefined) delete process.env.SIGNER_BATCH_CONCURRENCY;
      else process.env.SIGNER_BATCH_CONCURRENCY = previousConcurrency;
    }

    expect(mocks.prepareSignedIssuance).not.toHaveBeenCalled();
    expect(mocks.batchUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("preserves preparation state and database errors instead of misclassifying them as signer failures", async () => {
    const stateError = new BatchUnavailableError();
    mocks.prepareSignedIssuance.mockRejectedValueOnce(stateError);

    const error = await commitBatchPreview(faculty, "batch-1").catch((caught: unknown) => caught);

    expect(error).toBe(stateError);
    expect(error).not.toBeInstanceOf(BatchSigningError);
    expect(mocks.batchUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("classifies a fresh signed-artifact invariant failure as unavailable state", async () => {
    mocks.commitPreparedSet.mockRejectedValueOnce(
      new SignedIssuanceError(false, "fdb53f9c-35bd-47e5-bf0c-79569a855f6e"),
    );

    const error = await commitBatchPreview(faculty, "batch-1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BatchUnavailableError);
    expect(error).not.toBeInstanceOf(BatchSigningError);
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["no actor", null],
    ["an Administrator", administrator],
  ])("rejects %s before a database transaction", async (_caseName, actor) => {
    await expect(commitBatchPreview(actor, "batch-1")).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid batch ID before a transaction", async () => {
    await expect(commitBatchPreview(faculty, " ")).rejects.toBeInstanceOf(BatchNotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended Faculty", "user"],
    ["role-changed Faculty", "role"],
    ["missing or inaccessible batch", "batch"],
    ["inactive or non-owner class", "class"],
    ["archived or cross-class badge", "badge"],
  ])("safely denies %s without credential or audit writes", async (_caseName, seam) => {
    if (seam === "user") authoritative.issuer = [];
    if (seam === "role") {
      authoritative.issuer = [{ ...issuer, role: "ADMIN" }];
    }
    if (seam === "batch") mocks.batchFindFirst.mockResolvedValueOnce(null);
    if (seam === "class") authoritative.classRecord = [];
    if (seam === "badge") authoritative.badgeTemplate = [];

    const expected = seam === "user" || seam === "role" ? AuthorizationError : BatchNotFoundError;
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(expected);
    expect(mocks.createIssuance).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["an expired READY batch", { expiresAt: new Date("2026-08-14T08:44:59.999Z") }, false],
    ["an EXPIRED batch", { status: "EXPIRED" }, false],
    ["malformed mapping", { mappingJson: { studentNumber: -1 } }, true],
    ["malformed rows", { rowsJson: [{ unsafe: true }] }, true],
    ["inconsistent counts", { invalidCount: 0 }, true],
    ["fingerprint mismatch", { previewFingerprint: "b".repeat(64) }, true],
  ])("rejects %s without issuing", async (_caseName, override, claimed) => {
    mocks.batchUpdateMany.mockResolvedValueOnce({ count: claimed ? 1 : 0 });
    mocks.batchFindFirst.mockResolvedValueOnce(batch(override));

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.createIssuance).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a structurally valid zero-ready preview", async () => {
    const rows = [
      { ...previewRows[1], rowNumber: 2 },
      { ...previewRows[2], rowNumber: 3 },
    ];
    const zeroMappedRows = [
      { ...mappedPreviewRows[1], rowNumber: 2 },
      { ...mappedPreviewRows[2], rowNumber: 3 },
    ];
    mocks.batchFindFirst.mockResolvedValueOnce(
      batch({
        mappingJson: storedMapping(zeroMappedRows, rows),
        rowsJson: rows,
        previewFingerprint: "de083f36bf56cc6e11e4605895fb5c7af4a7e2bf49c97ebfb09ae4fda086e9af",
        totalRows: 2,
        readyCount: 0,
        alreadyIssuedCount: 1,
        invalidCount: 1,
      }),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.createIssuance).not.toHaveBeenCalled();
  });

  it("rejects a legacy fingerprint payload that does not bind reviewed dispositions", async () => {
    mocks.batchFindFirst.mockResolvedValueOnce(
      batch({
        mappingJson: { studentNumber: 0, email: 1 },
        previewFingerprint: "75150d863e4663d2164d1a5e9d1fa1b79b212c573e3942b15a22ba8ba9ab255b",
      }),
    );
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.createIssuance).not.toHaveBeenCalled();
  });

  it("rejects changing a reviewed NOT_ACTIVELY_ENROLLED row into an unreviewed READY candidate", async () => {
    const reviewedRows = [
      {
        ...previewRows[0],
        disposition: "NOT_ACTIVELY_ENROLLED",
        message: "Student is not actively enrolled.",
      },
      previewRows[1],
      previewRows[2],
    ];
    mocks.batchFindFirst.mockResolvedValueOnce(
      batch({
        mappingJson: storedMapping(mappedPreviewRows, reviewedRows),
        previewFingerprint: "f9eae96e8507a5e6fa3c28f42ac6aefcb88b2462d21ee3d01709563a6730af56",
      }),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.createIssuance).not.toHaveBeenCalled();
  });

  it.each(changedReadyRecipients)(
    "aborts the whole batch when a READY recipient has %s",
    async (_caseName, currentStudents) => {
      authoritative.students = currentStudents;

      await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
        BatchUnavailableError,
      );
      expect(mocks.createIssuance).not.toHaveBeenCalled();
      expect(mocks.batchUpdate).not.toHaveBeenCalled();
    },
  );

  it("aborts the whole batch when a READY enrollment is no longer active", async () => {
    authoritative.enrollments = [
      { classId: "class-1", studentId: "student-1", enrollmentStatus: "REMOVED" },
    ];
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.createIssuance).not.toHaveBeenCalled();
  });

  it.each(["users", "classes", "badge_templates", "students", "class_students"])(
    "fails closed when MariaDB reports a record change during the %s authoritative lock",
    async (table) => {
      mocks.lockingQuery.mockImplementation((query: { strings?: readonly string[] }) => {
        const sql = query.strings?.join(" ") ?? "";
        if (sql.includes(`FROM ${table}`)) return Promise.reject(recordChangedSinceRead());
        return authoritativeLockingRead(query);
      });

      await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
        BatchUnavailableError,
      );
      expect(mocks.createIssuance).not.toHaveBeenCalled();
      expect(mocks.batchUpdate).not.toHaveBeenCalled();
    },
  );

  it("propagates an unrelated authoritative locking-read error unchanged", async () => {
    const unrelated = Object.assign(new Error("unrelated raw failure"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "1205" } } },
    });
    mocks.lockingQuery.mockRejectedValueOnce(unrelated);

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBe(unrelated);
    expect(mocks.createIssuance).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
  });

  it("aborts all prepared rows if an issuance bypasses the tuple reservation", async () => {
    mocks.issuanceFindMany
      .mockResolvedValueOnce([
        {
          id: "issuance-existing",
          publicId: "public-existing",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "issuance-raced",
          publicId: "public-raced",
          studentId: "student-1",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
        {
          id: "issuance-refreshed",
          publicId: "public-refreshed",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
      ]);
    mocks.batchUpdate.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(
        batch({ ...data, status: "COMMITTED", committedAt: commitTime, updatedAt: commitTime }),
      ),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.commitPreparedSet).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
  });

  it("reconciles a duplicate-only batch without reading signer concurrency configuration", async () => {
    const previousConcurrency = process.env.SIGNER_BATCH_CONCURRENCY;
    process.env.SIGNER_BATCH_CONCURRENCY = "invalid-for-signing";
    mocks.issuanceFindMany.mockResolvedValue([
      {
        id: "issuance-raced",
        publicId: "public-raced",
        studentId: "student-1",
        status: "ACTIVE",
        supersedesId: null,
        supersededById: null,
      },
      {
        id: "issuance-existing",
        publicId: "public-existing",
        studentId: "student-2",
        status: "ACTIVE",
        supersedesId: null,
        supersededById: null,
      },
    ]);

    try {
      await expect(commitBatchPreview(faculty, "batch-1")).resolves.toMatchObject({
        issuedCount: 0,
        alreadyIssuedCount: 2,
      });
    } finally {
      if (previousConcurrency === undefined) delete process.env.SIGNER_BATCH_CONCURRENCY;
      else process.env.SIGNER_BATCH_CONCURRENCY = previousConcurrency;
    }

    expect(mocks.prepareSignedIssuance).not.toHaveBeenCalled();
  });

  it("returns a stored committed summary without writes", async () => {
    mocks.batchUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.batchFindFirst.mockResolvedValueOnce(
      batch({
        rowsJson: finalizedRows(),
        readyCount: 1,
        issuedCount: 1,
        status: "COMMITTED",
        committedAt: commitTime,
        updatedAt: commitTime,
      }),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).resolves.toMatchObject({
      alreadyCommitted: true,
      rows: finalizedRows(),
    });
    expect(mocks.createIssuance).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each(["snapshot", "issuance", "individual audit"])(
    "propagates a signed %s failure so finalization and the batch audit roll back",
    async (message) => {
      mocks.commitPreparedSet.mockRejectedValueOnce(new Error(`${message} failed`));
      await expect(commitBatchPreview(faculty, "batch-1")).rejects.toThrow(`${message} failed`);
      expect(mocks.batchUpdate).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("propagates batch update and batch audit failures from the transaction", async () => {
    mocks.batchUpdate.mockRejectedValueOnce(new Error("batch update failed"));
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toThrow("batch update failed");
    expect(mocks.auditCreate).not.toHaveBeenCalled();

    arrangeSuccessfulCommit();
    mocks.auditCreate.mockRejectedValueOnce(new Error("batch audit failed"));
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toThrow("batch audit failed");
  });

  it("retries the complete batch from a fresh transaction after an exact tuple conflict", async () => {
    mocks.commitPreparedSet.mockRejectedValueOnce(tupleConflict());
    mocks.issuanceFindMany
      .mockResolvedValueOnce([
        {
          id: "issuance-existing",
          publicId: "public-existing",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "issuance-existing",
          publicId: "public-existing",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "issuance-winner",
          publicId: "public-winner",
          studentId: "student-1",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
        {
          id: "issuance-existing",
          publicId: "public-existing",
          studentId: "student-2",
          status: "ACTIVE",
          supersedesId: null,
          supersededById: null,
        },
      ]);
    mocks.batchUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(
        batch({ ...data, status: "COMMITTED", committedAt: commitTime, updatedAt: commitTime }),
      ),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toBeInstanceOf(
      BatchUnavailableError,
    );
    expect(mocks.commitPreparedSet).toHaveBeenCalledTimes(1);
    expect(mocks.prepareSignedIssuance).toHaveBeenCalledTimes(1);
  });

  it("retries a transaction deadlock with the exact prepared artifact and never re-signs", async () => {
    mocks.commitPreparedSet.mockRejectedValueOnce(
      Object.assign(new Error("Transaction failed due to a write conflict or a deadlock"), {
        code: "P2034",
      }),
    );

    await expect(commitBatchPreview(faculty, "batch-1")).resolves.toMatchObject({
      issuedCount: 1,
      alreadyIssuedCount: 1,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
    expect(mocks.commitPreparedSet).toHaveBeenCalledTimes(2);
    expect(mocks.commitPreparedSet.mock.calls[1]?.[2]?.[0]).toBe(
      mocks.commitPreparedSet.mock.calls[0]?.[2]?.[0],
    );
    expect(mocks.prepareSignedIssuance).toHaveBeenCalledTimes(1);
  });

  it("does not retry unrelated constraints and bounds tuple retries", async () => {
    mocks.commitPreparedSet.mockRejectedValueOnce(
      Object.assign(new Error("other constraint"), { code: "P2002", meta: { target: ["other"] } }),
    );
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toThrow("other constraint");
    expect(mocks.transaction).toHaveBeenCalledTimes(3);

    arrangeSuccessfulCommit();
    mocks.transaction.mockClear();
    mocks.commitPreparedSet.mockRejectedValue(tupleConflict());
    await expect(commitBatchPreview(faculty, "batch-1")).rejects.toThrow(
      "Unique constraint failed",
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(5);
  });
});
