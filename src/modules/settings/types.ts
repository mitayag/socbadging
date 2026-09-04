import { z } from "zod";

export function isSafeRootRelativePath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[%\\?#\u0000-\u001F\u007F]/.test(value)
  ) {
    return false;
  }

  return value
    .slice(1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isSafeSupportContact(value: string): boolean {
  if (value.startsWith("mailto:")) {
    const email = value.slice("mailto:".length);
    return !/[?#]/.test(email) && z.email().safeParse(email).success;
  }

  return z.email().safeParse(value).success || isSafeHttpUrl(value);
}

const issuerNameSchema = z.string().trim().min(1).max(191);
const issuerUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeHttpUrl, "Use an HTTP or HTTPS URL");
const issuerLogoPathSchema = z
  .string()
  .trim()
  .max(1024)
  .refine(isSafeRootRelativePath, "Use a safe root-relative logo path");
const supportContactSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .max(2048)
    .refine(isSafeSupportContact, "Use an email, mailto: email, or HTTP/HTTPS URL")
    .nullable(),
);

export const PublicSystemSettingsSchema = z
  .object({
    issuerName: issuerNameSchema,
    issuerUrl: issuerUrlSchema,
    issuerLogoPath: issuerLogoPathSchema,
    supportContact: supportContactSchema,
    sharingEnabled: z.boolean(),
  })
  .strict();

export const SystemSettingsInputSchema = PublicSystemSettingsSchema;

export type PublicSystemSettings = z.output<typeof PublicSystemSettingsSchema>;
export type SystemSettingsInput = z.output<typeof SystemSettingsInputSchema>;
