import { z } from "zod";

function isSafeRootRelativePath(value: string): boolean {
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

const serverSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.url().default("http://localhost:3000"),
    ISSUER_NAME: z.string().trim().min(1).default("Holy Angel University — School of Computing"),
    ISSUER_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    ISSUER_LOGO_PATH: z
      .string()
      .refine(isSafeRootRelativePath, "ISSUER_LOGO_PATH must be a safe root-relative path")
      .default("/images/hausoclogo.png"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .transform((value) => ({ ...value, ISSUER_URL: value.ISSUER_URL ?? value.APP_URL }));

export function getServerEnv() {
  return serverSchema.parse(process.env);
}

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const integerFromEnvironment = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);

export function loadWorkerConfig(environment: Record<string, string | undefined>) {
  return z
    .object({
      NOTIFICATION_POLL_INTERVAL_MS: integerFromEnvironment(250, 60_000, 5000),
      NOTIFICATION_CLAIM_LEASE_SECONDS: integerFromEnvironment(10, 3600, 120),
      NOTIFICATION_MAX_ATTEMPTS: integerFromEnvironment(1, 20, 5),
      NOTIFICATION_RETRY_BASE_DELAY_SECONDS: integerFromEnvironment(1, 86_400, 60),
      NOTIFICATION_BATCH_SIZE: integerFromEnvironment(1, 100, 20),
    })
    .transform((value) => ({
      pollIntervalMs: value.NOTIFICATION_POLL_INTERVAL_MS,
      claimLeaseSeconds: value.NOTIFICATION_CLAIM_LEASE_SECONDS,
      maxAttempts: value.NOTIFICATION_MAX_ATTEMPTS,
      retryBaseDelaySeconds: value.NOTIFICATION_RETRY_BASE_DELAY_SECONDS,
      batchSize: value.NOTIFICATION_BATCH_SIZE,
    }))
    .parse(environment);
}

export function loadSmtpConfig(environment: Record<string, string | undefined>) {
  const value = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      SMTP_HOST: optionalText,
      SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
      SMTP_SECURE: z
        .enum(["true", "false"])
        .default("false")
        .transform((item) => item === "true"),
      SMTP_USERNAME: optionalText,
      SMTP_PASSWORD: optionalText,
      SMTP_FROM: optionalText,
      SMTP_REPLY_TO: optionalText,
    })
    .parse(environment);

  if (Boolean(value.SMTP_USERNAME) !== Boolean(value.SMTP_PASSWORD)) {
    throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be configured together");
  }
  if (value.NODE_ENV === "production" && (!value.SMTP_HOST || !value.SMTP_FROM)) {
    throw new Error("SMTP_HOST and SMTP_FROM are required in production");
  }
  return {
    host: value.SMTP_HOST,
    port: value.SMTP_PORT,
    secure: value.SMTP_SECURE,
    username: value.SMTP_USERNAME,
    password: value.SMTP_PASSWORD,
    from: value.SMTP_FROM,
    replyTo: value.SMTP_REPLY_TO,
  };
}

export function loadSignerServiceConfig(environment: Record<string, string | undefined>) {
  return z
    .object({
      SIGNER_TOKEN: z.string().min(1),
      SIGNING_PRIVATE_KEY_PATH: z.string().min(1),
      SIGNING_KEY_ID: z.url(),
      SIGNING_PUBLIC_MULTIKEY: z.string().trim().min(1).max(16_384),
      SIGNING_KEY_FINGERPRINT: z.string().trim().min(1).max(255),
    })
    .transform((value) => ({
      token: value.SIGNER_TOKEN,
      runtime: {
        privateKeyPath: value.SIGNING_PRIVATE_KEY_PATH,
        keyId: value.SIGNING_KEY_ID,
        publicKeyMultibase: value.SIGNING_PUBLIC_MULTIKEY,
        fingerprint: value.SIGNING_KEY_FINGERPRINT,
      },
    }))
    .parse(environment);
}

export function loadSignerClientConfig(environment: Record<string, string | undefined>) {
  return z
    .object({
      SIGNER_URL: z.url(),
      SIGNER_TOKEN: z.string().min(1),
      SIGNER_TIMEOUT_MS: integerFromEnvironment(1, 60_000, 5000),
    })
    .transform((value) => ({
      baseUrl: value.SIGNER_URL.replace(/\/$/, ""),
      token: value.SIGNER_TOKEN,
      timeoutMs: value.SIGNER_TIMEOUT_MS,
    }))
    .parse(environment);
}
