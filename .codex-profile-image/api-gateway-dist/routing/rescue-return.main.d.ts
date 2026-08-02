import type { RoutingRepository } from "./routing.repository.js";
import { type RoutingWorkerRunSummary } from "./routing-worker.runtime.js";
interface RescueReturnWorkerConfig {
    leaseDurationMs?: number;
    limit: number;
    maxAttempts: number;
    retryBackoffMs: number;
    workerId?: string;
}
export declare function executeRescueReturnWorkerOnce(repository: RoutingRepository, config: RescueReturnWorkerConfig, now?: Date): Promise<RoutingWorkerRunSummary>;
export declare function runRescueReturnWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export {};
