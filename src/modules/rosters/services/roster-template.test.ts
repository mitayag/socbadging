import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseRosterFile } from "./import-parser";
import {
  buildRosterCsvTemplate,
  buildRosterXlsxTemplate,
  ROSTER_TEMPLATE_HEADERS,
} from "./roster-template";

const expectedHeaders = ["Student Number", "First Name", "Last Name", "Email"];
const expectedStudent = ["2026-00001", "Juan", "Dela Cruz", "juan.delacruz@example.edu"];

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function rosterTemplateFile(bytes: Uint8Array, name: string): File {
  return new File([copyBytes(bytes).buffer], name);
}

describe("roster import templates", () => {
  it("rejects a roster whose declared MIME type does not match its extension", async () => {
    const file = new File(
      ["Student Number,First Name,Last Name,Email\n1,A,B,a@example.edu"],
      "roster.csv",
      {
        type: "application/json",
      },
    );

    await expect(parseRosterFile(file)).rejects.toThrow("Roster file MIME type is not supported");
  });

  it("builds a BOM-prefixed CSV template that parses as the example roster", async () => {
    const bytes = buildRosterCsvTemplate();

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(
      '\uFEFF"Student Number","First Name","Last Name","Email"\r\n"2026-00001","Juan","Dela Cruz","juan.delacruz@example.edu"',
    );

    const parsed = await parseRosterFile(rosterTemplateFile(bytes, "roster-template.csv"));
    expect(parsed).toEqual({ headers: expectedHeaders, rows: [expectedStudent] });
  });

  it("builds a formula-free XLSX template that parses as the example roster", async () => {
    const bytes = await buildRosterXlsxTemplate();
    const parsed = await parseRosterFile(rosterTemplateFile(bytes, "roster-template.xlsx"));

    expect(parsed).toEqual({ headers: expectedHeaders, rows: [expectedStudent] });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(copyBytes(bytes).buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.getWorksheet("Students");
    expect(sheet).toBeDefined();
    expect(sheet!.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "frozen", ySplit: 1 })]),
    );
    expect(sheet!.columns.map((column) => column.width)).toEqual([20, 20, 24, 34]);

    sheet!.getRow(1).eachCell((cell) => {
      expect(cell.font).toMatchObject({ bold: true, color: { argb: "FF163A63" } });
      expect(cell.fill).toMatchObject({
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEAF2FF" },
      });
    });

    for (const row of sheet!.getRows(1, 2) ?? []) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        expect(typeof cell.value).toBe("string");
        expect(cell.value).not.toMatchObject({ formula: expect.any(String) });
      });
    }
  });

  it("exposes the import-compatible header order", () => {
    expect(ROSTER_TEMPLATE_HEADERS).toEqual(expectedHeaders);
  });
});
