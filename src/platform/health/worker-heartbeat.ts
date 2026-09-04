import type { PrismaClient } from "@prisma/client";

export async function recordWorkerHeartbeat(
  client: Pick<PrismaClient, "operationalHeartbeat">,
  mailStatus: "ready" | "degraded",
  recordedAt = new Date(),
): Promise<void> {
  await client.operationalHeartbeat.upsert({
    where: { id: "notification-worker" },
    create: { id: "notification-worker", mailStatus, recordedAt },
    update: { mailStatus, recordedAt },
  });
}
