import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseLoadTestRunnerRuntimeConfig, type LoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
import {
  clearOperationsDeadLetterBackendRegistry,
  createDefaultOperationsDeadLetterBackendRegistry,
  useOperationsDeadLetterBackendRegistry
} from "./operations-dead-letter-backend.registry.js";
import { OperationsRepository } from "./operations.repository.js";

export interface OperationsRepositoryBootstrapSource {
  LOAD_TEST_RUNNER_BASE_URL?: string;
  LOAD_TEST_RUNNER_ENABLED?: string;
  LOAD_TEST_RUNNER_MAX_OPERATIONS?: string;
  LOAD_TEST_RUNNER_TENANT_ID?: string;
  LOAD_TEST_RUNNER_TIMEOUT_MS?: string;
  NODE_ENV?: string;
  OPERATIONS_STORE_FILE?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

let loadTestRunnerRuntimeConfig: LoadTestRunnerRuntimeConfig | null = null;

export function configureOperationsRepository(source: OperationsRepositoryBootstrapSource = process.env): OperationsRepository {
  const repository = OperationsRepository.open({ filePath: resolveOperationsStoreFile(source) });
  OperationsRepository.useDefault(repository);
  loadTestRunnerRuntimeConfig = parseLoadTestRunnerRuntimeConfig(source as Record<string, string | undefined>);
  useOperationsDeadLetterBackendRegistry(createDefaultOperationsDeadLetterBackendRegistry());
  return repository;
}

export function getLoadTestRunnerRuntimeConfig(): LoadTestRunnerRuntimeConfig {
  return loadTestRunnerRuntimeConfig ?? parseLoadTestRunnerRuntimeConfig();
}

export function clearLoadTestRunnerRuntimeConfig(): void {
  loadTestRunnerRuntimeConfig = null;
}

export function clearOperationsRuntime(): void {
  clearLoadTestRunnerRuntimeConfig();
  clearOperationsDeadLetterBackendRegistry();
}

export function resolveOperationsStoreFile(source: OperationsRepositoryBootstrapSource = process.env): string {
  const configuredPath = source.OPERATIONS_STORE_FILE?.trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(source.SERVICE_NAME ?? "api-gateway");
  const nodeEnv = sanitizePathSegment(source.NODE_ENV ?? "development");
  const port = sanitizePathSegment(String(source.PORT ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-operations.json`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}
