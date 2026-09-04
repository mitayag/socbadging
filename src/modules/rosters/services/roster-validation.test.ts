import { describe, expect, it } from "vitest";
import { sanitizeCsvCell, validateImportRows } from "./roster-validation";

describe("roster import validation", () => {
  it("rejects invalid email and duplicates within the uploaded file", () => {
    const rows = validateImportRows([
      { studentNumber: "2026-001", firstName: "Ana", lastName: "Cruz", email: "ana@example.edu" },
      { studentNumber: "2026-001", firstName: "Ana", lastName: "Cruz", email: "invalid" },
    ]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors).toContain("Duplicate student number in file");
    expect(rows[1]!.errors).toContain("Invalid email address");
  });

  it("neutralizes spreadsheet formulas in CSV exports", () => {
    expect(sanitizeCsvCell('=HYPERLINK("https://evil.test")')).toBe(
      '\'=HYPERLINK("https://evil.test")',
    );
    expect(sanitizeCsvCell("Student")).toBe("Student");
  });
});
