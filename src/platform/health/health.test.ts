import { describe, expect, it } from "vitest";

import { getHealthStatus } from "./health";

const now = new Date("2026-08-23T08:00:00.000Z");

describe("getHealthStatus", () => {
  it("reports web readiness when the database is ready and worker heartbeat is fresh", async () => {
    await expect(
      getHealthStatus(
        {
          checkDatabase: async () => undefined,
          readWorkerHeartbeat: async () => ({
            recordedAt: new Date("2026-08-23T07:59:30.000Z"),
            mailStatus: "ready",
          }),
        },
        now,
      ),
    ).resolves.toEqual({
      status: "ok",
      service: "hau-soc-badging-system",
      readiness: "ready",
      database: { status: "ready" },
      notifications: { status: "ready", workerHeartbeat: "fresh" },
    });
  });

  it("reports the web unavailable when database readiness fails", async () => {
    const health = await getHealthStatus(
      {
        checkDatabase: async () => {
          throw new Error("mysql://user:secret@db/private failed");
        },
        readWorkerHeartbeat: async () => null,
      },
      now,
    );

    expect(health).toEqual({
      status: "unavailable",
      service: "hau-soc-badging-system",
      readiness: "unavailable",
      database: { status: "unavailable" },
      notifications: { status: "unknown", workerHeartbeat: "missing" },
    });
    expect(JSON.stringify(health)).not.toContain("secret");
    expect(JSON.stringify(health)).not.toContain("mysql");
  });

  it("keeps web readiness available while exposing degraded SMTP delivery", async () => {
    await expect(
      getHealthStatus(
        {
          checkDatabase: async () => undefined,
          readWorkerHeartbeat: async () => ({
            recordedAt: new Date("2026-08-23T07:59:45.000Z"),
            mailStatus: "degraded",
          }),
        },
        now,
      ),
    ).resolves.toMatchObject({
      status: "ok",
      readiness: "ready",
      database: { status: "ready" },
      notifications: { status: "degraded", workerHeartbeat: "fresh" },
    });
  });

  it("reports stale and missing worker heartbeat without failing web readiness", async () => {
    const stale = await getHealthStatus(
      {
        checkDatabase: async () => undefined,
        readWorkerHeartbeat: async () => ({
          recordedAt: new Date("2026-08-23T07:54:59.000Z"),
          mailStatus: "ready",
        }),
      },
      now,
    );
    const missing = await getHealthStatus(
      {
        checkDatabase: async () => undefined,
        readWorkerHeartbeat: async () => null,
      },
      now,
    );

    expect(stale).toMatchObject({
      status: "ok",
      notifications: { status: "degraded", workerHeartbeat: "stale" },
    });
    expect(missing).toMatchObject({
      status: "ok",
      notifications: { status: "unknown", workerHeartbeat: "missing" },
    });
  });
});
