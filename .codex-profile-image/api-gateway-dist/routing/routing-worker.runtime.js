import { createServer } from "node:http";
import { hostname } from "node:os";
import { writeStructuredLog } from "@support-communication/observability";
export async function runRoutingWorkerRuntime(input) {
    const health = {
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
            }
            catch (error) {
                health.lastError = errorMessage(error);
                writeStructuredLog("error", "Routing worker run failed", {
                    error: health.lastError,
                    operation: "routing.worker.run",
                    service: input.serviceName
                });
                if (input.config.once) {
                    throw error;
                }
            }
            finally {
                health.running = false;
            }
            if (input.config.once || input.signal?.aborted) {
                break;
            }
            await abortableDelay(input.config.intervalMs, input.signal);
        } while (!input.signal?.aborted);
    }
    finally {
        health.stopping = true;
        await closeServer(server);
    }
}
export function loadRoutingWorkerRuntimeConfig(source, argv, prefix) {
    return {
        healthPort: positiveInteger(source[`${prefix}_WORKER_HEALTH_PORT`], 4110),
        intervalMs: positiveInteger(source[`${prefix}_WORKER_INTERVAL_MS`], 5_000),
        leaseMs: positiveInteger(source[`${prefix}_WORKER_LEASE_MS`], 60_000),
        once: argv.includes("--once") || source[`${prefix}_WORKER_ONCE`] === "true",
        workerId: source[`${prefix}_WORKER_ID`]?.trim() || `${prefix.toLowerCase()}:${hostname()}:${process.pid}`
    };
}
export function installRoutingWorkerShutdownHandlers(controller, serviceName, target = process) {
    const stop = (signal) => {
        writeStructuredLog("info", "Routing worker shutdown requested", {
            operation: "routing.worker.shutdown",
            service: serviceName,
            signal
        });
        controller.abort(signal);
    };
    const onSigint = () => stop("SIGINT");
    const onSigterm = () => stop("SIGTERM");
    target.once("SIGINT", onSigint);
    target.once("SIGTERM", onSigterm);
    return () => {
        target.removeListener("SIGINT", onSigint);
        target.removeListener("SIGTERM", onSigterm);
    };
}
export function positiveInteger(value, fallback) {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}
async function startHealthServer(port, health, serviceName) {
    const server = createServer((request, response) => {
        if (request.url !== "/health") {
            response.writeHead(404).end();
            return;
        }
        const statusCode = health.ready && !health.stopping ? 200 : 503;
        response.writeHead(statusCode, { "content-type": "application/json" });
        response.end(JSON.stringify({ ...health, service: serviceName }));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
            server.removeListener("error", reject);
            resolve();
        });
    });
    return server;
}
async function closeServer(server) {
    if (!server) {
        return;
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
async function abortableDelay(delayMs, signal) {
    if (signal?.aborted) {
        return;
    }
    await new Promise((resolve) => {
        const timer = setTimeout(done, delayMs);
        const onAbort = () => done();
        function done() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=routing-worker.runtime.js.map