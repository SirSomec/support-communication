import { type DeadLetterReplayBackendItem, type DeadLetterReplayBackendStore } from "./dead-letter-replay.worker.js";
export declare class OperationsDeadLetterBackendRegistry {
    private readonly stores;
    register(ownerQueue: string, store: DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>): void;
    resolveForQueueName(queueName: string): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> | undefined;
}
export declare function createDefaultOperationsDeadLetterBackendRegistry(): OperationsDeadLetterBackendRegistry;
export declare function useOperationsDeadLetterBackendRegistry(registry: OperationsDeadLetterBackendRegistry): void;
export declare function getOperationsDeadLetterBackendRegistry(): OperationsDeadLetterBackendRegistry;
export declare function clearOperationsDeadLetterBackendRegistry(): void;
