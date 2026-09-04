import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  classifyBatchRows,
  fingerprintBatchPreview,
  inspectBatchFile,
  mapBatchRows,
  normalizeBatchMapping,
} from "./batch-validation";

function csvFile(content: string, name = "recipients.csv", type = "text/csv") {
  return new File([content], name, { type });
}

async function xlsxFile(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Recipients");
  rows.forEach((row) => worksheet.addRow(row));
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return new File([bytes], "recipients.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const mappedRows = [
  {
    rowNumber: 2,
    studentNumber: "2026-00001",
    studentNumberKey: "2026-00001",
    emailSupplied: "ana@example.edu",
    invalidReason: null,
  },
  {
    rowNumber: 3,
    studentNumber: "2026-00002",
    studentNumberKey: "2026-00002",
    emailSupplied: null,
    invalidReason: null,
  },
];

describe("batch file inspection and mapping", () => {
  it("inspects CSV and preserves header/data values", async () => {
    await expect(
      inspectBatchFile(csvFile("Student Number,Email\r\n 2026-00001 , ANA@EXAMPLE.EDU ")),
    ).resolves.toEqual({
      headers: ["Student Number", "Email"],
      rows: [[" 2026-00001 ", " ANA@EXAMPLE.EDU "]],
    });
  });

  it("inspects XLSX files", async () => {
    await expect(
      inspectBatchFile(
        await xlsxFile([
          ["Student Number", "Email"],
          ["2026-00001", "ana@example.edu"],
        ]),
      ),
    ).resolves.toEqual({
      headers: ["Student Number", "Email"],
      rows: [["2026-00001", "ana@example.edu"]],
    });
  });

  it.each([
    {
      caseName: "empty file",
      file: new File([], "recipients.csv", { type: "text/csv" }),
      message: "Batch file is empty",
    },
    {
      caseName: "header-only file",
      file: csvFile("Student Number"),
      message: "Batch file must contain a header and at least one data row",
    },
    {
      caseName: "header-only file with a trailing newline",
      file: csvFile("Student Number\n"),
      message: "Batch file must contain a header and at least one data row",
    },
    {
      caseName: "unsupported extension",
      file: csvFile("Student Number\n2026-00001", "recipients.txt"),
      message: "Batch file must be CSV or XLSX",
    },
    {
      caseName: "unsupported MIME type",
      file: csvFile("Student Number\n2026-00001", "recipients.csv", "application/json"),
      message: "Batch file MIME type is not supported",
    },
    {
      caseName: "file larger than 2 MiB",
      file: new File(["x".repeat(2 * 1024 * 1024 + 1)], "recipients.csv", {
        type: "text/csv",
      }),
      message: "Batch file must not exceed 2 MiB",
    },
    {
      caseName: "more than 5,000 data rows",
      file: csvFile(
        `Student Number\n${Array.from({ length: 5001 }, (_, index) => `2026-${index}`).join("\n")}`,
      ),
      message: "Batch file cannot exceed 5,000 data rows",
    },
  ])("rejects unsafe input: $caseName", async ({ file, message }) => {
    await expect(inspectBatchFile(file)).rejects.toThrow(message);
  });

  it("rejects an all-empty header row", async () => {
    await expect(inspectBatchFile(csvFile(",\t\n2026-00001,ana@example.edu"))).rejects.toThrow(
      "Batch file must contain a header",
    );
  });

  it("rejects an all-empty XLSX header row", async () => {
    await expect(
      inspectBatchFile(
        await xlsxFile([
          ["", " "],
          ["2026-00001", "ana@example.edu"],
        ]),
      ),
    ).rejects.toThrow("Batch file must contain a header");
  });

  it("normalizes only valid, distinct in-bounds mappings", () => {
    expect(normalizeBatchMapping({ studentNumber: 0 }, 2)).toEqual({
      studentNumber: 0,
      email: null,
    });
    expect(normalizeBatchMapping({ studentNumber: 0, email: 1 }, 2)).toEqual({
      studentNumber: 0,
      email: 1,
    });
    expect(() => normalizeBatchMapping({ studentNumber: 2 }, 2)).toThrow("Invalid batch mapping");
    expect(() => normalizeBatchMapping({ studentNumber: 0, email: 0 }, 2)).toThrow(
      "Invalid batch mapping",
    );
    expect(() => normalizeBatchMapping({ studentNumber: -1 }, 2)).toThrow("Invalid batch mapping");
  });

  it("maps source rows with one-based spreadsheet row numbers and normalized values", () => {
    expect(
      mapBatchRows(
        [
          [" 2026-00001 ", " ANA@EXAMPLE.EDU "],
          ["2026-00002", ""],
        ],
        { studentNumber: 0, email: 1 },
      ),
    ).toEqual(mappedRows);
  });

  it("keeps an unsafe student number bounded for safe preview display", () => {
    const [row] = mapBatchRows([["x".repeat(101)]], { studentNumber: 0, email: null });
    expect(row).toMatchObject({
      rowNumber: 2,
      studentNumber: "x".repeat(100),
      invalidReason: "Student number is invalid.",
    });
  });

  it("uses a case-insensitive canonical key while preserving the student-number display", () => {
    const mapped = mapBatchRows([[" CS-2026-A "]], { studentNumber: 0, email: null });
    expect(mapped[0]).toMatchObject({
      studentNumber: "CS-2026-A",
      studentNumberKey: "cs-2026-a",
    });
  });
});

describe("batch row classification", () => {
  it("applies every disposition with documented precedence and exact summary counts", () => {
    const result = classifyBatchRows({
      rows: [
        {
          rowNumber: 2,
          studentNumber: "",
          emailSupplied: null,
          invalidReason: null,
        },
        { rowNumber: 3, studentNumber: "same", emailSupplied: null, invalidReason: null },
        { rowNumber: 4, studentNumber: "same", emailSupplied: null, invalidReason: null },
        { rowNumber: 5, studentNumber: "missing", emailSupplied: null, invalidReason: null },
        { rowNumber: 6, studentNumber: "inactive", emailSupplied: null, invalidReason: null },
        {
          rowNumber: 7,
          studentNumber: "mismatch",
          emailSupplied: "wrong@example.edu",
          invalidReason: null,
        },
        {
          rowNumber: 8,
          studentNumber: "issued",
          emailSupplied: "issued@example.edu",
          invalidReason: null,
        },
        {
          rowNumber: 9,
          studentNumber: "ready",
          emailSupplied: " READY@EXAMPLE.EDU ",
          invalidReason: null,
        },
      ],
      knownStudents: new Map([
        ["same", { id: "student-same", email: "same@example.edu" }],
        ["inactive", { id: "student-inactive", email: "inactive@example.edu" }],
        ["mismatch", { id: "student-mismatch", email: "match@example.edu" }],
        ["issued", { id: "student-issued", email: "issued@example.edu" }],
        ["ready", { id: "student-ready", email: "ready@example.edu" }],
      ]),
      activeStudentIds: new Set([
        "student-same",
        "student-mismatch",
        "student-issued",
        "student-ready",
      ]),
      existingIssuances: new Map([
        ["student-issued", { issuanceId: "issuance-1", publicId: "public-1" }],
      ]),
    });

    expect(result.rows.map((row) => row.disposition)).toEqual([
      "INVALID",
      "READY",
      "DUPLICATE_IN_FILE",
      "STUDENT_NOT_FOUND",
      "NOT_ACTIVELY_ENROLLED",
      "EMAIL_MISMATCH",
      "ALREADY_ISSUED",
      "READY",
    ]);
    expect(result.rows.map((row) => row.studentId)).toEqual([
      null,
      "student-same",
      null,
      null,
      "student-inactive",
      "student-mismatch",
      "student-issued",
      "student-ready",
    ]);
    expect(result.rows[6]).toMatchObject({ issuanceId: "issuance-1", publicId: "public-1" });
    expect(result.rows.every((row) => !row.message.includes("@example.edu"))).toBe(true);
    expect(result).toMatchObject({
      totalRows: 8,
      readyCount: 2,
      alreadyIssuedCount: 1,
      invalidCount: 5,
    });
  });

  it("treats only non-empty supplied email as a cross-check", () => {
    const result = classifyBatchRows({
      rows: [{ rowNumber: 2, studentNumber: "student", emailSupplied: null, invalidReason: null }],
      knownStudents: new Map([["student", { id: "student-1", email: "stored@example.edu" }]]),
      activeStudentIds: new Set(["student-1"]),
      existingIssuances: new Map(),
    });
    expect(result.rows[0]).toMatchObject({ disposition: "READY", emailSupplied: null });
  });

  it("matches the first casing variant and marks later casing variants duplicate", () => {
    const rows = mapBatchRows([["CS-2026-A"], ["cs-2026-a"]], { studentNumber: 0, email: null });
    const result = classifyBatchRows({
      rows,
      knownStudents: new Map([["cs-2026-a", { id: "student-1", email: "student@example.edu" }]]),
      activeStudentIds: new Set(["student-1"]),
      existingIssuances: new Map(),
    });

    expect(result.rows).toMatchObject([
      { studentNumber: "CS-2026-A", disposition: "READY", studentId: "student-1" },
      { studentNumber: "cs-2026-a", disposition: "DUPLICATE_IN_FILE", studentId: null },
    ]);
  });
});

describe("batch preview fingerprint", () => {
  const input = {
    classId: "class-1",
    badgeTemplateId: "badge-1",
    sourceFilename: "recipients.csv",
    mapping: { studentNumber: 0, email: null },
    rows: mappedRows,
  };

  it("is a stable lowercase SHA-256 hash for semantically identical input", () => {
    expect(fingerprintBatchPreview(input)).toBe(
      fingerprintBatchPreview({ ...input, mapping: { studentNumber: 0 } }),
    );
    expect(fingerprintBatchPreview(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds the canonical student-number lookup keys used by preview classification", () => {
    const rows = mapBatchRows([["CS-2026-A"]], { studentNumber: 0, email: null });
    expect(
      fingerprintBatchPreview({
        ...input,
        rows: rows.map((row) => ({ ...row, studentNumberKey: "other" })),
      }),
    ).not.toBe(fingerprintBatchPreview({ ...input, rows }));
  });

  it.each([
    [{ ...input, classId: "class-2" }],
    [{ ...input, badgeTemplateId: "badge-2" }],
    [{ ...input, sourceFilename: "other.csv" }],
    [{ ...input, mapping: { studentNumber: 0, email: 1 } }],
    [{ ...input, rows: [...mappedRows].reverse() }],
    [{ ...input, rows: [{ ...mappedRows[0]!, studentNumber: "2026-00003" }, mappedRows[1]!] }],
  ])("changes when a bound value or row order changes", (changed) => {
    expect(fingerprintBatchPreview(changed)).not.toBe(fingerprintBatchPreview(input));
  });
});
