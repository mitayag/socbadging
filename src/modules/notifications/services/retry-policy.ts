export type SmtpFailureKind = "TRANSIENT" | "PERMANENT";

export function classifySmtpFailure(error: unknown): SmtpFailureKind {
  const value = error as { responseCode?: unknown; code?: unknown };
  if (typeof value?.responseCode === "number") {
    return value.responseCode >= 500 ? "PERMANENT" : "TRANSIENT";
  }
  return "TRANSIENT";
}

export function calculateNextAttempt(
  now: Date,
  attemptCount: number,
  baseDelaySeconds: number,
  maximumDelaySeconds: number,
): Date {
  const seconds = Math.min(
    maximumDelaySeconds,
    baseDelaySeconds * 2 ** Math.max(0, attemptCount - 1),
  );
  return new Date(now.getTime() + seconds * 1000);
}
