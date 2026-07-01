import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AutomationRepository } from "./automation.repository.js";

export interface AutomationRepositoryBootstrapSource {
  AUTOMATION_STORE_FILE?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export function configureAutomationRepository(source: AutomationRepositoryBootstrapSource = process.env): AutomationRepository {
  const repository = AutomationRepository.open({ filePath: resolveAutomationStoreFile(source) });
  AutomationRepository.useDefault(repository);
  return repository;
}

export function resolveAutomationStoreFile(source: AutomationRepositoryBootstrapSource = process.env): string {
  const configuredPath = source.AUTOMATION_STORE_FILE?.trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(source.SERVICE_NAME ?? "api-gateway");
  const nodeEnv = sanitizePathSegment(source.NODE_ENV ?? "development");
  const port = sanitizePathSegment(String(source.PORT ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-automation.json`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}
