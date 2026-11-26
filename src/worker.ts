import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { loadEmailDeliveryConfig, loadWorkerConfig } from "./config/env";
import { runWorkerLoop } from "./modules/notifications/services/worker-runtime";
import { createSmtpTransport } from "./modules/notifications/services/smtp-client";

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
      connectTimeout: 10_000,
      acquireTimeout: 15_000,
      idleTimeout: 60_000,
      queryTimeout: 15_000,
      socketTimeout: 30_000,
    }),
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const emailConfig = loadEmailDeliveryConfig(process.env);
const workerConfig = {
  ...loadWorkerConfig(process.env),
  deliveryChannel: emailConfig.mode,
  recipientPolicy: emailConfig.policy,
  externalEnabled: emailConfig.externalEnabled,
  controlledAcceptanceOnly: emailConfig.controlledAcceptanceOnly,
  allowlist: emailConfig.allowlist,
};
const prisma = createWorkerPrisma(databaseUrl);
const smtp = createSmtpTransport(emailConfig.transport);

let stopping = false;
process.once("SIGTERM", () => (stopping = true));
process.once("SIGINT", () => (stopping = true));

try {
  await runWorkerLoop({
    prisma,
    smtp,
    config: workerConfig,
    isStopping: () => stopping,
  });
} finally {
  await prisma.$disconnect();
}
