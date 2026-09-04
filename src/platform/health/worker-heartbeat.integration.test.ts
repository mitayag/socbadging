import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";

import { recordWorkerHeartbeat } from "./worker-heartbeat";

describe("notification worker heartbeat", () => {
  afterEach(async () => {
    await prisma.operationalHeartbeat.deleteMany({ where: { id: "notification-worker" } });
  });

  it("maintains one current non-secret heartbeat for the worker", async () => {
    await recordWorkerHeartbeat(prisma, "ready", new Date("2026-08-23T08:00:00.000Z"));
    await recordWorkerHeartbeat(prisma, "degraded", new Date("2026-08-23T08:01:00.000Z"));

    await expect(
      prisma.operationalHeartbeat.findMany({ where: { id: "notification-worker" } }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "notification-worker",
        mailStatus: "degraded",
        recordedAt: new Date("2026-08-23T08:01:00.000Z"),
      }),
    ]);
  });
});
