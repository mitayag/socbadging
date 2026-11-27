export type ImportStep = 1 | 2 | 3 | 4;

export type ImportField = "studentNumber" | "firstName" | "lastName" | "email";

export type ImportMapping = Record<ImportField, string>;

export type ImportInspection = {
  headers: string[];
  rows: string[][];
};

export type ImportPreviewRow = {
  rowNumber: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  errors: string[];
};

export type ImportPreview = {
  id: string;
  validCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
};

export type ImportCommitState = {
  status: "idle" | "success" | "error";
  message: string;
  importedCount: number;
};
