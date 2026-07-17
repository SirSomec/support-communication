import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";

import { parseLoadTestRunnerRuntimeConfig, type LoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
import { createDeterministicDeadLetterReplayBackendStore } from "./dead-letter-replay.worker.js";
import {
  createReportExportDeadLetterReplayBackendStore,
  createWebhookDeliveryDeadLetterReplayBackendStore
} from "./operations-dead-letter-runtime.backends.js";

import {

  clearOperationsDeadLetterBackendRegistry,

  createDefaultOperationsDeadLetterBackendRegistry,

  useOperationsDeadLetterBackendRegistry

} from "./operations-dead-letter-backend.registry.js";

import { isLocalRuntime } from "../runtime/local-runtime.js";

import { OperationsRepository, type OperationsState, type PrismaOperationsClient } from "./operations.repository.js";



export interface OperationsRepositoryBootstrapSource {
  DATABASE_URL?: string;

  LOAD_TEST_RUNNER_BASE_URL?: string;

  LOAD_TEST_RUNNER_ENABLED?: string;

  LOAD_TEST_RUNNER_MAX_OPERATIONS?: string;

  LOAD_TEST_RUNNER_TENANT_ID?: string;

  LOAD_TEST_RUNNER_TIMEOUT_MS?: string;

  NODE_ENV?: string;

  PORT?: number | string;

  SERVICE_NAME?: string;

}

export interface OperationsRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOperationsClient;
  seed?: OperationsState;
}



let loadTestRunnerRuntimeConfig: LoadTestRunnerRuntimeConfig | null = null;



export function configureOperationsRepository(
  source: OperationsRepositoryBootstrapSource = process.env,
  options: OperationsRepositoryBootstrapOptions = {}
): OperationsRepository {

  const repository = configureRepositoryBootstrap({
    createPrismaRepository: (client) => OperationsRepository.prisma({ client, ...(options.seed ? { seed: options.seed } : {}) }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (configuredRepository) => OperationsRepository.useDefault(configuredRepository)
  });


  loadTestRunnerRuntimeConfig = parseLoadTestRunnerRuntimeConfig(source as Record<string, string | undefined>);

  const registry = createOperationsDeadLetterBackendRegistry(source);
  useOperationsDeadLetterBackendRegistry(registry);

  return repository;

}

export function createOperationsDeadLetterBackendRegistry(
  source: Pick<OperationsRepositoryBootstrapSource, "NODE_ENV"> = process.env
) {
  const registry = createDefaultOperationsDeadLetterBackendRegistry();
  if (isLocalRuntime(source.NODE_ENV)) {
    registry.register("webhook-delivery", createDeterministicDeadLetterReplayBackendStore());
    registry.register("report-export", createDeterministicDeadLetterReplayBackendStore());
  } else {
    registry.register("webhook-delivery", createWebhookDeliveryDeadLetterReplayBackendStore());
    registry.register("report-export", createReportExportDeadLetterReplayBackendStore());
  }
  return registry;
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



function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOperationsClient {
  return createPrismaClient(options) as PrismaOperationsClient;
}
