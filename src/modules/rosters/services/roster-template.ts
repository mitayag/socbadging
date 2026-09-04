import "server-only";
import ExcelJS from "exceljs";
import { quoteCsv } from "./roster-validation";

export const ROSTER_TEMPLATE_HEADERS = [
  "Student Number",
  "First Name",
  "Last Name",
  "Email",
] as const;

const exampleStudent = ["2026-00001", "Juan", "Dela Cruz", "juan.delacruz@example.edu"];

export function buildRosterCsvTemplate(): Uint8Array {
  const content = [ROSTER_TEMPLATE_HEADERS, exampleStudent]
    .map((row) => row.map(quoteCsv).join(","))
    .join("\r\n");
  return new TextEncoder().encode(`\uFEFF${content}`);
}

export async function buildRosterXlsxTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [{ width: 20 }, { width: 20 }, { width: 24 }, { width: 34 }];
  worksheet.addRow(ROSTER_TEMPLATE_HEADERS);
  worksheet.addRow(exampleStudent);

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF163A63" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FF" } };
  });

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
