import { createServer } from "node:http";

const port = positiveInteger(process.env.WORKER_HEALTH_PORT, 4110);
const heartbeatIntervalMs = positiveInteger(process.env.WORKER_HEARTBEAT_INTERVAL_MS, 5_000);
const staleAfterMs = positiveInteger(process.env.WORKER_HEARTBEAT_STALE_AFTER_MS, heartbeatIntervalMs * 3);
const drainTimeoutMs = positiveInteger(process.env.WORKER_DRAIN_TIMEOUT_MS, 40_000);
const service = String(process.env.SERVICE_NAME || "worker").trim().slice(0, 128) || "worker";
const startedAt = Date.now();
let lastHeartbeatAt = startedAt;
let draining = false;

const heartbeat = setInterval(() => {
  lastHeartbeatAt = Date.now();
}, heartbeatIntervalMs);
heartbeat.unref();

const server = createServer((request, response) => {
  const now = Date.now();
  const healthy = !draining && now - lastHeartbeatAt <= staleAfterMs;
  response.setHeader("Cache-Control", "no-store");

  if (request.url === "/metrics") {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.end([
      "# HELP support_worker_up Whether the worker event loop heartbeat is healthy.",
      "# TYPE support_worker_up gauge",
      `support_worker_up{service="${prometheusLabel(service)}"} ${healthy ? 1 : 0}`,
      "# HELP support_worker_last_heartbeat_seconds Unix timestamp of the last event loop heartbeat.",
      "# TYPE support_worker_last_heartbeat_seconds gauge",
      `support_worker_last_heartbeat_seconds{service="${prometheusLabel(service)}"} ${Math.floor(lastHeartbeatAt / 1000)}`,
      "# HELP support_worker_process_start_time_seconds Unix timestamp when the worker process started.",
      "# TYPE support_worker_process_start_time_seconds gauge",
      `support_worker_process_start_time_seconds{service="${prometheusLabel(service)}"} ${Math.floor(startedAt / 1000)}`,
      ""
    ].join("\n"));
    return;
  }

  if (request.url !== "/health") {
    response.statusCode = 404;
    response.end("not found");
    return;
  }

  response.statusCode = healthy ? 200 : 503;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    draining,
    lastHeartbeatAt: new Date(lastHeartbeatAt).toISOString(),
    service,
    startedAt: new Date(startedAt).toISOString(),
    status: healthy ? "ok" : "unhealthy"
  }));
});

server.listen(port, "127.0.0.1");
server.on("error", (error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message, operation: "worker.health.listen", service })}\n`);
  process.exitCode = 1;
});

process.once("SIGTERM", () => {
  draining = true;
  clearInterval(heartbeat);
  server.close();
  setTimeout(() => process.exit(0), drainTimeoutMs).unref();
});

function positiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function prometheusLabel(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}
