import { describe, expect, it } from "vitest";

import {
  isExternalRecipientAllowed,
  loadBrevoWebhookConfig,
  loadEmailDeliveryConfig,
  loadSignerClientConfig,
  loadSignerReadinessConfig,
  loadSignerServiceConfig,
  loadSmtpConfig,
  loadWorkerConfig,
} from "./env";

describe("notification environment", () => {
  it("loads bounded worker defaults", () => {
    expect(loadWorkerConfig({})).toEqual({
      pollIntervalMs: 5000,
      claimLeaseSeconds: 120,
      maxAttempts: 5,
      retryBaseDelaySeconds: 60,
      batchSize: 20,
    });
  });

  it("rejects partial SMTP credentials", () => {
    expect(() =>
      loadSmtpConfig({ SMTP_HOST: "smtp.example.edu", SMTP_USERNAME: "user" }),
    ).toThrow();
  });

  it("requires a complete SMTP sender in production", () => {
    expect(() => loadSmtpConfig({ NODE_ENV: "production" })).toThrow();
  });

  it("keeps Mailpit as the default email transport", () => {
    const config = loadEmailDeliveryConfig({});
    expect(config).toMatchObject({
      mode: "mailpit",
      policy: "local",
      externalEnabled: false,
      transport: { host: "mailpit", port: 1025, requireTLS: false },
    });
    expect(isExternalRecipientAllowed(config, "anyone@example.test")).toBe(true);
  });

  it("refuses Brevo delivery unless external delivery is explicitly enabled", () => {
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "staging",
        BREVO_SMTP_USER: "brevo-user",
        BREVO_SMTP_PASSWORD: "brevo-password",
        EXTERNAL_EMAIL_ALLOWLIST: "authorized@example.test",
      }),
    ).toThrow("EXTERNAL_EMAIL_ENABLED=true");
  });

  it("requires an explicit policy for Brevo and an allowlist for staging", () => {
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EXTERNAL_EMAIL_ENABLED: "true",
        BREVO_SMTP_USER: "brevo-user",
        BREVO_SMTP_PASSWORD: "brevo-password",
      }),
    ).toThrow("EMAIL_RECIPIENT_POLICY");
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "staging",
        EXTERNAL_EMAIL_ENABLED: "true",
        BREVO_SMTP_USER: "brevo-user",
        BREVO_SMTP_PASSWORD: "brevo-password",
      }),
    ).toThrow("EXTERNAL_EMAIL_ALLOWLIST");
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "staging",
        EXTERNAL_EMAIL_ENABLED: "true",
        EXTERNAL_EMAIL_ALLOWLIST: "authorized@example.test",
      }),
    ).toThrow("username and password");
  });

  it("rejects local policy with Brevo and non-local policy with Mailpit", () => {
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "local",
        EXTERNAL_EMAIL_ENABLED: "true",
        EXTERNAL_EMAIL_ALLOWLIST: "authorized@example.test",
        BREVO_SMTP_USER: "brevo-user",
        BREVO_SMTP_PASSWORD: "brevo-password",
      }),
    ).toThrow("local requires EMAIL_DELIVERY_MODE=mailpit");
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "mailpit",
        EMAIL_RECIPIENT_POLICY: "production",
      }),
    ).toThrow("must be local");
    expect(() =>
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "invalid",
        EXTERNAL_EMAIL_ENABLED: "true",
      }),
    ).toThrow();
  });

  it("configures Brevo port 587 with STARTTLS and certificate verification", () => {
    const config = loadEmailDeliveryConfig({
      EMAIL_DELIVERY_MODE: "brevo",
      EMAIL_RECIPIENT_POLICY: "staging",
      EXTERNAL_EMAIL_ENABLED: "true",
      EXTERNAL_EMAIL_ALLOWLIST: " Authorized@Example.test , second@example.test ",
      BREVO_SMTP_USER: "brevo-user",
      BREVO_SMTP_PASSWORD: "brevo-password",
      BREVO_SENDER: "HAU SOC Badging System <badges@hausoc.org>",
    });
    expect(config.mode).toBe("brevo");
    expect(config.policy).toBe("staging");
    expect(config.allowlist).toEqual(["authorized@example.test", "second@example.test"]);
    expect(config.transport).toMatchObject({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true },
      username: "brevo-user",
      password: "brevo-password",
      from: "HAU SOC Badging System <badges@hausoc.org>",
    });
    expect(isExternalRecipientAllowed(config, "AUTHORIZED@example.test")).toBe(true);
    expect(isExternalRecipientAllowed(config, "other@example.test")).toBe(false);
    expect(isExternalRecipientAllowed(config, "not-an-email")).toBe(false);
  });

  it("defaults controlled acceptance mode off and can enable it explicitly", () => {
    expect(loadEmailDeliveryConfig({}).controlledAcceptanceOnly).toBe(false);
    expect(
      loadEmailDeliveryConfig({
        EMAIL_DELIVERY_MODE: "brevo",
        EMAIL_RECIPIENT_POLICY: "staging",
        EXTERNAL_EMAIL_ENABLED: "true",
        CONTROLLED_ACCEPTANCE_ONLY: "true",
        EXTERNAL_EMAIL_ALLOWLIST: "authorized-test-recipient@example.org",
        BREVO_SMTP_USER: "brevo-user",
        BREVO_SMTP_PASSWORD: "brevo-password",
      }).controlledAcceptanceOnly,
    ).toBe(true);
  });

  it("allows authorized production recipients without an allowlist and still rejects invalid addresses", () => {
    const config = loadEmailDeliveryConfig({
      EMAIL_DELIVERY_MODE: "brevo",
      EMAIL_RECIPIENT_POLICY: "production",
      EXTERNAL_EMAIL_ENABLED: "true",
      BREVO_SMTP_USER: "brevo-user",
      BREVO_SMTP_PASSWORD: "brevo-password",
    });
    expect(config.policy).toBe("production");
    expect(config.allowlist).toEqual([]);
    expect(isExternalRecipientAllowed(config, "student@hau.edu.ph")).toBe(true);
    expect(isExternalRecipientAllowed(config, "faculty@hau.edu.ph")).toBe(true);
    expect(isExternalRecipientAllowed(config, "not-an-email")).toBe(false);
    expect(isExternalRecipientAllowed(config, "student@hau.edu.ph\r\nBcc: evil@example.test")).toBe(
      false,
    );
  });

  it("keeps the Brevo webhook disabled by default and requires a secret when enabled", () => {
    expect(loadBrevoWebhookConfig({})).toEqual({ enabled: false, secret: undefined });
    expect(() => loadBrevoWebhookConfig({ BREVO_WEBHOOK_ENABLED: "true" })).toThrow(
      "BREVO_WEBHOOK_SECRET",
    );
  });
});

describe("signer environment", () => {
  it("loads signer service secret-path and public matching metadata", () => {
    expect(
      loadSignerServiceConfig({
        SIGNER_TOKEN: "internal-token",
        SIGNING_PRIVATE_KEY_PATH: "/run/secrets/open-badges-signing-key",
        SIGNING_KEY_ID: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        SIGNING_PUBLIC_MULTIKEY: "z6MkPublic",
        SIGNING_KEY_FINGERPRINT: "z6MkPublic",
      }),
    ).toEqual({
      token: "internal-token",
      runtime: {
        privateKeyPath: "/run/secrets/open-badges-signing-key",
        keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        publicKeyMultibase: "z6MkPublic",
        fingerprint: "z6MkPublic",
      },
    });
  });

  it("loads a bounded signer client timeout", () => {
    expect(
      loadSignerClientConfig({
        SIGNER_URL: "http://signer:3101",
        SIGNER_TOKEN: "internal-token",
        SIGNER_TIMEOUT_MS: "2500",
      }),
    ).toEqual({ baseUrl: "http://signer:3101", token: "internal-token", timeoutMs: 2500 });
    expect(() =>
      loadSignerClientConfig({
        SIGNER_URL: "http://signer:3101",
        SIGNER_TOKEN: "internal-token",
        SIGNER_TIMEOUT_MS: "0",
      }),
    ).toThrow();
  });

  it("requires the web signer endpoint, token, and expected public metadata together", () => {
    expect(
      loadSignerReadinessConfig({
        SIGNER_URL: "http://signer:3101/",
        SIGNER_TOKEN: "internal-token",
        SIGNER_TIMEOUT_MS: "2500",
        SIGNING_KEY_ID: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        SIGNING_CRYPTOSUITE: "eddsa-rdfc-2022",
      }),
    ).toEqual({
      baseUrl: "http://signer:3101",
      token: "internal-token",
      timeoutMs: 2500,
      expectedKeyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
      expectedCryptosuite: "eddsa-rdfc-2022",
    });

    expect(() =>
      loadSignerReadinessConfig({
        SIGNER_URL: "http://signer:3101",
        SIGNER_TOKEN: "internal-token",
        SIGNING_KEY_ID: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
      }),
    ).toThrow();
  });

  it("requires the signer private key to use an absolute secret-file path", () => {
    expect(() =>
      loadSignerServiceConfig({
        SIGNER_TOKEN: "internal-token",
        SIGNING_PRIVATE_KEY_PATH: "open-badges-signing-key.json",
        SIGNING_KEY_ID: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        SIGNING_PUBLIC_MULTIKEY: "z6MkPublic",
        SIGNING_KEY_FINGERPRINT: "z6MkPublic",
      }),
    ).toThrow();
  });
});
