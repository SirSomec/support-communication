import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureReportRepository } from "./bootstrap.js";
import {
  createReportObjectStoragePort,
  executeReportExportWorkerOnce
} from "./report-export.worker.js";
import { createSharedReportObjectStorage } from "./report-object-storage.js";

interface ReportExportWorkerRuntimeConfig {
  intervalMs: number;
  leaseMs: number;
  limit: number;
  now?: Date;
  once: boolean;
  queue: string;
}

interface ReportExportWorkerRunResult {
  failed: number;
  ready: number;
  scanned: number;
}

export async function runReportExportWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadReportExportWorkerRuntimeConfig(source, argv);
  const reportRepository = configureReportRepository(source);
  const storage = createReportObjectStoragePort(createSharedReportObjectStorage(source, {
    now: () => config.now ?? new Date()
  }));

  const runOnce = async (): Promise<ReportExportWorkerRunResult> => {
    const result = await executeReportExportWorkerOnce({
      leaseMs: config.leaseMs,
      limit: config.limit,
      now: config.now ?? new Date(),
      queue: config.queue,
      reportRepository,
      storage
    });
    writeStructuredLog("info", "Report export worker run completed", {
      ...result,
      operation: "report.export.run",
      queue: config.queue,
      service: "report-export-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "report-export-worker"
    }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Report export worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "report.export.run",
        queue: config.queue,
        service: "report-export-worker"
      });
    });
  }, config.intervalMs);
}

export function loadReportExportWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): ReportExportWorkerRuntimeConfig {
  const now = source.REPORT_EXPORT_WORKER_NOW?.trim();
  return {
    intervalMs: positiveInteger(source.REPORT_EXPORT_WORKER_INTERVAL_MS, 10_000),
    leaseMs: positiveInteger(source.REPORT_EXPORT_WORKER_LEASE_MS, 15 * 60_000),
    limit: positiveInteger(source.REPORT_EXPORT_WORKER_LIMIT, 10),
    now: now ? new Date(now) : undefined,
    once: argv.includes("--once") || source.REPORT_EXPORT_WORKER_ONCE === "true",
    queue: source.REPORT_EXPORT_WORKER_QUEUE?.trim() || "report-export"
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runReportExportWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Report export worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "report.export.bootstrap",
      service: "report-export-worker"
    });
    process.exitCode = 1;
  });
}
