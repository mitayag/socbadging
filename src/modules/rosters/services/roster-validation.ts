import { z } from "zod";

export type ImportStudentRow = {
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
};
export type ValidatedImportRow = ImportStudentRow & { rowNumber: number; errors: string[] };

const emailSchema = z.email();
export function validateImportRows(input: ImportStudentRow[]): ValidatedImportRow[] {
  const seen = new Set<string>();
  return input.map((raw, index) => {
    const row = {
      studentNumber: raw.studentNumber.trim(),
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim().toLowerCase(),
    };
    const errors: string[] = [];
    if (!row.studentNumber) errors.push("Student number is required");
    if (!row.firstName) errors.push("First name is required");
    if (!row.lastName) errors.push("Last name is required");
    if (!emailSchema.safeParse(row.email).success) errors.push("Invalid email address");
    if (seen.has(row.studentNumber.toLowerCase())) errors.push("Duplicate student number in file");
    if (row.studentNumber) seen.add(row.studentNumber.toLowerCase());
    return { ...row, rowNumber: index + 2, errors };
  });
}

export function sanitizeCsvCell(value: string): string {
  return /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function quoteCsv(value: string): string {
  return `"${sanitizeCsvCell(value).replaceAll('"', '""')}"`;
}
