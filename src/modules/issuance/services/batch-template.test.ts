import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  BATCH_TEMPLATE_HEADERS,
  buildBatchCsvTemplate,
  buildBatchXlsxTemplate,
} from "./batch-template";

describe("batch template artifacts", () => {
  it("builds a BOM CSV with exact headers and fictitious formula-safe examples", () => {
    const bytes = buildBatchCsvTemplate();
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('"Student Number","Email"\r\n');
    expect(text).toContain("example.edu");
    expect(text).not.toMatch(/\r\n[=+@-]/);
  });

  it("builds an XLSX workbook with the exact headers and fictitious examples", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(await buildBatchXlsxTemplate()) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    );
    const worksheet = workbook.worksheets[0];
    expect(worksheet).toBeDefined();
    if (!worksheet) throw new Error("Template worksheet missing");
    expect(worksheet.getRow(1).values).toEqual([undefined, ...BATCH_TEMPLATE_HEADERS]);
    expect(String(worksheet.getCell("B2").value)).toContain("example.edu");
  });
});
