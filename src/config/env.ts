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

export type EmailDeliveryMode = "mailpit" | "brevo";
export type EmailRecipientPolicy = "local" | "staging" | "production";

export type EmailTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  tls?: { rejectUnauthorized: boolean };
  username?: string;
  password?: string;
  from: string;
  replyTo?: string;
};

export type EmailDeliveryConfig = {
  mode: EmailDeliveryMode;
  policy: EmailRecipientPolicy;
  externalEnabled: boolean;
  controlledAcceptanceOnly: boolean;
  allowlist: string[];
  transport: EmailTransportConfig;
};

const emailBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export function loadEmailDeliveryConfig(
  environment: Record<string, string | undefined>,
): EmailDeliveryConfig {
  const value = z
    .object({
      EMAIL_DELIVERY_MODE: z.enum(["mailpit", "brevo"]).default("mailpit"),
      EMAIL_RECIPIENT_POLICY: z.preprocess(
        (item) => (typeof item === "string" ? item.trim().toLowerCase() : item),
        z.enum(["local", "staging", "production"]).optional(),
      ),
      EXTERNAL_EMAIL_ENABLED: emailBoolean,
      CONTROLLED_ACCEPTANCE_ONLY: emailBoolean,
      EXTERNAL_EMAIL_ALLOWLIST: z.string().default(""),
      SMTP_HOST: optionalText,
      SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
      SMTP_SECURE: emailBoolean,
      SMTP_USERNAME: optionalText,
      SMTP_PASSWORD: optionalText,
      SMTP_FROM: optionalText,
      SMTP_REPLY_TO: optionalText,
      BREVO_SMTP_HOST: z.string().trim().min(1).default("smtp-relay.brevo.com"),
      BREVO_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
      BREVO_SMTP_USER: optionalText,
      BREVO_SMTP_PASSWORD: optionalText,
      BREVO_SENDER: z.string().trim().min(1).default("HAU SOC Badging System <badges@hausoc.org>"),
    })
    .parse(environment);

  const allowlist = [
    ...new Set(
      value.EXTERNAL_EMAIL_ALLOWLIST.split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  if (value.EMAIL_DELIVERY_MODE === "brevo") {
    if (!value.EMAIL_RECIPIENT_POLICY) {
      throw new Error("EMAIL_RECIPIENT_POLICY is required when EMAIL_DELIVERY_MODE=brevo");
    }
    if (value.EMAIL_RECIPIENT_POLICY === "local") {
      throw new Error("EMAIL_RECIPIENT_POLICY=local requires EMAIL_DELIVERY_MODE=mailpit");
    }
    if (!value.EXTERNAL_EMAIL_ENABLED) {
      throw new Error("Brevo delivery requires EXTERNAL_EMAIL_ENABLED=true");
    }
    if (value.BREVO_SMTP_PORT !== 587) {
      throw new Error("Brevo SMTP must use port 587 with STARTTLS");
    }
    if (!value.BREVO_SMTP_USER || !value.BREVO_SMTP_PASSWORD) {
      throw new Error("Brevo SMTP username and password are required");
    }
    if (value.EMAIL_RECIPIENT_POLICY === "staging" && !allowlist.length) {
      throw new Error(
        "EXTERNAL_EMAIL_ALLOWLIST must contain at least one recipient when EMAIL_RECIPIENT_POLICY=staging",
      );
    }
    return {
      mode: "brevo",
      policy: value.EMAIL_RECIPIENT_POLICY,
      externalEnabled: true,
      controlledAcceptanceOnly: value.CONTROLLED_ACCEPTANCE_ONLY,
      allowlist,
      transport: {
        host: value.BREVO_SMTP_HOST,
        port: value.BREVO_SMTP_PORT,
        secure: false,
        requireTLS: true,
        tls: { rejectUnauthorized: true },
        username: value.BREVO_SMTP_USER,
        password: value.BREVO_SMTP_PASSWORD,
        from: value.BREVO_SENDER,
      },
    };
  }

  if (value.EMAIL_RECIPIENT_POLICY && value.EMAIL_RECIPIENT_POLICY !== "local") {
    throw new Error("EMAIL_RECIPIENT_POLICY must be local when EMAIL_DELIVERY_MODE=mailpit");
  }
  if (Boolean(value.SMTP_USERNAME) !== Boolean(value.SMTP_PASSWORD)) {
    throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be configured together");
  }
  return {
    mode: "mailpit",
    policy: "local",
    externalEnabled: false,
    controlledAcceptanceOnly: false,
    allowlist,
    transport: {
      host: value.SMTP_HOST ?? "mailpit",
      port: value.SMTP_PORT,
      secure: value.SMTP_SECURE,
      requireTLS: false,
      ...(value.SMTP_USERNAME && value.SMTP_PASSWORD
        ? { username: value.SMTP_USERNAME, password: value.SMTP_PASSWORD }
        : {}),
      from: value.SMTP_FROM ?? "HAU SOC Badging System <badges@example.edu>",
      ...(value.SMTP_REPLY_TO ? { replyTo: value.SMTP_REPLY_TO } : {}),
    },
  };
}

export function isValidRecipientEmail(email: string): boolean {
  return z.email().safeParse(email.trim()).success;
}

export function isRecipientAllowedByPolicy(
  policy: EmailRecipientPolicy,
  email: string,
  allowlist: readonly string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!isValidRecipientEmail(normalized)) return false;
  if (policy === "local") return true;
  if (policy === "staging") return allowlist.includes(normalized);
  return policy === "production";
}

export function isExternalRecipientAllowed(config: EmailDeliveryConfig, email: string): boolean {
  return isRecipientAllowedByPolicy(config.policy, email, config.allowlist);
}

export function loadBrevoWebhookConfig(environment: Record<string, string | undefined>) {
  const value = z
    .object({
      BREVO_WEBHOOK_ENABLED: emailBoolean,
      BREVO_WEBHOOK_SECRET: optionalText,
    })
    .parse(environment);
  if (value.BREVO_WEBHOOK_ENABLED && !value.BREVO_WEBHOOK_SECRET) {
    throw new Error("BREVO_WEBHOOK_SECRET is required when the webhook is enabled");
  }
  return {
    enabled: value.BREVO_WEBHOOK_ENABLED,
    secret: value.BREVO_WEBHOOK_SECRET,
  };
}

export function loadSignerServiceConfig(environment: Record<string, string | undefined>) {
  return z
    .object({
      SIGNER_TOKEN: z.string().min(1),
      SIGNING_PRIVATE_KEY_PATH: z.string().startsWith("/").min(2),
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

export function loadSignerReadinessConfig(environment: Record<string, string | undefined>) {
  const client = loadSignerClientConfig(environment);
  const metadata = z
    .object({
      SIGNING_KEY_ID: z.url(),
      SIGNING_CRYPTOSUITE: z.literal("eddsa-rdfc-2022"),
    })
    .parse(environment);

  return {
    ...client,
    expectedKeyId: metadata.SIGNING_KEY_ID,
    expectedCryptosuite: metadata.SIGNING_CRYPTOSUITE,
  };
}
