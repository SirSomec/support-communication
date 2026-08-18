import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:net";
import { describe, it } from "node:test";
import {
  createKnowledgeDocumentIngestionRuntime,
  runKnowledgeDocumentIngestionFromEnv,
  type KnowledgeDocumentIngestionPrismaClient,
  type KnowledgeDocumentIngestionRuntime
} from "../apps/api-gateway/src/knowledge-sources/document-ingestion.main.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

describe("knowledge document ingestion runtime", () => {
  it("reuses one owned Prisma client and stable dependencies across 10,000 polls", async () => {
    const calls = { client: 0, disconnect: 0, processOne: 0, reader: 0, sources: 0, workspace: 0 };
    const sharedClient = {
      $disconnect: async () => { calls.disconnect += 1; }
    } as unknown as KnowledgeDocumentIngestionPrismaClient;
    const reader = { read: async () => new Uint8Array() };
    const sources = KnowledgeSourceRepository.inMemory();
    const workspace = WorkspaceRepository.inMemory();
    const seenDependencies = new Set<unknown>();

    const runtime = await createKnowledgeDocumentIngestionRuntime(
      { DATABASE_URL: "postgresql://worker.invalid/knowledge" },
      {
        createClient: (options) => {
          calls.client += 1;
          assert.equal(options.datasourceUrl, "postgresql://worker.invalid/knowledge");
          return sharedClient;
        },
        createReader: () => { calls.reader += 1; return reader; },
        createSources: (client) => {
          calls.sources += 1;
          assert.equal(client, sharedClient);
          return sources;
        },
        createWorkspace: (client) => {
          calls.workspace += 1;
          assert.equal(client, sharedClient);
          return workspace;
        },
        processOne: async (input) => {
          calls.processOne += 1;
          seenDependencies.add(input.reader);
          seenDependencies.add(input.sources);
          seenDependencies.add(input.workspace);
          return { outcome: "empty" };
        }
      }
    );

    for (let tick = 0; tick < 10_000; tick += 1) {
      assert.deepEqual(await runtime.runOnce(), { outcome: "empty" });
    }

    assert.deepEqual(calls, {
      client: 1,
      disconnect: 0,
      processOne: 10_000,
      reader: 1,
      sources: 1,
      workspace: 1
    });
    assert.deepEqual(seenDependencies, new Set([reader, sources, workspace]));

    await Promise.all([runtime.close(), runtime.close()]);
    assert.equal(calls.disconnect, 1);
  });

  it("runs the initial pass and 1,000 scheduled passes without overlap", async () => {
    const signals = new EventEmitter();
    let active = 0;
    let closes = 0;
    let maxConcurrent = 0;
    let runs = 0;
    let waits = 0;
    let runtimeFactories = 0;
    const runtime: KnowledgeDocumentIngestionRuntime = {
      close: async () => { closes += 1; },
      runOnce: async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        runs += 1;
        await Promise.resolve();
        active -= 1;
        return { outcome: "empty" };
      }
    };

    await runKnowledgeDocumentIngestionFromEnv(
      { KNOWLEDGE_DOCUMENT_INGESTION_INTERVAL_MS: "1" },
      ["node", "worker"],
      {
        createRuntime: async () => { runtimeFactories += 1; return runtime; },
        log: () => undefined,
        processTarget: signals,
        wait: async () => {
          waits += 1;
          if (waits === 1_001) signals.emit("SIGTERM");
        }
      }
    );

    assert.equal(runtimeFactories, 1);
    assert.equal(runs, 1_001);
    assert.equal(waits, 1_001);
    assert.equal(maxConcurrent, 1);
    assert.equal(closes, 1);
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  });

  it("preserves the fixed-rate cadence while skipping deadlines spent busy", async () => {
    const signals = new EventEmitter();
    const delays: number[] = [];
    let clock = 0;
    let runs = 0;

    await runKnowledgeDocumentIngestionFromEnv(
      { KNOWLEDGE_DOCUMENT_INGESTION_INTERVAL_MS: "5000" },
      ["node", "worker"],
      {
        createRuntime: async () => ({
          close: async () => undefined,
          runOnce: async () => {
            runs += 1;
            if (runs > 1) clock += 4_900;
            return { outcome: "empty" };
          }
        }),
        log: () => undefined,
        now: () => clock,
        processTarget: signals,
        wait: async (delayMs) => {
          delays.push(delayMs);
          clock += delayMs;
          if (delays.length === 2) signals.emit("SIGTERM");
        }
      }
    );

    assert.equal(runs, 2);
    assert.deepEqual(delays, [5_000, 100]);
  });

  it("drains an in-flight poll before disconnecting on SIGTERM", async () => {
    const signals = new EventEmitter();
    const started = deferred<void>();
    const release = deferred<void>();
    let closes = 0;
    let settled = false;
    let waits = 0;

    const execution = runKnowledgeDocumentIngestionFromEnv(
      {},
      ["node", "worker"],
      {
        createRuntime: async () => ({
          close: async () => { closes += 1; },
          runOnce: async () => {
            started.resolve();
            await release.promise;
            return { outcome: "empty" };
          }
        }),
        log: () => undefined,
        processTarget: signals,
        wait: async () => { waits += 1; }
      }
    ).finally(() => { settled = true; });

    await started.promise;
    signals.emit("SIGTERM");
    signals.emit("SIGTERM");
    await Promise.resolve();

    assert.equal(settled, false);
    assert.equal(closes, 0);
    assert.equal(waits, 0);

    release.resolve();
    await execution;
    assert.equal(closes, 1);
    assert.equal(waits, 0);
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  });

  it("logs a scheduled failure and continues polling without overlap", async () => {
    const signals = new EventEmitter();
    const logs: Array<{ level: string; message: string }> = [];
    let active = 0;
    let closes = 0;
    let maxConcurrent = 0;
    let runs = 0;
    let waits = 0;

    await runKnowledgeDocumentIngestionFromEnv({}, ["node", "worker"], {
      createRuntime: async () => ({
        close: async () => { closes += 1; },
        runOnce: async () => {
          active += 1;
          maxConcurrent = Math.max(maxConcurrent, active);
          runs += 1;
          try {
            if (runs === 2) throw new Error("scheduled ingestion failed");
            return { outcome: "empty" };
          } finally {
            active -= 1;
          }
        }
      }),
      log: (level, message) => { logs.push({ level, message }); },
      processTarget: signals,
      wait: async () => {
        waits += 1;
        if (waits === 3) signals.emit("SIGTERM");
      }
    });

    assert.equal(runs, 3);
    assert.equal(waits, 3);
    assert.equal(maxConcurrent, 1);
    assert.equal(closes, 1);
    assert.equal(logs.filter((entry) => entry.level === "error").length, 1);
    assert.equal(logs.some((entry) => entry.message === "Knowledge document ingestion failed"), true);
  });

  it("disconnects in once mode and after an initial processing failure", async () => {
    const onceSignals = new EventEmitter();
    let onceCloses = 0;
    let onceRuns = 0;
    let onceWaits = 0;
    await runKnowledgeDocumentIngestionFromEnv({}, ["node", "worker", "--once"], {
      createRuntime: async () => ({
        close: async () => { onceCloses += 1; },
        runOnce: async () => { onceRuns += 1; return { outcome: "empty" }; }
      }),
      log: () => undefined,
      processTarget: onceSignals,
      wait: async () => { onceWaits += 1; }
    });
    assert.deepEqual({ onceCloses, onceRuns, onceWaits }, { onceCloses: 1, onceRuns: 1, onceWaits: 0 });

    const failureSignals = new EventEmitter();
    let failureCloses = 0;
    await assert.rejects(
      runKnowledgeDocumentIngestionFromEnv({}, ["node", "worker"], {
        createRuntime: async () => ({
          close: async () => { failureCloses += 1; },
          runOnce: async () => { throw new Error("initial ingestion failed"); }
        }),
        log: () => undefined,
        processTarget: failureSignals,
        wait: async () => undefined
      }),
      /initial ingestion failed/
    );
    assert.equal(failureCloses, 1);
    assert.equal(failureSignals.listenerCount("SIGINT"), 0);
    assert.equal(failureSignals.listenerCount("SIGTERM"), 0);
  });

  it("disconnects the owned client when dependency bootstrap fails", async () => {
    let disconnects = 0;
    const sharedClient = {
      $disconnect: async () => { disconnects += 1; }
    } as unknown as KnowledgeDocumentIngestionPrismaClient;

    await assert.rejects(
      createKnowledgeDocumentIngestionRuntime(
        { DATABASE_URL: "postgresql://worker.invalid/knowledge" },
        {
          createClient: () => sharedClient,
          createReader: () => { throw new Error("reader bootstrap failed"); }
        }
      ),
      /reader bootstrap failed/
    );
    assert.equal(disconnects, 1);
  });

  it("exits cleanly on SIGTERM with the production health preload", async () => {
    const result = await runHealthPreloadChild({ signal: "SIGTERM" });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.ok(result.durationMs < 5_000);
    assert.match(result.stdout, /WORKER_CLOSED/);
  });

  it("exits cleanly on SIGINT with the production health preload", async () => {
    const result = await runHealthPreloadChild({ signal: "SIGINT" });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.ok(result.durationMs < 5_000);
    assert.match(result.stdout, /WORKER_CLOSED/);
  });

  it("exits with failure after initial processing fails under the health preload", async () => {
    const result = await runHealthPreloadChild({ failInitialRun: true });
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.signal, null);
    assert.ok(result.durationMs < 5_000);
    assert.match(result.stdout, /WORKER_CLOSED/);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve(value?: T): void } {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve: (value?: T) => resolvePromise(value as T)
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}

async function fetchEventually(url: string): Promise<Response> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
  }
  throw new Error(`worker_health_runtime_not_ready:${url}`);
}

async function runHealthPreloadChild(input: {
  failInitialRun?: boolean;
  signal?: "SIGINT" | "SIGTERM";
}): Promise<{
  code: number | null;
  durationMs: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}> {
  const port = await freePort();
  const child = spawn(process.execPath, [
    "--import",
    "./scripts/worker-health-runtime.mjs",
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    [
      'import { runKnowledgeDocumentIngestionProcess } from "./apps/api-gateway/src/knowledge-sources/document-ingestion.main.ts";',
      'process.on("message", (message) => { if (message === "SIGINT" || message === "SIGTERM") process.emit(message); });',
      "await runKnowledgeDocumentIngestionProcess(",
      '  { KNOWLEDGE_DOCUMENT_INGESTION_INTERVAL_MS: "60000" },',
      '  ["node", "worker"],',
      "  { createRuntime: async () => ({",
      '      close: async () => new Promise((resolve) => process.stdout.write("WORKER_CLOSED\\n", resolve)),',
      input.failInitialRun
        ? '      runOnce: async () => { throw new Error("INITIAL_RUN_FAILED"); }'
        : '      runOnce: async () => ({ outcome: "empty" })',
      "    }) }",
      ");"
    ].join("\n")
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SERVICE_NAME: "knowledge-document-ingestion-contract",
      WORKER_DRAIN_TIMEOUT_MS: "40000",
      WORKER_HEALTH_PORT: String(port),
      WORKER_HEARTBEAT_INTERVAL_MS: "50",
      WORKER_HEARTBEAT_STALE_AFTER_MS: "500"
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let stderr = "";
  let stdout = "";
  child.stderr.setEncoding("utf8");
  child.stdout.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  const exitPromise = once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>;

  try {
    if (input.signal) {
      const health = await fetchEventually(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
    }
    const startedAt = Date.now();
    if (input.signal) child.send(input.signal);
    const [code, signal] = await withTimeout(exitPromise, 5_000, "knowledge_worker_exit_timeout");
    return { code, durationMs: Date.now() - startedAt, signal, stderr, stdout };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const forcedExit = once(child, "exit");
      child.kill("SIGKILL");
      await forcedExit;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(errorCode)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolvePromise(value); },
      (error) => { clearTimeout(timer); rejectPromise(error); }
    );
  });
}
