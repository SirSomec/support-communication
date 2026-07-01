import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ReportRepository } from "./report.repository.js";

export interface ReportRepositoryBootstrapSource {
  NODE_ENV?: string;
  PORT?: number | string;
  REPORT_STORE_FILE?: string;
  SERVICE_NAME?: string;
}

export function configureReportRepository(source: ReportRepositoryBootstrapSource = process.env): ReportRepository {
  const repository = ReportRepository.open({ filePath: resolveReportStoreFile(source) });
  ReportRepository.useDefault(repository);
  return repository;
}

export function resolveReportStoreFile(source: ReportRepositoryBootstrapSource = process.env): string {
  const configuredPath = source.REPORT_STORE_FILE?.trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(source.SERVICE_NAME ?? "api-gateway");
  const nodeEnv = sanitizePathSegment(source.NODE_ENV ?? "development");
  const port = sanitizePathSegment(String(source.PORT ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-reports.json`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}
