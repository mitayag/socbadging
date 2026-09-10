import { beforeEach, describe, expect, it, vi } from "vitest";

const getHealthStatus = vi.fn();
vi.mock("@/platform/health/health", () => ({ getHealthStatus }));

describe("health route", () => {
  beforeEach(() => getHealthStatus.mockReset());

  it("returns 503 only when web readiness is unavailable", async () => {
    getHealthStatus.mockResolvedValue({
      status: "unavailable",
      service: "hau-soc-badging-system",
      readiness: "unavailable",
      database: { status: "unavailable" },
      notifications: { status: "unknown", workerHeartbeat: "missing" },
      signer: { status: "unavailable", keyId: null, cryptosuite: null },
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 200 when email delivery is degraded but the web is ready", async () => {
    getHealthStatus.mockResolvedValue({
      status: "ok",
      service: "hau-soc-badging-system",
      readiness: "ready",
      database: { status: "ready" },
      notifications: { status: "degraded", workerHeartbeat: "fresh" },
      signer: {
        status: "ready",
        keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
        cryptosuite: "eddsa-rdfc-2022",
      },
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
  });

  it("returns 503 when signer readiness is unavailable", async () => {
    getHealthStatus.mockResolvedValue({
      status: "unavailable",
      service: "hau-soc-badging-system",
      readiness: "unavailable",
      database: { status: "ready" },
      notifications: { status: "ready", workerHeartbeat: "fresh" },
      signer: { status: "unavailable", keyId: null, cryptosuite: null },
    });
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(503);
  });
});
