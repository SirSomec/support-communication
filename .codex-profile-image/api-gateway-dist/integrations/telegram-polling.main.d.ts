interface TelegramPollingRuntimeConfig {
    enabled: boolean;
    apiBaseUrl: string;
    ingressMode: "disabled" | "polling" | "webhook";
    intervalMs: number;
    limit: number;
    timeoutMs: number;
}
export declare function runTelegramPollingWorkerFromEnv(source?: NodeJS.ProcessEnv): void;
export declare function loadTelegramPollingRuntimeConfig(source?: NodeJS.ProcessEnv): TelegramPollingRuntimeConfig;
export {};
