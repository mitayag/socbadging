import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const maximumAgeMs = 5 * 60_000;
const databaseUrl = process.env.DATABASE_URL;

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
  }),
});

let healthy = false;
try {
  const heartbeat = await prisma.operationalHeartbeat.findUnique({
    where: { id: "notification-worker" },
    select: { recordedAt: true },
  });
  healthy =
    heartbeat !== null &&
    Number.isFinite(heartbeat.recordedAt.valueOf()) &&
    Date.now() - heartbeat.recordedAt.valueOf() <= maximumAgeMs;
} catch {
  healthy = false;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

process.exit(healthy ? 0 : 1);
