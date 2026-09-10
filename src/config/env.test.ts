import { describe, expect, it } from "vitest";

import {
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
