import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { parseLoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
import { createDeterministicDeadLetterReplayBackendStore } from "./dead-letter-replay.worker.js";
import { createReportExportDeadLetterReplayBackendStore, createWebhookDeliveryDeadLetterReplayBackendStore } from "./operations-dead-letter-runtime.backends.js";
import { clearOperationsDeadLetterBackendRegistry, createDefaultOperationsDeadLetterBackendRegistry, useOperationsDeadLetterBackendRegistry } from "./operations-dead-letter-backend.registry.js";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { OperationsRepository } from "./operations.repository.js";
let loadTestRunnerRuntimeConfig = null;
export function configureOperationsRepository(source = process.env, options = {}) {
    const repository = configureRepositoryBootstrap({
        createPrismaRepository: (client) => OperationsRepository.prisma({ client, ...(options.seed ? { seed: options.seed } : {}) }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (configuredRepository) => OperationsRepository.useDefault(configuredRepository)
    });
    loadTestRunnerRuntimeConfig = parseLoadTestRunnerRuntimeConfig(source);
    const registry = createOperationsDeadLetterBackendRegistry(source);
    useOperationsDeadLetterBackendRegistry(registry);
    return repository;
}
export function createOperationsDeadLetterBackendRegistry(source = process.env) {
    const registry = createDefaultOperationsDeadLetterBackendRegistry();
    if (isLocalRuntime(source.NODE_ENV)) {
        registry.register("webhook-delivery", createDeterministicDeadLetterReplayBackendStore());
        registry.register("report-export", createDeterministicDeadLetterReplayBackendStore());
    }
    else {
        registry.register("webhook-delivery", createWebhookDeliveryDeadLetterReplayBackendStore());
        registry.register("report-export", createReportExportDeadLetterReplayBackendStore());
    }
    return registry;
}
export function getLoadTestRunnerRuntimeConfig() {
    return loadTestRunnerRuntimeConfig ?? parseLoadTestRunnerRuntimeConfig();
}
export function clearLoadTestRunnerRuntimeConfig() {
    loadTestRunnerRuntimeConfig = null;
}
export function clearOperationsRuntime() {
    clearLoadTestRunnerRuntimeConfig();
    clearOperationsDeadLetterBackendRegistry();
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map