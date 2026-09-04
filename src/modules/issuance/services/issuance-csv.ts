import "server-only";

import type { IssuanceExportRow } from "./issuance-query-service";
import { quoteCsv } from "@/modules/rosters/services/roster-validation";

export const ISSUANCE_CSV_HEADERS = [
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
] as const;

export function buildIssuanceCsv(rows: IssuanceExportRow[]): Uint8Array {
  const csvRows = [
    ISSUANCE_CSV_HEADERS,
    ...rows.map((row) => [
      row.publicId,
      row.status,
      row.issuedAt,
      row.expiresAt ?? "",
      row.classCourseCode,
      row.classTitle,
      row.classSection,
      row.badgeName,
      row.studentNumber,
      row.recipientDisplayName,
      row.recipientEmail,
      row.issuerUserName,
    ]),
  ];
  return new TextEncoder().encode(
    `\uFEFF${csvRows.map((row) => row.map(quoteCsv).join(",")).join("\r\n")}`,
  );
}
