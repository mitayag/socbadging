import { describe, expect, it } from "vitest";

import {
  batchCommitSummarySchema,
  batchDetailSchema,
  batchMappingSchema,
  batchPreviewRowSchema,
  batchPreviewSummarySchema,
  batchReportRowSchema,
  batchRowDispositionSchema,
  parseStoredBatchRows,
} from "./batch-types";

const dispositions = [
  "READY",
  "ALREADY_ISSUED",
  "DUPLICATE_IN_FILE",
  "STUDENT_NOT_FOUND",
  "NOT_ACTIVELY_ENROLLED",
  "EMAIL_MISMATCH",
  "INVALID",
] as const;

const baseRow = {
  rowNumber: 2,
  studentNumber: "2026-00001",
  emailSupplied: "student@example.edu",
  disposition: "READY",
  message: "Ready to issue.",
  studentId: "student-1",
  issuanceId: null,
  publicId: null,
};

const baseSummary = {
  id: "batch-1",
  classId: "class-1",
  badgeTemplateId: "badge-1",
  facultyUserId: "faculty-1",
  sourceFilename: "recipients.csv",
  mapping: { studentNumber: 0, email: 1 },
  previewFingerprint: "a".repeat(64),
  totalRows: 3,
  readyCount: 1,
  alreadyIssuedCount: 1,
  invalidCount: 1,
  issuedCount: 0,
  status: "READY",
  expiresAt: "2026-08-14T10:30:00.000Z",
  committedAt: null,
  createdAt: "2026-08-14T10:00:00.000Z",
  updatedAt: "2026-08-14T10:00:00.000Z",
  rows: [
    baseRow,
    {
      ...baseRow,
      rowNumber: 3,
      studentNumber: "2026-00002",
      disposition: "ALREADY_ISSUED",
      message: "Badge already issued.",
      issuanceId: "issuance-existing",
      publicId: "public-existing",
    },
    {
      ...baseRow,
      rowNumber: 4,
      studentNumber: "",
      emailSupplied: null,
      disposition: "INVALID",
      message: "Student number is required.",
      studentId: null,
    },
  ],
};

describe("batch issuance contracts", () => {
  it("accepts exactly every supported row disposition", () => {
    for (const disposition of dispositions) {
      expect(batchRowDispositionSchema.parse(disposition)).toBe(disposition);
    }

    expect(batchRowDispositionSchema.safeParse("ISSUED").success).toBe(false);
  });

  it("requires safe preview row fields and nullable result identifiers", () => {
    expect(batchPreviewRowSchema.parse(baseRow)).toEqual(baseRow);
    expect(batchPreviewRowSchema.safeParse({ ...baseRow, rowNumber: 0 }).success).toBe(false);
    expect(
      batchPreviewRowSchema.safeParse({ ...baseRow, studentNumber: "x".repeat(101) }).success,
    ).toBe(false);
    expect(batchPreviewRowSchema.safeParse({ ...baseRow, issuanceId: undefined }).success).toBe(
      false,
    );
    expect(batchPreviewRowSchema.safeParse({ ...baseRow, publicId: undefined }).success).toBe(
      false,
    );
  });

  it("accepts only a required non-negative student-number mapping and optional nullable email mapping", () => {
    expect(batchMappingSchema.parse({ studentNumber: 0 })).toEqual({ studentNumber: 0 });
    expect(batchMappingSchema.parse({ studentNumber: 2, email: null })).toEqual({
      studentNumber: 2,
      email: null,
    });
    expect(batchMappingSchema.safeParse({ studentNumber: -1 }).success).toBe(false);
    expect(batchMappingSchema.safeParse({ studentNumber: 0, email: 1.5 }).success).toBe(false);
  });

  it("rejects malformed preview fingerprints", () => {
    expect(
      batchPreviewSummarySchema.safeParse({ ...baseSummary, previewFingerprint: "A".repeat(64) })
        .success,
    ).toBe(false);
    expect(
      batchPreviewSummarySchema.safeParse({ ...baseSummary, previewFingerprint: "a".repeat(63) })
        .success,
    ).toBe(false);
  });

  it("enforces preview row-count invariants", () => {
    expect(batchPreviewSummarySchema.parse(baseSummary)).toEqual(baseSummary);
    expect(batchPreviewSummarySchema.safeParse({ ...baseSummary, readyCount: 2 }).success).toBe(
      false,
    );
    expect(batchPreviewSummarySchema.safeParse({ ...baseSummary, totalRows: -1 }).success).toBe(
      false,
    );
  });

  it("rejects previews whose row length differs from the declared total", () => {
    expect(
      batchPreviewSummarySchema.safeParse({ ...baseSummary, rows: baseSummary.rows.slice(0, 2) })
        .success,
    ).toBe(false);
  });

  it("rejects previews whose dispositions do not match the declared counts", () => {
    expect(
      batchPreviewSummarySchema.safeParse({
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[0], disposition: "STUDENT_NOT_FOUND", studentId: null },
          ...baseSummary.rows.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces finalized commit count invariants", () => {
    const finalized = {
      ...baseSummary,
      readyCount: 1,
      status: "COMMITTED",
      issuedCount: 1,
      committedAt: "2026-08-14T10:05:00.000Z",
      rows: [
        {
          ...baseRow,
          issuanceId: "issuance-created",
          publicId: "public-created",
        },
        baseSummary.rows[1],
        baseSummary.rows[2],
      ],
      alreadyCommitted: false,
    };

    expect(batchCommitSummarySchema.parse(finalized)).toEqual(finalized);
    expect(batchCommitSummarySchema.safeParse({ ...finalized, issuedCount: 2 }).success).toBe(
      false,
    );
  });

  it("rejects finalized commits whose row length differs from the declared total", () => {
    const finalized = {
      ...baseSummary,
      status: "COMMITTED",
      committedAt: "2026-08-14T10:05:00.000Z",
      issuedCount: 1,
      rows: [
        {
          ...baseRow,
          issuanceId: "issuance-created",
          publicId: "public-created",
        },
        baseSummary.rows[1],
      ],
      alreadyCommitted: false,
    };

    expect(batchCommitSummarySchema.safeParse(finalized).success).toBe(false);
  });

  it("rejects finalized commits whose dispositions do not match the declared counts", () => {
    const finalized = {
      ...baseSummary,
      status: "COMMITTED",
      committedAt: "2026-08-14T10:05:00.000Z",
      issuedCount: 1,
      rows: [
        {
          ...baseRow,
          issuanceId: "issuance-created",
          publicId: "public-created",
        },
        { ...baseSummary.rows[1], disposition: "INVALID", issuanceId: null, publicId: null },
        baseSummary.rows[2],
      ],
      alreadyCommitted: false,
    };

    expect(batchCommitSummarySchema.safeParse(finalized).success).toBe(false);
  });

  it("requires committed READY rows to carry their created credential identifiers", () => {
    expect(
      batchCommitSummarySchema.safeParse({
        ...baseSummary,
        status: "COMMITTED",
        committedAt: "2026-08-14T10:05:00.000Z",
        issuedCount: 1,
        alreadyCommitted: false,
      }).success,
    ).toBe(false);
  });

  it("reconciles detail rows according to stored batch state", () => {
    expect(batchDetailSchema.parse(baseSummary)).toEqual(baseSummary);
    expect(
      batchDetailSchema.safeParse({ ...baseSummary, rows: baseSummary.rows.slice(0, 2) }).success,
    ).toBe(false);
    expect(
      batchDetailSchema.safeParse({
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[0], disposition: "STUDENT_NOT_FOUND", studentId: null },
          ...baseSummary.rows.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed stored rows with a safe parser error", () => {
    expect(() => parseStoredBatchRows([{ ...baseRow, disposition: "UNSAFE" }])).toThrow(
      "Invalid batch snapshot",
    );
    expect(() => parseStoredBatchRows({ rows: [] })).toThrow("Invalid batch snapshot");
  });

  it("projects report rows without undefined result identifiers", () => {
    expect(
      batchReportRowSchema.parse({
        rowNumber: 2,
        studentNumber: "2026-00001",
        emailSupplied: null,
        disposition: "READY",
        message: "Ready to issue.",
        issuanceId: null,
        publicId: null,
      }),
    ).toEqual({
      rowNumber: 2,
      studentNumber: "2026-00001",
      emailSupplied: null,
      disposition: "READY",
      message: "Ready to issue.",
      issuanceId: null,
      publicId: null,
    });
  });
});
