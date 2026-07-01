import {
  resolveDeadLetterQueueOwnership,
  type DeadLetterReplayBackendItem,
  type DeadLetterReplayBackendStore
} from "./dead-letter-replay.worker.js";

export class OperationsDeadLetterBackendRegistry {
  private readonly stores = new Map<string, DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>>();

  register(ownerQueue: string, store: DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>): void {
    this.stores.set(ownerQueue, store);
  }

  resolveForQueueName(queueName: string): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> | undefined {
    const ownership = resolveDeadLetterQueueOwnership(queueName);
    if (!ownership) {
      return undefined;
    }

    return this.stores.get(ownership.ownerQueue);
  }
}

let defaultRegistry: OperationsDeadLetterBackendRegistry | null = null;

export function createDefaultOperationsDeadLetterBackendRegistry(): OperationsDeadLetterBackendRegistry {
  return new OperationsDeadLetterBackendRegistry();
}

export function useOperationsDeadLetterBackendRegistry(registry: OperationsDeadLetterBackendRegistry): void {
  defaultRegistry = registry;
}

export function getOperationsDeadLetterBackendRegistry(): OperationsDeadLetterBackendRegistry {
  return defaultRegistry ?? createDefaultOperationsDeadLetterBackendRegistry();
}

export function clearOperationsDeadLetterBackendRegistry(): void {
  defaultRegistry = null;
}
