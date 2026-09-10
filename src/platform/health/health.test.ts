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
          readSignerHealth: async () => ({
            status: "ready",
            keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
            cryptosuite: "eddsa-rdfc-2022",
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
      signer: {
        status: "ready",
        keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        cryptosuite: "eddsa-rdfc-2022",
      },
    });
  });

  it("reports the web unavailable when database readiness fails", async () => {
    const health = await getHealthStatus(
      {
        checkDatabase: async () => {
          throw new Error("mysql://user:secret@db/private failed");
        },
        readWorkerHeartbeat: async () => null,
        readSignerHealth: async () => null,
      },
      now,
    );

    expect(health).toEqual({
      status: "unavailable",
      service: "hau-soc-badging-system",
      readiness: "unavailable",
      database: { status: "unavailable" },
      notifications: { status: "unknown", workerHeartbeat: "missing" },
      signer: { status: "unavailable", keyId: null, cryptosuite: null },
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
          readSignerHealth: async () => ({
            status: "ready",
            keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
            cryptosuite: "eddsa-rdfc-2022",
          }),
        },
        now,
      ),
    ).resolves.toMatchObject({
      status: "ok",
      readiness: "ready",
      database: { status: "ready" },
      notifications: { status: "degraded", workerHeartbeat: "fresh" },
      signer: { status: "ready" },
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
        readSignerHealth: async () => ({
          status: "ready",
          keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
          cryptosuite: "eddsa-rdfc-2022",
        }),
      },
      now,
    );
    const missing = await getHealthStatus(
      {
        checkDatabase: async () => undefined,
        readWorkerHeartbeat: async () => null,
        readSignerHealth: async () => ({
          status: "ready",
          keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
          cryptosuite: "eddsa-rdfc-2022",
        }),
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

  it("fails web readiness closed when the signer is unavailable without exposing secrets", async () => {
    const health = await getHealthStatus(
      {
        checkDatabase: async () => undefined,
        readWorkerHeartbeat: async () => null,
        readSignerHealth: async () => null,
      },
      now,
    );

    expect(health).toMatchObject({
      status: "unavailable",
      readiness: "unavailable",
      database: { status: "ready" },
      signer: { status: "unavailable", keyId: null, cryptosuite: null },
    });
    expect(JSON.stringify(health)).not.toContain("SIGNER_TOKEN");
    expect(JSON.stringify(health)).not.toContain("PRIVATE_KEY");
    expect(JSON.stringify(health)).not.toContain("/run/secrets");
  });
});
