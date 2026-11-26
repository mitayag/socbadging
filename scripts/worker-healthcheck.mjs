import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const maximumAgeMs = 5 * 60_000;
const maximumFutureSkewMs = 30_000;
const databaseSecretPath = "/run/secrets/database_url";
let databaseUrl = process.env.DATABASE_URL;
try {
  const secret = readFileSync(databaseSecretPath, "utf8").trim();
  if (secret) databaseUrl = secret;
} catch (error) {
  if (error?.code !== "ENOENT") {
    process.stderr.write("Unable to load the worker database secret\n");
    process.exit(1);
  }
}

if (!databaseUrl) {
  process.stderr.write("DATABASE_URL is required for the worker healthcheck\n");
  process.exit(1);
}

const url = new URL(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 1,
    connectTimeout: 5_000,
    acquireTimeout: 5_000,
    idleTimeout: 30_000,
    queryTimeout: 5_000,
    socketTimeout: 10_000,
  }),
});

let healthy = false;
let diagnostic = "heartbeat check failed";
try {
  const heartbeat = await prisma.operationalHeartbeat.findUnique({
    where: { id: "notification-worker" },
    select: { recordedAt: true, mailStatus: true },
  });
  const ageMs = heartbeat ? Date.now() - heartbeat.recordedAt.valueOf() : null;
  healthy =
    heartbeat !== null &&
    Number.isFinite(heartbeat.recordedAt.valueOf()) &&
    ageMs !== null &&
    ageMs >= -maximumFutureSkewMs &&
    ageMs <= maximumAgeMs;
  diagnostic = heartbeat
    ? `heartbeat_age_seconds=${Math.floor((ageMs ?? 0) / 1000)} mail_status=${heartbeat.mailStatus}`
    : "heartbeat_missing";
} catch {
  healthy = false;
  diagnostic = "heartbeat_query_failed";
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

if (!healthy) process.stderr.write(`worker healthcheck failed: ${diagnostic}\n`);
process.exit(healthy ? 0 : 1);
