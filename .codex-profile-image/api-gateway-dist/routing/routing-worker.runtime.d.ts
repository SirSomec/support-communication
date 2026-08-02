export interface RoutingWorkerRuntimeConfig {
    healthPort: number;
    intervalMs: number;
    leaseMs: number;
    once: boolean;
    workerId: string;
}
export interface RoutingWorkerRunSummary {
    applied: number;
    claimed: number;
    deadLettered: number;
    failed: number;
    skipped: number;
}
interface RoutingWorkerRuntimeInput {
    config: RoutingWorkerRuntimeConfig;
    executeOnce: () => Promise<RoutingWorkerRunSummary>;
    serviceName: string;
    signal?: AbortSignal;
}
export declare function runRoutingWorkerRuntime(input: RoutingWorkerRuntimeInput): Promise<void>;
export declare function loadRoutingWorkerRuntimeConfig(source: NodeJS.ProcessEnv, argv: string[], prefix: "RESCUE_RETURN" | "SLA_TIMER"): RoutingWorkerRuntimeConfig;
export declare function installRoutingWorkerShutdownHandlers(controller: AbortController, serviceName: string, target?: Pick<NodeJS.Process, "once" | "removeListener">): () => void;
export declare function positiveInteger(value: string | undefined, fallback: number): number;
export {};
