import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import type { BatchMapping, BatchPreviewRow } from "@/modules/issuance/batch-types";
import { parseRosterFile } from "@/modules/rosters/services/import-parser";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_STUDENT_NUMBER_LENGTH = 100;
const MAX_EMAIL_LENGTH = 191;

const mappingInputSchema = z
  .object({
    studentNumber: z.number().int().nonnegative(),
    email: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export type MappedBatchRow = {
  rowNumber: number;
  studentNumber: string;
  studentNumberKey?: string;
  emailSupplied: string | null;
  invalidReason: string | null;
};

export type BatchKnownStudent = {
  id: string;
  email: string;
};

export type BatchExistingIssuance = {
  issuanceId: string;
  publicId: string;
};

export type ClassifyBatchRowsInput = {
  rows: MappedBatchRow[];
  knownStudents: ReadonlyMap<string, BatchKnownStudent>;
  activeStudentIds: ReadonlySet<string>;
  existingIssuances: ReadonlyMap<string, BatchExistingIssuance>;
};

function isCsvMimeType(type: string) {
  return (
    type === "" ||
    type === "text/csv" ||
    type === "application/csv" ||
    type === "application/vnd.ms-excel"
  );
}

function isXlsxMimeType(type: string) {
  return (
    type === "" || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function fileKind(file: File) {
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".csv")) return "csv" as const;
  if (filename.endsWith(".xlsx")) return "xlsx" as const;
  throw new Error("Batch file must be CSV or XLSX");
}

function asCell(value: unknown) {
  return value == null ? "" : String(value);
}

export async function inspectBatchFile(
  file: File,
): Promise<{ headers: string[]; rows: string[][] }> {
  const kind = fileKind(file);
  if (file.size > MAX_FILE_BYTES) throw new Error("Batch file must not exceed 2 MiB");
  if (file.size === 0) throw new Error("Batch file is empty");
  const type = file.type.toLowerCase();
  if ((kind === "csv" && !isCsvMimeType(type)) || (kind === "xlsx" && !isXlsxMimeType(type))) {
    throw new Error("Batch file MIME type is not supported");
  }

  try {
    const parsed = await parseRosterFile(file);
    if (!parsed.headers.some((header) => header.trim() && header !== "null")) {
      throw new Error("Batch file must contain a header and at least one data row");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "Roster file must not exceed 2 MiB") {
      throw new Error("Batch file must not exceed 2 MiB");
    }
    if (error instanceof Error && error.message === "Roster file cannot exceed 5,000 data rows") {
      throw new Error("Batch file cannot exceed 5,000 data rows");
    }
    if (
      error instanceof Error &&
      (error.message === "Roster file must contain a header and at least one row" ||
        error.message === "Batch file must contain a header and at least one data row")
    ) {
      throw new Error("Batch file must contain a header and at least one data row");
    }
    throw new Error("Batch file could not be parsed");
  }
}

export function normalizeBatchMapping(input: unknown, columnCount: number): BatchMapping {
  const parsed = mappingInputSchema.safeParse(input);
  if (!parsed.success || !Number.isInteger(columnCount) || columnCount <= 0) {
    throw new Error("Invalid batch mapping");
  }
  const email = parsed.data.email ?? null;
  if (
    parsed.data.studentNumber >= columnCount ||
    (email !== null && (email >= columnCount || email === parsed.data.studentNumber))
  ) {
    throw new Error("Invalid batch mapping");
  }
  return { studentNumber: parsed.data.studentNumber, email };
}

function mapCell(row: unknown, column: number) {
  if (!Array.isArray(row)) return "";
  return asCell(row[column]);
}

function normalizedStudentNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return { display: "", invalidReason: "Student number is required." };
  if (normalized.length > MAX_STUDENT_NUMBER_LENGTH || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return {
      display: normalized.slice(0, MAX_STUDENT_NUMBER_LENGTH),
      invalidReason: "Student number is invalid.",
    };
  }
  return { display: normalized, key: normalized.toLowerCase(), invalidReason: null };
}

function studentNumberKey(value: string) {
  return value.toLowerCase();
}

function studentNumberIssue(value: string) {
  if (!value.trim()) return "Student number is required.";
  if (
    value !== value.trim() ||
    value.length > MAX_STUDENT_NUMBER_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return "Student number is invalid.";
  }
  return null;
}

export function mapBatchRows(rows: string[][], mapping: BatchMapping): MappedBatchRow[] {
  return rows.map((row, index) => {
    const studentNumber = normalizedStudentNumber(mapCell(row, mapping.studentNumber));
    const emailValue =
      mapping.email === null || mapping.email === undefined ? "" : mapCell(row, mapping.email);
    const normalizedEmail = emailValue.trim().toLowerCase();
    const unsafeEmail =
      normalizedEmail.length > MAX_EMAIL_LENGTH || /[\u0000-\u001F\u007F]/.test(normalizedEmail);
    return {
      rowNumber: index + 2,
      studentNumber: studentNumber.display,
      studentNumberKey: studentNumber.key ?? studentNumberKey(studentNumber.display),
      emailSupplied: normalizedEmail && !unsafeEmail ? normalizedEmail : null,
      invalidReason:
        studentNumber.invalidReason ?? (unsafeEmail ? "Row contains unsafe data." : null),
    };
  });
}

function previewRow(
  row: MappedBatchRow,
  disposition: BatchPreviewRow["disposition"],
  message: string,
  studentId: string | null = null,
  result: BatchExistingIssuance | null = null,
): BatchPreviewRow {
  return {
    rowNumber: row.rowNumber,
    studentNumber: row.studentNumber,
    emailSupplied: row.emailSupplied,
    disposition,
    message,
    studentId,
    issuanceId: result?.issuanceId ?? null,
    publicId: result?.publicId ?? null,
  };
}

export function classifyBatchRows(input: ClassifyBatchRowsInput) {
  const seen = new Set<string>();
  const rows = input.rows.map((untrustedRow) => {
    const row = {
      ...untrustedRow,
      studentNumberKey:
        untrustedRow.studentNumberKey ?? studentNumberKey(untrustedRow.studentNumber),
      emailSupplied: untrustedRow.emailSupplied?.trim().toLowerCase() || null,
      invalidReason: untrustedRow.invalidReason ?? studentNumberIssue(untrustedRow.studentNumber),
    };
    if (row.invalidReason) return previewRow(row, "INVALID", row.invalidReason);
    if (seen.has(row.studentNumberKey))
      return previewRow(row, "DUPLICATE_IN_FILE", "Duplicate student number in file.");
    seen.add(row.studentNumberKey);

    const student = input.knownStudents.get(row.studentNumberKey);
    if (!student) return previewRow(row, "STUDENT_NOT_FOUND", "Student number was not found.");
    if (!input.activeStudentIds.has(student.id))
      return previewRow(
        row,
        "NOT_ACTIVELY_ENROLLED",
        "Student is not actively enrolled.",
        student.id,
      );
    if (row.emailSupplied && row.emailSupplied !== student.email.trim().toLowerCase()) {
      return previewRow(
        row,
        "EMAIL_MISMATCH",
        "Supplied email does not match student record.",
        student.id,
      );
    }
    const existing = input.existingIssuances.get(student.id);
    if (existing)
      return previewRow(row, "ALREADY_ISSUED", "Badge already issued.", student.id, existing);
    return previewRow(row, "READY", "Ready to issue.", student.id);
  });
  const readyCount = rows.filter((row) => row.disposition === "READY").length;
  const alreadyIssuedCount = rows.filter((row) => row.disposition === "ALREADY_ISSUED").length;
  return {
    rows,
    totalRows: rows.length,
    readyCount,
    alreadyIssuedCount,
    invalidCount: rows.length - readyCount - alreadyIssuedCount,
  };
}

export type BatchPreviewFingerprintInput = {
  classId: string;
  badgeTemplateId: string;
  sourceFilename: string;
  mapping: BatchMapping;
  rows: MappedBatchRow[];
};

type StoredMappedBatchRow = Required<Pick<MappedBatchRow, "studentNumberKey">> & MappedBatchRow;

export type StoredBatchFingerprintPayload = {
  version: "batch-preview-v2";
  mapping: BatchMapping;
  mappedRows: StoredMappedBatchRow[];
  reviewedRows: BatchPreviewRow[];
};

function parseStoredFingerprintPayload(value: unknown): StoredBatchFingerprintPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid batch snapshot");
  }
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).some(
      (key) => !["version", "mapping", "mappedRows", "reviewedRows"].includes(key),
    ) ||
    parsed.version !== "batch-preview-v2"
  ) {
    throw new Error("Invalid batch snapshot");
  }
  const mapping = mappingInputSchema.parse(parsed.mapping);
  if (
    !Array.isArray(parsed.mappedRows) ||
    parsed.mappedRows.length < 1 ||
    parsed.mappedRows.length > 5_000 ||
    !Array.isArray(parsed.reviewedRows) ||
    parsed.reviewedRows.length !== parsed.mappedRows.length
  ) {
    throw new Error("Invalid batch snapshot");
  }
  const mappedRows = parsed.mappedRows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid batch snapshot");
    }
    const candidate = row as Record<string, unknown>;
    if (
      Object.keys(candidate).length !== 5 ||
      !Number.isInteger(candidate.rowNumber) ||
      (candidate.rowNumber as number) < 1 ||
      typeof candidate.studentNumber !== "string" ||
      candidate.studentNumber.length > MAX_STUDENT_NUMBER_LENGTH ||
      typeof candidate.studentNumberKey !== "string" ||
      candidate.studentNumberKey.length > MAX_STUDENT_NUMBER_LENGTH ||
      (candidate.emailSupplied !== null &&
        (typeof candidate.emailSupplied !== "string" ||
          !candidate.emailSupplied.trim() ||
          candidate.emailSupplied !== candidate.emailSupplied.trim() ||
          candidate.emailSupplied.length > MAX_EMAIL_LENGTH)) ||
      (candidate.invalidReason !== null &&
        (typeof candidate.invalidReason !== "string" ||
          !candidate.invalidReason.trim() ||
          candidate.invalidReason.length > 1000))
    ) {
      throw new Error("Invalid batch snapshot");
    }
    return candidate as StoredMappedBatchRow;
  });
  const reviewedRows = parsed.reviewedRows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid batch snapshot");
    }
    const candidate = row as Record<string, unknown>;
    const dispositions = [
      "READY",
      "ALREADY_ISSUED",
      "DUPLICATE_IN_FILE",
      "STUDENT_NOT_FOUND",
      "NOT_ACTIVELY_ENROLLED",
      "EMAIL_MISMATCH",
      "INVALID",
    ];
    const nullableIdentifier = (item: unknown) =>
      item === null ||
      (typeof item === "string" && item === item.trim() && item.length >= 1 && item.length <= 191);
    if (
      Object.keys(candidate).length !== 8 ||
      !Number.isInteger(candidate.rowNumber) ||
      (candidate.rowNumber as number) < 1 ||
      typeof candidate.studentNumber !== "string" ||
      candidate.studentNumber !== candidate.studentNumber.trim() ||
      candidate.studentNumber.length > MAX_STUDENT_NUMBER_LENGTH ||
      (candidate.emailSupplied !== null &&
        (typeof candidate.emailSupplied !== "string" ||
          candidate.emailSupplied !== candidate.emailSupplied.trim() ||
          !candidate.emailSupplied ||
          candidate.emailSupplied.length > MAX_EMAIL_LENGTH)) ||
      !dispositions.includes(candidate.disposition as string) ||
      typeof candidate.message !== "string" ||
      candidate.message !== candidate.message.trim() ||
      !candidate.message ||
      candidate.message.length > 1000 ||
      !nullableIdentifier(candidate.studentId) ||
      !nullableIdentifier(candidate.issuanceId) ||
      !nullableIdentifier(candidate.publicId)
    ) {
      throw new Error("Invalid batch snapshot");
    }
    return candidate as BatchPreviewRow;
  });
  return {
    version: "batch-preview-v2",
    mapping: { studentNumber: mapping.studentNumber, email: mapping.email ?? null },
    mappedRows,
    reviewedRows,
  };
}

function canonicalMappedRows(rows: MappedBatchRow[]) {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    studentNumber: row.studentNumber,
    studentNumberKey: row.studentNumberKey ?? studentNumberKey(row.studentNumber),
    emailSupplied: row.emailSupplied,
    invalidReason: row.invalidReason,
  }));
}

function fingerprintStoredPayload(input: {
  classId: string;
  badgeTemplateId: string;
  sourceFilename: string;
  payload: StoredBatchFingerprintPayload;
}) {
  const canonical = [
    input.payload.version,
    input.classId,
    input.badgeTemplateId,
    input.sourceFilename,
    [input.payload.mapping.studentNumber, input.payload.mapping.email ?? null],
    input.payload.mappedRows.map((row) => [
      row.rowNumber,
      row.studentNumber,
      row.studentNumberKey,
      row.emailSupplied,
      row.invalidReason,
    ]),
    input.payload.reviewedRows.map((row) => [
      row.rowNumber,
      row.studentNumber,
      row.emailSupplied,
      row.disposition,
      row.message,
      row.studentId,
      row.issuanceId,
      row.publicId,
    ]),
  ];
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function createStoredBatchFingerprint(input: {
  classId: string;
  badgeTemplateId: string;
  sourceFilename: string;
  mapping: BatchMapping;
  mappedRows: MappedBatchRow[];
  reviewedRows: BatchPreviewRow[];
}): { mappingJson: StoredBatchFingerprintPayload; previewFingerprint: string } {
  const mappingJson = parseStoredFingerprintPayload({
    version: "batch-preview-v2",
    mapping: input.mapping,
    mappedRows: canonicalMappedRows(input.mappedRows),
    reviewedRows: input.reviewedRows,
  });
  return {
    mappingJson,
    previewFingerprint: fingerprintStoredPayload({ ...input, payload: mappingJson }),
  };
}

export function parseStoredBatchFingerprint(input: {
  classId: string;
  badgeTemplateId: string;
  sourceFilename: string;
  mappingJson: unknown;
  previewFingerprint: string;
}): StoredBatchFingerprintPayload {
  const payload = parseStoredFingerprintPayload(input.mappingJson);
  if (fingerprintStoredPayload({ ...input, payload }) !== input.previewFingerprint) {
    throw new Error("Invalid batch snapshot");
  }
  return payload;
}

function sameReviewedIdentity(reviewed: BatchPreviewRow, current: BatchPreviewRow) {
  return (
    reviewed.rowNumber === current.rowNumber &&
    reviewed.studentNumber === current.studentNumber &&
    reviewed.emailSupplied === current.emailSupplied &&
    reviewed.studentId === current.studentId
  );
}

export function assertStoredBatchRowsMatchReview(
  payload: StoredBatchFingerprintPayload,
  rows: BatchPreviewRow[],
  committed: boolean,
): void {
  if (payload.reviewedRows.length !== rows.length) throw new Error("Invalid batch snapshot");

  for (const [index, reviewed] of payload.reviewedRows.entries()) {
    const current = rows[index]!;
    if (!sameReviewedIdentity(reviewed, current)) throw new Error("Invalid batch snapshot");
    if (!committed) {
      if (JSON.stringify(reviewed) !== JSON.stringify(current)) {
        throw new Error("Invalid batch snapshot");
      }
      continue;
    }

    if (reviewed.disposition === "READY") {
      if (
        !["READY", "ALREADY_ISSUED"].includes(current.disposition) ||
        current.message !==
          (current.disposition === "READY" ? "Ready to issue." : "Badge already issued.") ||
        current.issuanceId === null ||
        current.publicId === null
      ) {
        throw new Error("Invalid batch snapshot");
      }
      continue;
    }
    if (reviewed.disposition === "ALREADY_ISSUED") {
      if (
        current.disposition !== "ALREADY_ISSUED" ||
        current.message !== "Badge already issued." ||
        current.issuanceId === null ||
        current.publicId === null
      ) {
        throw new Error("Invalid batch snapshot");
      }
      continue;
    }
    if (JSON.stringify(reviewed) !== JSON.stringify(current)) {
      throw new Error("Invalid batch snapshot");
    }
  }
}

export function fingerprintBatchPreview(input: BatchPreviewFingerprintInput): string {
  const canonical = [
    "batch-preview-v1",
    input.classId,
    input.badgeTemplateId,
    input.sourceFilename,
    [input.mapping.studentNumber, input.mapping.email ?? null],
    input.rows.map((row) => [
      row.rowNumber,
      row.studentNumber,
      row.studentNumberKey ?? studentNumberKey(row.studentNumber),
      row.emailSupplied,
      row.invalidReason,
    ]),
  ];
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
