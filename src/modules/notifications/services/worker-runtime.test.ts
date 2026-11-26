import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  runWorkerCycleOnce,
  runWorkerLoop,
  withTimeout,
  WorkerCycleTimeoutError,
  type WorkerRuntimeConfig,
} from "./worker-runtime";

const config: WorkerRuntimeConfig = {
  batchSize: 20,
  claimLeaseSeconds: 120,
  maxAttempts: 5,
  retryBaseDelaySeconds: 60,
  deliveryChannel: "mailpit",
  recipientPolicy: "local",
  externalEnabled: false,
  controlledAcceptanceOnly: false,
  allowlist: [],
  pollIntervalMs: 5_000,
  cycleTimeoutMs: 20,
};

const prisma = {} as PrismaClient;
const smtp = { send: vi.fn() };

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    prisma,
    smtp,
    config,
    isStopping: () => false,
    runCycle: vi.fn().mockResolvedValue({ processed: 0, mailStatus: "ready" as const }),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn(),
    heartbeatTimeoutMs: 20,
    ...overrides,
  };
}

describe("worker runtime", () => {
  it("runs a cycle and records a fresh heartbeat", async () => {
    const deps = dependencies();
    await expect(runWorkerCycleOnce(deps)).resolves.toEqual({
      outcome: "completed",
      processed: 0,
      mailStatus: "ready",
    });
    expect(deps.recordHeartbeat).toHaveBeenCalledWith(prisma, "ready");
    expect(deps.log).toHaveBeenCalledWith("notification.worker.cycle", {
      status: "ready",
      processed: 0,
    });
  });

  it("times out a blocked cycle and records a degraded heartbeat", async () => {
    const deps = dependencies({
      config: { ...config, cycleTimeoutMs: 10 },
      runCycle: vi.fn(() => new Promise(() => undefined)),
    });
    await expect(runWorkerCycleOnce(deps)).resolves.toMatchObject({
      outcome: "timeout",
      errorCategory: "CYCLE_TIMEOUT",
    });
    expect(deps.recordHeartbeat).toHaveBeenCalledWith(prisma, "degraded");
    expect(deps.log).toHaveBeenCalledWith("notification.worker.timeout", {
      status: "degraded",
      errorCategory: "CYCLE_TIMEOUT",
    });
  });

  it("catches a notification-processing exception and records degraded state", async () => {
    const deps = dependencies({
      runCycle: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("database unavailable"), { code: "P2024" })),
    });
    await expect(runWorkerCycleOnce(deps)).resolves.toEqual({
      outcome: "error",
      errorCategory: "P2024",
    });
    expect(deps.recordHeartbeat).toHaveBeenCalledWith(prisma, "degraded");
    expect(deps.log).toHaveBeenCalledWith("notification.worker.error", {
      status: "degraded",
      errorCategory: "P2024",
    });
  });

  it("does not crash when the heartbeat write itself fails", async () => {
    const deps = dependencies({
      recordHeartbeat: vi.fn().mockRejectedValue(new Error("heartbeat database unavailable")),
    });
    await expect(runWorkerCycleOnce(deps)).resolves.toEqual({
      outcome: "error",
      errorCategory: "HEARTBEAT_WRITE_FAILED",
    });
    expect(deps.log).toHaveBeenCalledWith("notification.worker.error", {
      status: "degraded",
      errorCategory: "HEARTBEAT_WRITE_FAILED",
    });
  });

  it("stops gracefully without running a cycle when already stopping", async () => {
    const deps = dependencies({ isStopping: () => true });
    await expect(runWorkerLoop(deps)).resolves.toEqual({ reason: "stopped" });
    expect(deps.runCycle).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith("notification.worker.starting", {
      status: "starting",
    });
    expect(deps.log).toHaveBeenCalledWith("notification.worker.stopped", {
      status: "stopped",
    });
  });

  it("exits on the first timeout without starting a replacement cycle", async () => {
    let settleLateCycle: ((value: { processed: number; mailStatus: "ready" }) => void) | undefined;
    const lateCycle = new Promise<{ processed: number; mailStatus: "ready" }>((resolve) => {
      settleLateCycle = resolve;
    });
    const runCycle = vi
      .fn()
      .mockImplementationOnce(() => lateCycle)
      .mockResolvedValue({ processed: 1, mailStatus: "ready" as const });
    const deps = dependencies({ runCycle });

    await expect(runWorkerLoop(deps)).resolves.toEqual({ reason: "stalled" });
    expect(deps.exit).toHaveBeenCalledWith(70);
    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith("notification.worker.stall_exit", {
      status: "degraded",
      errorCategory: "CYCLE_TIMEOUT",
      consecutiveTimeouts: 1,
    });

    settleLateCycle?.({ processed: 1, mailStatus: "ready" });
    await lateCycle;
    expect(runCycle).toHaveBeenCalledTimes(1);
  });

  it("withTimeout rejects a never-resolving operation", async () => {
    await expect(withTimeout(new Promise(() => undefined), 5)).rejects.toBeInstanceOf(
      WorkerCycleTimeoutError,
    );
  });
});
