import { describe, expect, it } from "vitest";

import { parseRosterFile } from "@/modules/rosters/services/import-parser";

import { buildIssuanceCsv, ISSUANCE_CSV_HEADERS } from "./issuance-csv";
import type { IssuanceExportRow } from "./issuance-query-service";

const rows: IssuanceExportRow[] = [
  {
    publicId: "public-1",
    status: "ACTIVE" as const,
    issuedAt: "2026-08-12T08:30:15.250Z",
    expiresAt: null,
    classCourseCode: "CS 401",
    classTitle: "Secure Systems",
    classSection: "A",
    badgeName: "Secure Systems Foundations",
    studentNumber: "2026-00001",
    recipientDisplayName: "José Dela Cruz",
    recipientEmail: "jose@example.edu",
    issuerUserName: "Prof. Reyes",
  },
];

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

describe("buildIssuanceCsv", () => {
  it("emits the literal Phase 4 header order with private email in the authorized export", () => {
    const text = new TextDecoder().decode(buildIssuanceCsv(rows));

    expect(ISSUANCE_CSV_HEADERS).toEqual([
      "Public ID",
      "Status",
      "Issued At",
      "Expires At",
      "Course Code",
      "Class Title",
      "Section",
      "Badge Name",
      "Student Number",
      "Recipient Name",
      "Recipient Email",
      "Issuing Faculty",
    ]);
    expect(text).toContain('"Recipient Email"');
    expect(text).toContain('"jose@example.edu"');
  });

  it("prefixes UTF-8 BOM and uses CRLF rows", () => {
    const bytes = buildIssuanceCsv(rows);
    const text = new TextDecoder().decode(bytes);

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain("\r\n");
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("round-trips Unicode and authorized recipient email through the existing CSV parser", async () => {
    const file = new File([copyBytes(buildIssuanceCsv(rows)).buffer], "issuances.csv", {
      type: "text/csv",
    });

    await expect(parseRosterFile(file)).resolves.toEqual({
      headers: [...ISSUANCE_CSV_HEADERS],
      rows: [
        [
          "public-1",
          "ACTIVE",
          "2026-08-12T08:30:15.250Z",
          "",
          "CS 401",
          "Secure Systems",
          "A",
          "Secure Systems Foundations",
          "2026-00001",
          "José Dela Cruz",
          "jose@example.edu",
          "Prof. Reyes",
        ],
      ],
    });
  });

  it("quotes commas and quotes while preventing spreadsheet formulas, including leading whitespace", () => {
    const bytes = buildIssuanceCsv([
      {
        ...rows[0]!,
        badgeName: '="credential", \"verified\"',
        recipientDisplayName: " @formula",
        recipientEmail: " -unsafe@example.edu",
      },
    ]);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain('"\'=\"\"credential\"\", \"\"verified\"\""');
    expect(text).toContain('"\' @formula"');
    expect(text).toContain('"\' -unsafe@example.edu"');
  });
});
