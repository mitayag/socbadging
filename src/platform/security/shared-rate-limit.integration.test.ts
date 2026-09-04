import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";
import { consumeRateLimit, deriveRateLimitKey } from "./shared-rate-limit";

describe("shared rate limiting with MariaDB", () => {
  afterEach(async () => {
    await prisma.rateLimitBucket.deleteMany({
      where: {
        keyHash: {
          in: [
            deriveRateLimitKey("login", "concurrent"),
            deriveRateLimitKey("reset", "concurrent"),
            deriveRateLimitKey("login", "boundary"),
            deriveRateLimitKey("login", "expired"),
          ],
        },
      },
    });
  });

  it("atomically enforces the exact boundary across concurrent consumers", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeRateLimit({ policy: "login", key: "concurrent", now }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(2);
    expect(results.map((result) => result.remaining).sort((a, b) => a - b)).toEqual([
      0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("isolates policies and resets exactly at the next fixed window", async () => {
    const startedAt = new Date("2026-08-23T12:00:00.000Z");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await consumeRateLimit({ policy: "login", key: "boundary", now: startedAt });
    }

    await expect(
      consumeRateLimit({
        policy: "login",
        key: "boundary",
        now: new Date("2026-08-23T12:00:59.001Z"),
      }),
    ).resolves.toEqual({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 1 });
    await expect(
      consumeRateLimit({
        policy: "login",
        key: "boundary",
        now: new Date("2026-08-23T12:01:00.000Z"),
      }),
    ).resolves.toEqual({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
    await expect(
      consumeRateLimit({ policy: "reset", key: "concurrent", now: startedAt }),
    ).resolves.toMatchObject({ allowed: true, remaining: 4 });
  });

  it("stores only opaque key digests and performs bounded expired-row cleanup", async () => {
    await consumeRateLimit({
      policy: "login",
      key: "expired",
      now: new Date("2026-08-23T10:00:00.000Z"),
    });
    await consumeRateLimit({
      policy: "login",
      key: "boundary",
      now: new Date("2026-08-23T12:00:00.000Z"),
    });

    const rows = await prisma.rateLimitBucket.findMany({
      where: { policy: "login" },
      select: { keyHash: true },
    });
    expect(rows.every(({ keyHash }) => /^[a-f0-9]{64}$/.test(keyHash))).toBe(true);
    expect(rows.some(({ keyHash }) => keyHash.includes("expired"))).toBe(false);
    expect(
      await prisma.rateLimitBucket.count({
        where: { keyHash: deriveRateLimitKey("login", "expired") },
      }),
    ).toBe(0);
  });
});
