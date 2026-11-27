import type { ImportMapping } from "./import-types";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

function normalizeHeader(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

export function autoMap(headers: string[]): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const find = (aliases: string[]) => {
    const index = normalized.findIndex((header) => aliases.includes(header));
    return index >= 0 ? String(index) : "";
  };
  return {
    studentNumber: find(["studentnumber", "studentid", "studentno"]),
    firstName: find(["firstname", "givenname", "givennames"]),
    lastName: find(["lastname", "surname", "familyname"]),
    email: find(["email", "emailaddress", "studentemail", "institutionalemail"]),
  };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: File) {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "Choose a .csv or .xlsx file.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_FILE_BYTES) return "The selected file is larger than 2 MiB.";
  return "";
}
