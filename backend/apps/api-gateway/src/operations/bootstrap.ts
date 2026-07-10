import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
  type PrismaClientFactoryOptions
} from "@support-communication/database";

import { parseLoadTestRunnerRuntimeConfig, type LoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
import { createDeterministicDeadLetterReplayBackendStore } from "./dead-letter-replay.worker.js";

import {

  clearOperationsDeadLetterBackendRegistry,

  createDefaultOperationsDeadLetterBackendRegistry,

  useOperationsDeadLetterBackendRegistry

} from "./operations-dead-letter-backend.registry.js";

import { isLocalRuntime } from "../runtime/local-runtime.js";

import { bootstrapOperationsState } from "./seed.js";

import { OperationsRepository, type PrismaOperationsClient } from "./operations.repository.js";



export interface OperationsRepositoryBootstrapSource {
  DATABASE_URL?: string;

  LOAD_TEST_RUNNER_BASE_URL?: string;

  LOAD_TEST_RUNNER_ENABLED?: string;

  LOAD_TEST_RUNNER_MAX_OPERATIONS?: string;

  LOAD_TEST_RUNNER_TENANT_ID?: string;

  LOAD_TEST_RUNNER_TIMEOUT_MS?: string;

  NODE_ENV?: string;

  OPERATIONS_REPOSITORY?: string;

  OPERATIONS_STORE_FILE?: string;

  PORT?: number | string;

  SERVICE_NAME?: string;

}

export interface OperationsRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOperationsClient;
}



let loadTestRunnerRuntimeConfig: LoadTestRunnerRuntimeConfig | null = null;



export function configureOperationsRepository(
  source: OperationsRepositoryBootstrapSource = process.env,
  options: OperationsRepositoryBootstrapOptions = {}
): OperationsRepository {

  const repository = configureRepositoryBootstrap({
    createJsonRepository: (filePath) => OperationsRepository.open({ filePath, seed: bootstrapOperationsState() }),
    createPrismaRepository: (client) => OperationsRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "OPERATIONS_REPOSITORY",
    source,
    storeFileEnv: "OPERATIONS_STORE_FILE",
    suffix: "operations",
    useDefault: (configuredRepository) => OperationsRepository.useDefault(configuredRepository)
  });


  loadTestRunnerRuntimeConfig = parseLoadTestRunnerRuntimeConfig(source as Record<string, string | undefined>);

  const registry = createDefaultOperationsDeadLetterBackendRegistry();
  if (isLocalRuntime(source.NODE_ENV)) {
    registry.register("webhook-delivery", createDeterministicDeadLetterReplayBackendStore());
    registry.register("report-export", createDeterministicDeadLetterReplayBackendStore());
  }
  useOperationsDeadLetterBackendRegistry(registry);

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
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "OPERATIONS_STORE_FILE",
    suffix: "operations"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOperationsClient {
  return createPrismaClient(options) as PrismaOperationsClient;
}
