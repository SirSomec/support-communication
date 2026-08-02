export interface ProactiveDeliveryWorkerRuntimeConfig {
    activeVariants: string[];
    evaluatedAt?: string;
    intervalMs: number;
    limit: number;
    once: boolean;
    traceId?: string;
}
export declare function runProactiveDeliveryWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadProactiveDeliveryWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): ProactiveDeliveryWorkerRuntimeConfig;
