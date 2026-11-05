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
  options: { jitterRatio?: number; random?: () => number } = {},
): Date {
  const boundedBase = Math.min(
    maximumDelaySeconds,
    baseDelaySeconds * 2 ** Math.max(0, attemptCount - 1),
  );
  const jitterRatio = Math.max(0, Math.min(0.5, options.jitterRatio ?? 0.2));
  const random = options.random ?? Math.random;
  const jitter = boundedBase * jitterRatio * (random() * 2 - 1);
  const seconds = Math.max(1, Math.min(maximumDelaySeconds, Math.round(boundedBase + jitter)));
  return new Date(now.getTime() + seconds * 1000);
}
