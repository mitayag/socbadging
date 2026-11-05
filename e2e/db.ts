import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

let client: PrismaClient | null = null;

function connect(): PrismaClient {
  if (client) return client;
  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL or TEST_DATABASE_URL is required for E2E test isolation");
  }
  const url = new URL(databaseUrl);
  client = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
  return client;
}

/**
 * The application rate limiter is intentionally process-global. The combined
 * Playwright run shares one server across the desktop and mobile projects, so
 * fixed-window buckets must be cleared before each test to keep login and
 * public-credential assertions deterministic. This only touches the disposable
 * E2E database selected by E2E_DATABASE_URL (falling back to TEST_DATABASE_URL).
 */
export async function resetE2eRateLimits() {
  await connect().rateLimitBucket.deleteMany({});
}
