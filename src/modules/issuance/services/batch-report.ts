import "server-only";

import type { BatchReportRow } from "@/modules/issuance/batch-types";
import { quoteCsv } from "@/modules/rosters/services/roster-validation";

export const BATCH_REPORT_CSV_HEADERS = [
  "Row Number",
  "Student Number",
  "Email Supplied",
  "Disposition",
  "Message",
  "Issuance ID",
  "Public ID",
] as const;

export function buildBatchReportCsv(rows: BatchReportRow[]): Uint8Array {
  const csvRows = [
    BATCH_REPORT_CSV_HEADERS,
    ...rows.map((row) => [
      String(row.rowNumber),
      row.studentNumber,
      row.emailSupplied ?? "",
      row.disposition,
      row.message,
      row.issuanceId ?? "",
      row.publicId ?? "",
    ]),
  ];
  return new TextEncoder().encode(
    `\uFEFF${csvRows.map((row) => row.map(quoteCsv).join(",")).join("\r\n")}`,
  );
}
