import "server-only";

import ExcelJS from "exceljs";

import { quoteCsv } from "@/modules/rosters/services/roster-validation";

export const BATCH_TEMPLATE_HEADERS = ["Student Number", "Email"] as const;
const exampleRecipient = ["2099-00001", "student.one@example.edu"] as const;

export function buildBatchCsvTemplate(): Uint8Array {
  const content = [BATCH_TEMPLATE_HEADERS, exampleRecipient]
    .map((row) => row.map(quoteCsv).join(","))
    .join("\r\n");
  return new TextEncoder().encode(`\uFEFF${content}`);
}

export async function buildBatchXlsxTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Recipients", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [{ width: 22 }, { width: 36 }];
  worksheet.addRow(BATCH_TEMPLATE_HEADERS);
  worksheet.addRow(exampleRecipient);
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF163A63" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FF" } };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
