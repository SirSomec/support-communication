interface ReportDigestWorkerRuntimeConfig {
    intervalMs: number;
    limit: number;
    now?: Date;
    once: boolean;
    tenantId?: string;
}
export declare function runReportDigestWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadReportDigestWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): ReportDigestWorkerRuntimeConfig;
export {};
