import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/platform/db/prisma";

const WORKER_STALE_AFTER_MS = 5 * 60_000;

export type WorkerHeartbeat = {
  recordedAt: Date;
  mailStatus: "ready" | "degraded";
};

export type HealthDependencies = {
  checkDatabase(): Promise<void>;
  readWorkerHeartbeat(): Promise<WorkerHeartbeat | null>;
};

export type HealthStatus = {
  status: "ok" | "unavailable";
  service: "hau-soc-badging-system";
  readiness: "ready" | "unavailable";
  database: { status: "ready" | "unavailable" };
  notifications: {
    status: "ready" | "degraded" | "unknown";
    workerHeartbeat: "fresh" | "stale" | "missing";
  };
};

const defaultDependencies: HealthDependencies = {
  async checkDatabase() {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  },
  async readWorkerHeartbeat() {
    const rows = await prisma.$queryRaw<
      Array<{ recordedAt: Date; mailStatus: "ready" | "degraded" }>
    >(Prisma.sql`
      SELECT recorded_at AS recordedAt, mail_status AS mailStatus
      FROM operational_heartbeats
      WHERE id = 'notification-worker'
      LIMIT 1
    `);
    return rows[0] ?? null;
  },
};

export async function getHealthStatus(
  dependencies: HealthDependencies = defaultDependencies,
  now = new Date(),
): Promise<HealthStatus> {
  let databaseReady = true;
  try {
    await dependencies.checkDatabase();
  } catch {
    databaseReady = false;
  }

  let heartbeat: WorkerHeartbeat | null = null;
  if (databaseReady) {
    try {
      heartbeat = await dependencies.readWorkerHeartbeat();
    } catch {
      heartbeat = null;
    }
  }

  const heartbeatState = !heartbeat
    ? "missing"
    : now.getTime() - heartbeat.recordedAt.getTime() > WORKER_STALE_AFTER_MS
      ? "stale"
      : "fresh";
  const notificationStatus = !heartbeat
    ? "unknown"
    : heartbeatState === "stale" || heartbeat.mailStatus === "degraded"
      ? "degraded"
      : "ready";

  return {
    status: databaseReady ? "ok" : "unavailable",
    service: "hau-soc-badging-system",
    readiness: databaseReady ? "ready" : "unavailable",
    database: { status: databaseReady ? "ready" : "unavailable" },
    notifications: { status: notificationStatus, workerHeartbeat: heartbeatState },
  };
}
