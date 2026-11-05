import { createHmac, randomUUID } from "node:crypto";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const appUrl = required("APP_URL").replace(/\/+$/, "");
const secret = required("BREVO_WEBHOOK_SECRET");
const event = {
  id: argument("id", `local-${randomUUID()}`),
  event: argument("event", "delivered"),
  email: argument(
    "email",
    process.env.CONTROLLED_ACCEPTANCE_RECIPIENT ?? "authorized-test-recipient@example.org",
  ),
  "message-id": argument("message-id", ""),
  date: argument("date", new Date().toISOString()),
  reason: argument("reason", "Local webhook simulation"),
};
const body = JSON.stringify(event);
const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(`${appUrl}/api/webhooks/brevo`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-brevo-signature": signature,
  },
  body,
});
console.log(
  JSON.stringify({
    status: response.status,
    body: await response.json().catch(() => null),
  }),
);
