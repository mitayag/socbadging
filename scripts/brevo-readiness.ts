import "dotenv/config";

import { loadBrevoWebhookConfig, loadEmailDeliveryConfig } from "../src/config/env";

function fail(message: string) {
  process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
}

let config: ReturnType<typeof loadEmailDeliveryConfig>;
let webhook: ReturnType<typeof loadBrevoWebhookConfig>;
try {
  config = loadEmailDeliveryConfig(process.env);
  webhook = loadBrevoWebhookConfig(process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : "Email configuration is invalid");
  process.exit(1);
}

const transport = config.transport;
process.stdout.write(
  `${JSON.stringify(
    {
      mode: config.mode,
      policy: config.policy,
      externalEnabled: config.externalEnabled,
      controlledAcceptanceOnly: config.controlledAcceptanceOnly,
      allowlistCount: config.allowlist.length,
      smtpHost: transport.host,
      smtpPort: transport.port,
      smtpSecure: transport.secure,
      requireTls: transport.requireTLS,
      verifyCertificates: transport.tls?.rejectUnauthorized === true,
      smtpUsernameConfigured: Boolean(transport.username),
      smtpPasswordConfigured: Boolean(transport.password),
      senderDomain: transport.from.includes("@")
        ? transport.from.slice(transport.from.lastIndexOf("@") + 1).replace(/>$/, "")
        : null,
      webhookEnabled: webhook.enabled,
      webhookSecretConfigured: Boolean(webhook.secret),
    },
    null,
    2,
  )}\n`,
);

if (config.mode !== "brevo") fail("EMAIL_DELIVERY_MODE must be brevo");
if (!["staging", "production"].includes(config.policy)) {
  fail("EMAIL_RECIPIENT_POLICY must be staging or production");
}
if (!config.externalEnabled) fail("EXTERNAL_EMAIL_ENABLED must be true");
if (transport.port !== 587 || transport.requireTLS !== true) {
  fail("Brevo transport must use port 587 with STARTTLS");
}
if (transport.tls?.rejectUnauthorized !== true)
  fail("TLS certificate verification must be enabled");
if (!transport.username || !transport.password) fail("Brevo SMTP credentials are missing");
if (!transport.from.includes("@")) fail("BREVO_SENDER must be a valid sender identity");
if (config.policy === "staging" && config.allowlist.length !== 1) {
  fail("Staging policy requires exactly one authorized recipient in EXTERNAL_EMAIL_ALLOWLIST");
}
if (config.policy === "production" && config.allowlist.length > 0) {
  process.stderr.write(
    "WARN production policy ignores the allowlist; use staging for an exact-recipient acceptance test\n",
  );
}
if (!webhook.enabled) fail("BREVO_WEBHOOK_ENABLED must be true for production readiness");
if (!webhook.secret) fail("BREVO_WEBHOOK_SECRET is missing");

if (!process.exitCode) {
  process.stdout.write("PASS Brevo configuration preflight passed; no email was sent.\n");
}
