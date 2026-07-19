import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { describe, it } from "node:test";

describe("production worker health runtime", () => {
  it("exposes an event-loop heartbeat and Prometheus metrics", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [
      "--import",
      "./backend/scripts/worker-health-runtime.mjs",
      "--eval",
      "setInterval(() => undefined, 1000)"
    ], {
      env: {
        ...process.env,
        SERVICE_NAME: "health-contract-worker",
        WORKER_DRAIN_TIMEOUT_MS: "50",
        WORKER_HEALTH_PORT: String(port),
        WORKER_HEARTBEAT_INTERVAL_MS: "50",
        WORKER_HEARTBEAT_STALE_AFTER_MS: "500"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    try {
      const health = await fetchEventually(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual((await health.json()).status, "ok");

      const metrics = await fetchEventually(`http://127.0.0.1:${port}/metrics`);
      assert.equal(metrics.status, 200);
      const body = await metrics.text();
      assert.match(body, /support_worker_up\{service="health-contract-worker"\} 1/);
      assert.match(body, /support_worker_last_heartbeat_seconds/);
    } finally {
      child.kill();
      await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });
});

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}

async function fetchEventually(url) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`worker_health_runtime_not_ready:${url}`);
}
