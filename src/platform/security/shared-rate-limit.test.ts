import { describe, expect, it } from "vitest";

import { deriveRateLimitKey, getRateLimitPolicy, getWindowBounds } from "./shared-rate-limit";

describe("shared rate-limit policy contracts", () => {
  it("hashes normalized key material without retaining an email, IP address, or public ID", () => {
    const digest = deriveRateLimitKey(
      "login",
      " Faculty.User@Example.edu \u0000203.0.113.42\u0000abcdefghijklmnopqrstuvwxyzABCDEF ",
    );

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain("faculty.user@example.edu");
    expect(digest).not.toContain("203.0.113.42");
    expect(digest).not.toContain("abcdefghijklmnopqrstuvwxyzABCDEF");
    expect(
      deriveRateLimitKey(
        "login",
        " faculty.user@example.edu \u0000203.0.113.42\u0000abcdefghijklmnopqrstuvwxyzABCDEF ",
      ),
    ).toBe(digest);
    expect(
      deriveRateLimitKey(
        "reset",
        "faculty.user@example.edu\u0000203.0.113.42\u0000abcdefghijklmnopqrstuvwxyzABCDEF",
      ),
    ).not.toBe(digest);
  });

  it("uses deterministic fixed-window boundaries", () => {
    const bounds = getWindowBounds(new Date("2026-08-23T12:00:59.999Z"), 60_000);

    expect(bounds).toEqual({
      windowStart: new Date("2026-08-23T12:00:00.000Z"),
      expiresAt: new Date("2026-08-23T12:01:00.000Z"),
    });
  });

  it("defines bounded positive policies for each protected workload", () => {
    for (const name of [
      "login",
      "reset",
      "public-html",
      "public-json",
      "import",
      "export",
      "media",
    ] as const) {
      const policy = getRateLimitPolicy(name);
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.limit).toBeLessThanOrEqual(1_000);
      expect(policy.windowMs).toBeGreaterThanOrEqual(60_000);
      expect(policy.windowMs).toBeLessThanOrEqual(3_600_000);
    }
  });
});
