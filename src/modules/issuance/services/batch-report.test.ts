import { describe, expect, it } from "vitest";

import { parseRosterFile } from "@/modules/rosters/services/import-parser";

import { BATCH_REPORT_CSV_HEADERS, buildBatchReportCsv } from "./batch-report";

const rows = [
  {
    rowNumber: 2,
    studentNumber: "2026-00001",
    emailSupplied: "jose@example.edu",
    disposition: "READY" as const,
    message: "Ready to issue.",
    issuanceId: null,
    publicId: null,
  },
];

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

describe("buildBatchReportCsv", () => {
  it("emits the literal required header order", () => {
    expect(BATCH_REPORT_CSV_HEADERS).toEqual([
      "Row Number",
      "Student Number",
      "Email Supplied",
      "Disposition",
      "Message",
      "Issuance ID",
      "Public ID",
    ]);
  });

  it("uses a UTF-8 BOM and CRLF delimiters", () => {
    const bytes = buildBatchReportCsv(rows);
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain("\r\n");
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("round-trips Unicode, nullable result identifiers, and supplied email through the CSV parser", async () => {
    const file = new File(
      [
        copyBytes(
          buildBatchReportCsv([
            { ...rows[0]!, studentNumber: "2026-00001-東京", message: "Prêt à délivrer." },
          ]),
        ).buffer,
      ],
      "report.csv",
      { type: "text/csv" },
    );
    await expect(parseRosterFile(file)).resolves.toEqual({
      headers: [...BATCH_REPORT_CSV_HEADERS],
      rows: [["2", "2026-00001-東京", "jose@example.edu", "READY", "Prêt à délivrer.", "", ""]],
    });
  });

  it("quotes commas and quotes and neutralizes formula cells with leading whitespace", () => {
    const text = new TextDecoder().decode(
      buildBatchReportCsv([
        {
          ...rows[0]!,
          studentNumber: " @formula",
          emailSupplied: " -unsafe@example.edu",
          message: '="value", "quoted"',
        },
      ]),
    );
    expect(text).toContain('"\' @formula"');
    expect(text).toContain('"\' -unsafe@example.edu"');
    expect(text).toContain('"\'=\"\"value\"\", \"\"quoted\"\""');
  });
});
