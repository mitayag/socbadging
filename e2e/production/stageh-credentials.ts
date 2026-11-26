import { readFileSync } from "node:fs";

export type StageHCredentials = {
  baseUrl: string;
  scope: "STAGEH";
  admin: { email: string; password: string };
  faculty: { email: string; password: string };
  student: { email: string; password: string };
  class: { id: string; courseCode: string };
};

export function loadStageHCredentials(): StageHCredentials | null {
  const path = process.env.STAGEH_CREDENTIALS_FILE;
  if (!path) return null;
  const value = JSON.parse(readFileSync(path, "utf8")) as StageHCredentials;
  if (value.scope !== "STAGEH") throw new Error("Credentials file is not a STAGEH scope file");
  return value;
}
