import type { ImportField, ImportMapping } from "./import-types";

export const importFields: Array<{
  key: ImportField;
  label: string;
  hint: string;
}> = [
  {
    key: "studentNumber",
    label: "Student Number",
    hint: "Unique institutional student identifier.",
  },
  { key: "firstName", label: "First Name", hint: "The student's given name." },
  { key: "lastName", label: "Last Name", hint: "The student's family name." },
  { key: "email", label: "Email", hint: "The student's institutional email address." },
];

export const emptyMapping: ImportMapping = {
  studentNumber: "",
  firstName: "",
  lastName: "",
  email: "",
};

export function mappingStatus(mapping: ImportMapping) {
  const values = importFields.map((field) => mapping[field.key]).filter(Boolean);
  const complete = importFields.every((field) => mapping[field.key] !== "");
  return {
    complete,
    duplicate: new Set(values).size !== values.length,
    ready: complete && new Set(values).size === values.length,
  };
}
