import { resolveDeadLetterQueueOwnership } from "./dead-letter-replay.worker.js";
export class OperationsDeadLetterBackendRegistry {
    stores = new Map();
    register(ownerQueue, store) {
        this.stores.set(ownerQueue, store);
    }
    resolveForQueueName(queueName) {
        const ownership = resolveDeadLetterQueueOwnership(queueName);
        if (!ownership) {
            return undefined;
        }
        return this.stores.get(ownership.ownerQueue);
    }
}
let defaultRegistry = null;
export function createDefaultOperationsDeadLetterBackendRegistry() {
    return new OperationsDeadLetterBackendRegistry();
}
export function useOperationsDeadLetterBackendRegistry(registry) {
    defaultRegistry = registry;
}
export function getOperationsDeadLetterBackendRegistry() {
    return defaultRegistry ?? createDefaultOperationsDeadLetterBackendRegistry();
}
export function clearOperationsDeadLetterBackendRegistry() {
    defaultRegistry = null;
}
//# sourceMappingURL=operations-dead-letter-backend.registry.js.map