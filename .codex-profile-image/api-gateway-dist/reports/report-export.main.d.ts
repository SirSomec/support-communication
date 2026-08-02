interface ReportExportWorkerRuntimeConfig {
    intervalMs: number;
    leaseMs: number;
    limit: number;
    now?: Date;
    once: boolean;
    queue: string;
}
export declare function runReportExportWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadReportExportWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): ReportExportWorkerRuntimeConfig;
export {};
