import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { loadSmtpConfig, loadWorkerConfig } from "./config/env";
import { runDeliveryCycle } from "./modules/notifications/services/delivery-worker";
import { createSmtpTransport } from "./modules/notifications/services/smtp-client";
import { recordWorkerHeartbeat } from "./platform/health/worker-heartbeat";
import { writeStructuredLog } from "./platform/logging/structured-log";

function createWorkerPrisma(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 5,
    }),
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const smtpConfig = loadSmtpConfig(process.env);
if (!smtpConfig.host || !smtpConfig.from) throw new Error("SMTP_HOST and SMTP_FROM are required");
const workerConfig = loadWorkerConfig(process.env);
const prisma = createWorkerPrisma(databaseUrl);
const smtp = createSmtpTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  from: smtpConfig.from,
  ...(smtpConfig.username ? { username: smtpConfig.username } : {}),
  ...(smtpConfig.password ? { password: smtpConfig.password } : {}),
  ...(smtpConfig.replyTo ? { replyTo: smtpConfig.replyTo } : {}),
});

let stopping = false;
process.once("SIGTERM", () => (stopping = true));
process.once("SIGINT", () => (stopping = true));

while (!stopping) {
  try {
    const result = await runDeliveryCycle(prisma, smtp, workerConfig);
    await recordWorkerHeartbeat(prisma, result.mailStatus);
    writeStructuredLog("notification.worker.cycle", {
      status: result.mailStatus,
      processed: result.processed,
    });
  } catch (error) {
    await recordWorkerHeartbeat(prisma, "degraded").catch(() => undefined);
    writeStructuredLog("notification.worker.error", {
      status: "degraded",
      errorCategory: String((error as { code?: unknown }).code ?? "WORKER_ERROR").slice(0, 100),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, workerConfig.pollIntervalMs));
}
writeStructuredLog("notification.worker.stopped", { status: "stopped" });
await prisma.$disconnect();
