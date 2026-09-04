import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/platform/db/prisma";

export type RateLimitPolicyName =
  "login" | "reset" | "public-html" | "public-json" | "import" | "export" | "media";

type RateLimitPolicy = { limit: number; windowMs: number };

const policies = {
  login: { limit: 10, windowMs: 60_000 },
  reset: { limit: 5, windowMs: 3_600_000 },
  "public-html": { limit: 60, windowMs: 60_000 },
  "public-json": { limit: 60, windowMs: 60_000 },
  import: { limit: 20, windowMs: 60_000 },
  export: { limit: 30, windowMs: 60_000 },
  media: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<RateLimitPolicyName, RateLimitPolicy>;

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  return policies[name];
}

function normalizeKeyMaterial(value: string): string {
  return value
    .split("\u0000")
    .map((part) => part.trim().toLowerCase())
    .join("\u0000");
}

export function deriveRateLimitKey(policy: RateLimitPolicyName, key: string): string {
  return createHash("sha256")
    .update(`hau-soc-rate-limit:v1\u0000${policy}\u0000${normalizeKeyMaterial(key)}`)
    .digest("hex");
}

export function getWindowBounds(now: Date, windowMs: number) {
  const nowMs = now.valueOf();
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error("Invalid rate-limit window");
  }
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  return {
    windowStart: new Date(windowStartMs),
    expiresAt: new Date(windowStartMs + windowMs),
  };
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit({
  policy,
  key,
  now = new Date(),
}: {
  policy: RateLimitPolicyName;
  key: string;
  now?: Date;
}): Promise<RateLimitResult> {
  const definition = getRateLimitPolicy(policy);
  const keyHash = deriveRateLimitKey(policy, key);
  const { windowStart, expiresAt } = getWindowBounds(now, definition.windowMs);
  const id = createHash("sha256")
    .update(`${policy}\u0000${keyHash}\u0000${windowStart.toISOString()}`)
    .digest("hex");

  const requestCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO rate_limit_buckets
        (id, policy, key_hash, window_start, expires_at, request_count, created_at, updated_at)
      VALUES
        (${id}, ${policy}, ${keyHash}, ${windowStart}, ${expiresAt}, 1, ${now}, ${now})
      ON DUPLICATE KEY UPDATE
        request_count = request_count + 1,
        updated_at = VALUES(updated_at)
    `);
    const rows = await tx.$queryRaw<Array<{ request_count: bigint | number }>>(Prisma.sql`
      SELECT request_count
      FROM rate_limit_buckets
      WHERE id = ${id}
      LIMIT 1
    `);
    const value = Number(rows[0]?.request_count);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Rate-limit update failed");
    return value;
  });

  // Cleanup is bounded and deliberately outside the counter transaction. A cleanup scan takes
  // range locks in MariaDB; placing it before concurrent inserts can deadlock otherwise-correct
  // increments. Cleanup is maintenance-only after the request has already been counted.
  await prisma
    .$executeRaw(
      Prisma.sql`
      DELETE FROM rate_limit_buckets
      WHERE expires_at <= ${now}
      ORDER BY expires_at, id
      LIMIT 100
    `,
    )
    .catch(() => undefined);

  const allowed = requestCount <= definition.limit;
  return {
    allowed,
    limit: definition.limit,
    remaining: Math.max(0, definition.limit - requestCount),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((expiresAt.valueOf() - now.valueOf()) / 1000)),
  };
}
