import type { RoutingRepository } from "./routing.repository.js";
import { type RoutingWorkerRunSummary } from "./routing-worker.runtime.js";
interface SlaTimerWorkerConfig {
    leaseDurationMs?: number;
    limit: number;
    maxAttempts: number;
    retryBackoffMs: number;
    workerId?: string;
}
export declare function executeSlaTimerWorkerOnce(repository: RoutingRepository, config: SlaTimerWorkerConfig, now?: Date): Promise<RoutingWorkerRunSummary>;
export declare function runSlaTimerWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export {};
