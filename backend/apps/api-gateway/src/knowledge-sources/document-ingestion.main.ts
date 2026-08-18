import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { writeStructuredLog } from "@support-communication/observability";
import { WorkspaceRepository, type PrismaWorkspaceClient } from "../workspace/workspace.repository.js";
import { KnowledgeSourceRepository, type KnowledgeSourcePrismaClient } from "./knowledge-source.repository.js";
import { createObjectStorageDocumentReader } from "./object-storage-document-reader.js";
import {
  processOneKnowledgeDocumentIngestion,
  type KnowledgeObjectReader
} from "./document-ingestion.worker.js";

type KnowledgeDocumentIngestionResult = Awaited<ReturnType<typeof processOneKnowledgeDocumentIngestion>>;

export type KnowledgeDocumentIngestionPrismaClient = KnowledgeSourcePrismaClient & PrismaWorkspaceClient & {
  $disconnect?: () => Promise<void>;
};

export interface KnowledgeDocumentIngestionRuntime {
  close(): Promise<void>;
  runOnce(): Promise<KnowledgeDocumentIngestionResult>;
}

export interface KnowledgeDocumentIngestionRuntimeFactories {
  createClient(options: PrismaClientFactoryOptions): KnowledgeDocumentIngestionPrismaClient;
  createReader(): KnowledgeObjectReader;
  createSources(client: KnowledgeDocumentIngestionPrismaClient): KnowledgeSourceRepository;
  createWorkspace(client: KnowledgeDocumentIngestionPrismaClient): WorkspaceRepository;
  processOne: typeof processOneKnowledgeDocumentIngestion;
}

interface ShutdownSignalTarget {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

export interface KnowledgeDocumentIngestionRunOptions {
  createRuntime?: (
    source: NodeJS.ProcessEnv
  ) => KnowledgeDocumentIngestionRuntime | Promise<KnowledgeDocumentIngestionRuntime>;
  log?: typeof writeStructuredLog;
  now?: () => number;
  processTarget?: ShutdownSignalTarget;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export interface KnowledgeDocumentIngestionProcessOptions extends KnowledgeDocumentIngestionRunOptions {
  exit?: (code: number) => void;
  reportError?: (error: unknown) => void;
}

const defaultRuntimeFactories: KnowledgeDocumentIngestionRuntimeFactories = {
  createClient: (options) => createPrismaClient(options) as KnowledgeDocumentIngestionPrismaClient,
  createReader: createObjectStorageDocumentReader,
  createSources: (client) => KnowledgeSourceRepository.prisma({ client }),
  createWorkspace: (client) => WorkspaceRepository.prisma({ client }),
  processOne: processOneKnowledgeDocumentIngestion
};

/**
 * Owns exactly one Prisma client for the worker process and shares it between
 * both repositories. No global repository defaults are changed, and the topic
 * directory (which ingestion does not use) is never constructed.
 */
export async function createKnowledgeDocumentIngestionRuntime(
  source: NodeJS.ProcessEnv = process.env,
  factories: Partial<KnowledgeDocumentIngestionRuntimeFactories> = {}
): Promise<KnowledgeDocumentIngestionRuntime> {
  const resolvedFactories = { ...defaultRuntimeFactories, ...factories };
  const datasourceUrl = source.DATABASE_URL;
  const client = resolvedFactories.createClient(datasourceUrl ? { datasourceUrl } : {});
  let closePromise: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closePromise ??= Promise.resolve(client.$disconnect?.()).then(() => undefined);
    return closePromise;
  };

  try {
    const reader = resolvedFactories.createReader();
    const sources = resolvedFactories.createSources(client);
    const workspace = resolvedFactories.createWorkspace(client);

    return {
      close,
      runOnce: () => resolvedFactories.processOne({ reader, sources, workspace })
    };
  } catch (error) {
    try {
      await close();
    } finally {
      throw error;
    }
  }
}

/**
 * Runs one ingestion at a time. A shutdown signal aborts the next delay, waits
 * for the in-flight claim to finish, and only then disconnects the shared DB
 * client. This keeps claimed jobs from being abandoned until their lease ends.
 */
export async function runKnowledgeDocumentIngestionFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  options: KnowledgeDocumentIngestionRunOptions = {}
): Promise<void> {
  const once = argv.includes("--once") || source.KNOWLEDGE_DOCUMENT_INGESTION_ONCE === "true";
  const intervalMs = positive(source.KNOWLEDGE_DOCUMENT_INGESTION_INTERVAL_MS, 5_000);
  const controller = new AbortController();
  const log = options.log ?? writeStructuredLog;
  const now = options.now ?? (() => performance.now());
  const processTarget = options.processTarget ?? process;
  const wait = options.wait ?? abortableDelay;
  const stop = (): void => {
    if (controller.signal.aborted) return;
    log("info", "Knowledge document ingestion shutdown requested", {
      service: "knowledge-document-ingestion-worker"
    });
    controller.abort();
  };

  processTarget.once("SIGINT", stop);
  processTarget.once("SIGTERM", stop);

  let runtime: KnowledgeDocumentIngestionRuntime | undefined;
  let nextRunAt: number | undefined;
  try {
    runtime = await (options.createRuntime ?? createKnowledgeDocumentIngestionRuntime)(source);

    while (!controller.signal.aborted) {
      if (nextRunAt !== undefined) {
        await wait(Math.max(0, nextRunAt - now()), controller.signal);
        if (controller.signal.aborted) return;
      }

      const initialAttempt = nextRunAt === undefined;
      try {
        const result = await runtime.runOnce();
        if (once) {
          console.log(JSON.stringify({ result, service: "knowledge-document-ingestion-worker" }));
          return;
        }
        if (!initialAttempt) {
          log("info", "Knowledge document ingestion completed", {
            ...result,
            service: "knowledge-document-ingestion-worker"
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (initialAttempt || once) throw error;
        log("error", "Knowledge document ingestion failed", {
          error: error instanceof Error ? error.message : String(error),
          service: "knowledge-document-ingestion-worker"
        });
      }

      if (controller.signal.aborted) return;
      const completedAt = now();
      if (nextRunAt === undefined) {
        nextRunAt = completedAt + intervalMs;
      } else {
        do {
          nextRunAt += intervalMs;
        } while (nextRunAt <= completedAt);
      }
    }
  } finally {
    processTarget.removeListener("SIGINT", stop);
    processTarget.removeListener("SIGTERM", stop);
    await runtime?.close();
  }
}

/**
 * Process entry point. Explicit exit is intentional: the production health
 * preload owns a listening HTTP server, so merely setting exitCode would leave
 * a failed worker alive and reporting healthy after its runtime has stopped.
 */
export async function runKnowledgeDocumentIngestionProcess(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  options: KnowledgeDocumentIngestionProcessOptions = {}
): Promise<void> {
  const {
    exit = (code: number) => process.exit(code),
    reportError = (error: unknown) => console.error(error),
    ...runOptions
  } = options;

  try {
    await runKnowledgeDocumentIngestionFromEnv(source, argv, runOptions);
    exit(0);
  } catch (error) {
    reportError(error);
    exit(1);
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolveDelay) => {
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });

    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolveDelay();
    }
  });
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runKnowledgeDocumentIngestionProcess();
}
