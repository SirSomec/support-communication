interface QuotaExpirationWorkerRuntimeConfig {
    intervalMs: number;
    leaseTimeoutMs: number;
    limit: number;
    now?: Date;
    once: boolean;
}
export declare function runQuotaExpirationWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadQuotaExpirationWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): QuotaExpirationWorkerRuntimeConfig;
export {};
