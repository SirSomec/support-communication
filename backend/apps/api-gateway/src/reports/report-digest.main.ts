import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { configureReportRepository } from "./bootstrap.js";
import { ReportService } from "./report.service.js";
import {
  claimDueScheduledDigestDescriptorsAsync,
  queueScheduledDigestExportJob
} from "./report-digest.worker.js";

interface ReportDigestWorkerRuntimeConfig {
  intervalMs: number;
  limit: number;
  now?: Date;
  once: boolean;
  tenantId?: string;
}

interface ReportDigestWorkerRunResult {
  claimed: number;
  completed: number;
  failed: number;
}

export async function runReportDigestWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadReportDigestWorkerRuntimeConfig(source, argv);
  const reportRepository = configureReportRepository(source);
  const reportService = new ReportService(reportRepository);

  const runOnce = async (): Promise<ReportDigestWorkerRunResult> => {
    const now = config.now ?? new Date();
    const claim = await claimDueScheduledDigestDescriptorsAsync({
      limit: config.limit,
      now,
      reportRepository,
      tenantId: config.tenantId
    });

    let completed = 0;
    let failed = 0;
    for (const descriptor of claim.claimed) {
      const result = await queueScheduledDigestExportJob({
        descriptor,
        now,
        reportRepository,
        reportService
      });
      if (result.descriptor.status === "completed") {
        completed += 1;
      } else {
        failed += 1;
      }
    }

    const result = {
      claimed: claim.claimed.length,
      completed,
      failed
    };
    writeStructuredLog("info", "Report digest worker run completed", {
      ...result,
      operation: "report.digest.run",
      service: "report-digest-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "report-digest-worker"
    }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Report digest worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "report.digest.run",
        service: "report-digest-worker"
      });
    });
  }, config.intervalMs);
}

export function loadReportDigestWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): ReportDigestWorkerRuntimeConfig {
  const now = source.REPORT_DIGEST_WORKER_NOW?.trim();
  return {
    intervalMs: positiveInteger(source.REPORT_DIGEST_WORKER_INTERVAL_MS, 10_000),
    limit: positiveInteger(source.REPORT_DIGEST_WORKER_LIMIT, 10),
    now: now ? new Date(now) : undefined,
    once: argv.includes("--once") || source.REPORT_DIGEST_WORKER_ONCE === "true",
    tenantId: source.REPORT_DIGEST_WORKER_TENANT_ID?.trim() || undefined
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runReportDigestWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Report digest worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "report.digest.bootstrap",
      service: "report-digest-worker"
    });
    process.exitCode = 1;
  });
}
