import type { PrismaClient } from "@prisma/client";

import { recordWorkerHeartbeat } from "@/platform/health/worker-heartbeat";
import { writeStructuredLog } from "@/platform/logging/structured-log";

import { runDeliveryCycle, type DeliveryWorkerConfig } from "./delivery-worker";
import type { SmtpTransport } from "./smtp-client";

export type WorkerRuntimeConfig = DeliveryWorkerConfig & {
  pollIntervalMs: number;
  cycleTimeoutMs: number;
};

export type WorkerCycleOutcome =
  | { outcome: "completed"; processed: number; mailStatus: "ready" | "degraded" }
  | { outcome: "timeout" | "error"; errorCategory: string };

export type WorkerRuntimeDependencies = {
  prisma: PrismaClient;
  smtp: SmtpTransport;
  config: WorkerRuntimeConfig;
  isStopping: () => boolean;
  runCycle?: typeof runDeliveryCycle;
  recordHeartbeat?: typeof recordWorkerHeartbeat;
  log?: typeof writeStructuredLog;
  sleep?: (milliseconds: number) => Promise<void>;
  exit?: (code: number) => void;
  heartbeatTimeoutMs?: number;
};

const defaultHeartbeatTimeoutMs = 5_000;
const stopCheckIntervalMs = 250;

export class WorkerCycleTimeoutError extends Error {
  constructor() {
    super("Notification worker cycle timed out");
    this.name = "WorkerCycleTimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new WorkerCycleTimeoutError()), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorCategory(error: unknown): string {
  return String((error as { code?: unknown }).code ?? "WORKER_ERROR").slice(0, 100);
}

async function recordSafeHeartbeat(
  dependencies: WorkerRuntimeDependencies,
  mailStatus: "ready" | "degraded",
): Promise<boolean> {
  const recordHeartbeat = dependencies.recordHeartbeat ?? recordWorkerHeartbeat;
  try {
    await withTimeout(
      recordHeartbeat(dependencies.prisma, mailStatus),
      dependencies.heartbeatTimeoutMs ?? defaultHeartbeatTimeoutMs,
    );
    return true;
  } catch {
    return false;
  }
}

export async function runWorkerCycleOnce(
  dependencies: WorkerRuntimeDependencies,
): Promise<WorkerCycleOutcome> {
  const runCycle = dependencies.runCycle ?? runDeliveryCycle;
  const log = dependencies.log ?? writeStructuredLog;
  try {
    const result = await withTimeout(
      runCycle(dependencies.prisma, dependencies.smtp, dependencies.config),
      dependencies.config.cycleTimeoutMs,
    );
    const heartbeatWritten = await recordSafeHeartbeat(dependencies, result.mailStatus);
    if (!heartbeatWritten) {
      const category = "HEARTBEAT_WRITE_FAILED";
      log("notification.worker.error", { status: "degraded", errorCategory: category });
      return { outcome: "error", errorCategory: category };
    }
    log("notification.worker.cycle", {
      status: result.mailStatus,
      processed: result.processed,
    });
    return { outcome: "completed", processed: result.processed, mailStatus: result.mailStatus };
  } catch (error) {
    const timedOut = error instanceof WorkerCycleTimeoutError;
    const category = timedOut ? "CYCLE_TIMEOUT" : errorCategory(error);
    await recordSafeHeartbeat(dependencies, "degraded");
    log(timedOut ? "notification.worker.timeout" : "notification.worker.error", {
      status: "degraded",
      errorCategory: category,
    });
    return { outcome: timedOut ? "timeout" : "error", errorCategory: category };
  }
}

async function defaultSleep(milliseconds: number, isStopping: () => boolean): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!isStopping() && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(stopCheckIntervalMs, deadline - Date.now())),
    );
  }
}

export async function runWorkerLoop(
  dependencies: WorkerRuntimeDependencies,
): Promise<{ reason: "stopped" | "stalled" }> {
  const log = dependencies.log ?? writeStructuredLog;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => defaultSleep(milliseconds, dependencies.isStopping));
  const exit = dependencies.exit ?? ((code: number) => process.exit(code));

  log("notification.worker.starting", { status: "starting" });
  while (!dependencies.isStopping()) {
    const result = await runWorkerCycleOnce(dependencies);
    if (result.outcome === "timeout") {
      // A timed-out promise cannot be cancelled reliably. Terminate instead of starting a
      // replacement cycle that could overlap late database work or SMTP delivery.
      log("notification.worker.stall_exit", {
        status: "degraded",
        errorCategory: "CYCLE_TIMEOUT",
        consecutiveTimeouts: 1,
      });
      exit(70);
      return { reason: "stalled" };
    }
    if (dependencies.isStopping()) break;
    await sleep(dependencies.config.pollIntervalMs);
  }
  log("notification.worker.stopped", { status: "stopped" });
  return { reason: "stopped" };
}
