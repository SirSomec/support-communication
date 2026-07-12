import { createServer, type Server } from "node:http";
import { hostname } from "node:os";
import { writeStructuredLog } from "@support-communication/observability";

export interface RoutingWorkerRuntimeConfig {
  healthPort: number;
  intervalMs: number;
  leaseMs: number;
  once: boolean;
  workerId: string;
}

export interface RoutingWorkerRunSummary {
  applied: number;
  claimed: number;
  deadLettered: number;
  failed: number;
  skipped: number;
}

interface RoutingWorkerRuntimeInput {
  config: RoutingWorkerRuntimeConfig;
  executeOnce: () => Promise<RoutingWorkerRunSummary>;
  serviceName: string;
  signal?: AbortSignal;
}

interface WorkerHealthState {
  lastCompletedAt: string | null;
  lastError: string | null;
  ready: boolean;
  running: boolean;
  stopping: boolean;
}

export async function runRoutingWorkerRuntime(input: RoutingWorkerRuntimeInput): Promise<void> {
  const health: WorkerHealthState = {
    lastCompletedAt: null,
    lastError: null,
    ready: false,
    running: false,
    stopping: false
  };
  const server = input.config.once ? undefined : await startHealthServer(input.config.healthPort, health, input.serviceName);

  try {
    do {
      if (input.signal?.aborted) {
        break;
      }
      health.running = true;
      try {
        const result = await input.executeOnce();
        health.lastCompletedAt = new Date().toISOString();
        health.lastError = null;
        health.ready = true;
        writeStructuredLog("info", "Routing worker run completed", {
          ...result,
          operation: "routing.worker.run",
          service: input.serviceName
        });
      } catch (error) {
        health.lastError = errorMessage(error);
        writeStructuredLog("error", "Routing worker run failed", {
          error: health.lastError,
          operation: "routing.worker.run",
          service: input.serviceName
        });
        if (input.config.once) {
          throw error;
        }
      } finally {
        health.running = false;
      }

      if (input.config.once || input.signal?.aborted) {
        break;
      }
      await abortableDelay(input.config.intervalMs, input.signal);
    } while (!input.signal?.aborted);
  } finally {
    health.stopping = true;
    await closeServer(server);
  }
}

export function loadRoutingWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv,
  argv: string[],
  prefix: "RESCUE_RETURN" | "SLA_TIMER"
): RoutingWorkerRuntimeConfig {
  return {
    healthPort: positiveInteger(source[`${prefix}_WORKER_HEALTH_PORT`], 4110),
    intervalMs: positiveInteger(source[`${prefix}_WORKER_INTERVAL_MS`], 5_000),
    leaseMs: positiveInteger(source[`${prefix}_WORKER_LEASE_MS`], 60_000),
    once: argv.includes("--once") || source[`${prefix}_WORKER_ONCE`] === "true",
    workerId: source[`${prefix}_WORKER_ID`]?.trim() || `${prefix.toLowerCase()}:${hostname()}:${process.pid}`
  };
}

export function installRoutingWorkerShutdownHandlers(
  controller: AbortController,
  serviceName: string,
  target: Pick<NodeJS.Process, "once" | "removeListener"> = process
): () => void {
  const stop = (signal: NodeJS.Signals): void => {
    writeStructuredLog("info", "Routing worker shutdown requested", {
      operation: "routing.worker.shutdown",
      service: serviceName,
      signal
    });
    controller.abort(signal);
  };
  const onSigint = (): void => stop("SIGINT");
  const onSigterm = (): void => stop("SIGTERM");
  target.once("SIGINT", onSigint);
  target.once("SIGTERM", onSigterm);
  return () => {
    target.removeListener("SIGINT", onSigint);
    target.removeListener("SIGTERM", onSigterm);
  };
}

export function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

async function startHealthServer(port: number, health: WorkerHealthState, serviceName: string): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const statusCode = health.ready && !health.stopping ? 200 : 503;
    response.writeHead(statusCode, { "content-type": "application/json" });
    response.end(JSON.stringify({ ...health, service: serviceName }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return server;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, delayMs);
    const onAbort = (): void => done();
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
