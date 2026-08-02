import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { type LoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
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
export declare function configureOperationsRepository(source?: OperationsRepositoryBootstrapSource, options?: OperationsRepositoryBootstrapOptions): OperationsRepository;
export declare function createOperationsDeadLetterBackendRegistry(source?: Pick<OperationsRepositoryBootstrapSource, "NODE_ENV">): import("./operations-dead-letter-backend.registry.js").OperationsDeadLetterBackendRegistry;
export declare function getLoadTestRunnerRuntimeConfig(): LoadTestRunnerRuntimeConfig;
export declare function clearLoadTestRunnerRuntimeConfig(): void;
export declare function clearOperationsRuntime(): void;
