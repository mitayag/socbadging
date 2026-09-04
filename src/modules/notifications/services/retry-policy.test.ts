import { describe, expect, it } from "vitest";

import { calculateNextAttempt, classifySmtpFailure } from "./retry-policy";

describe("SMTP retry policy", () => {
  it("classifies temporary and permanent SMTP failures", () => {
    expect(classifySmtpFailure({ responseCode: 451 })).toBe("TRANSIENT");
    expect(classifySmtpFailure({ responseCode: 550 })).toBe("PERMANENT");
    expect(classifySmtpFailure({ code: "ETIMEDOUT" })).toBe("TRANSIENT");
  });

  it("uses bounded exponential backoff", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(calculateNextAttempt(now, 3, 60, 3600).toISOString()).toBe("2026-08-23T00:04:00.000Z");
  });
});
