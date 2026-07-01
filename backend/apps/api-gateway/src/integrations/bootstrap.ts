import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IntegrationRepository } from "./integration.repository.js";

export interface IntegrationRepositoryBootstrapSource {
  INTEGRATION_STORE_FILE?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export function configureIntegrationRepository(source: IntegrationRepositoryBootstrapSource = process.env): IntegrationRepository {
  const repository = IntegrationRepository.open({ filePath: resolveIntegrationStoreFile(source) });
  IntegrationRepository.useDefault(repository);
  return repository;
}

export function resolveIntegrationStoreFile(source: IntegrationRepositoryBootstrapSource = process.env): string {
  const configuredPath = source.INTEGRATION_STORE_FILE?.trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(source.SERVICE_NAME ?? "api-gateway");
  const nodeEnv = sanitizePathSegment(source.NODE_ENV ?? "development");
  const port = sanitizePathSegment(String(source.PORT ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-integrations.json`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}
