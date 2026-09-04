const REDACTED = "[REDACTED]";
const PRIVATE_KEY =
  /(email|password|secret|token|authorization|cookie|message(content|body)?|credentialjson|snapshotjson|recipient(snapshot)?|smtp(username|password)?)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return value.replace(EMAIL, REDACTED);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      PRIVATE_KEY.test(key) ? REDACTED : sanitize(item, seen),
    ]),
  );
}

export function serializeStructuredLog(
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): string {
  const sanitizedFields = sanitize(fields, new WeakSet()) as Record<string, unknown>;
  return JSON.stringify({
    ...sanitizedFields,
    timestamp: new Date().toISOString(),
    event,
  });
}

export function writeStructuredLog(
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  process.stdout.write(`${serializeStructuredLog(event, fields)}\n`);
}
