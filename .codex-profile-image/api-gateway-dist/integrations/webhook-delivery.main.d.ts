interface WebhookDeliveryWorkerRuntimeConfig {
    intervalMs: number;
    leaseTimeoutMs: number;
    limit: number;
    maxAttempts: number;
    once: boolean;
    providerMode: "disabled" | "http" | "local";
    queue: string;
    retryBackoffMs: number;
    timeoutMs: number;
}
export declare function runWebhookDeliveryWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadWebhookDeliveryWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): WebhookDeliveryWorkerRuntimeConfig;
export declare function createWebhookDeliveryProviderFromEnv(source: NodeJS.ProcessEnv, config: WebhookDeliveryWorkerRuntimeConfig): import("./webhook-delivery.worker.js").WebhookDeliveryProvider;
export {};
